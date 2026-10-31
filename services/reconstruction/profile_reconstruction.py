"""Profile per-stage memory of the official SAM 3D Body pipeline on one authorized photo.

`resident` reproduces `reconstruct.py`: the ViTDet detector stays loaded while SAM 3D Body loads
and runs. `release-detector` runs detection, keeps only the CPU bounding boxes, deletes the
detector, verifies its CUDA allocations are gone, then loads SAM 3D Body and passes the saved boxes
through the official `process_one_image(bboxes=...)` path, which is the same code path the estimator
uses after its own internal detection. Outputs use the `reconstruct.py` schema plus memory stages.
"""
from __future__ import annotations

import argparse
import gc
import json
import resource
import shutil
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

from reconstruct import (
    PROJECT,
    UPSTREAM,
    ReconstructionError,
    infer,
    require_assets,
    require_cuda,
    sha256,
    validate_detection,
    validate_image,
)

MODES = ("resident", "release-detector")
RELEASE_TOLERANCE_BYTES = 1024 * 1024


def host_rss_bytes() -> int:
    with open("/proc/self/status", encoding="ascii") as status:
        for line in status:
            if line.startswith("VmRSS:"):
                return int(line.split()[1]) * 1024
    raise ReconstructionError("Could not read process resident memory from /proc/self/status.")


class StageRecorder:
    """Records allocator, device and host memory at the end of each stage; peaks reset per stage."""

    def __init__(self, torch_module: Any) -> None:
        self.torch = torch_module
        self.started = time.perf_counter()
        self.stage_started = self.started
        self.stages: list[dict[str, Any]] = []

    def begin(self) -> None:
        self.torch.cuda.synchronize()
        self.torch.cuda.reset_peak_memory_stats()
        self.stage_started = time.perf_counter()

    def end(self, name: str, **extra: Any) -> dict[str, Any]:
        cuda = self.torch.cuda
        cuda.synchronize()
        free, total = cuda.mem_get_info()
        now = time.perf_counter()
        record = {
            "stage": name,
            "seconds": now - self.stage_started,
            "elapsed_seconds": now - self.started,
            "allocated_bytes": cuda.memory_allocated(),
            "reserved_bytes": cuda.memory_reserved(),
            "stage_peak_allocated_bytes": cuda.max_memory_allocated(),
            "stage_peak_reserved_bytes": cuda.max_memory_reserved(),
            "device_used_bytes": total - free,
            "device_total_bytes": total,
            "host_rss_bytes": host_rss_bytes(),
            "host_peak_rss_bytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024,
            **extra,
        }
        self.stages.append(record)
        print(json.dumps(record), flush=True)
        return record


def profile(mode: str, input_path: Path, output_path: Path, checkpoint_dir: Path, detector_dir: Path, preview: bool) -> None:
    image = validate_image(input_path)
    checkpoint, mhr = require_assets(checkpoint_dir, detector_dir)
    output_root = (PROJECT / "outputs").resolve()
    output_path = output_path.resolve()
    if output_root not in output_path.parents:
        raise ReconstructionError("Output directory must be inside the ignored project outputs directory.")
    if output_path.exists():
        raise ReconstructionError(f"Output already exists; choose a new directory: {output_path}")
    try:
        import cv2
        import numpy as np
        import torch
    except ImportError as exc:
        raise ReconstructionError(f"The isolated SAM 3D Body environment is missing a dependency: {exc}") from exc
    device = require_cuda(torch)
    torch.cuda.set_device(0)
    sys.path.insert(0, str(UPSTREAM))
    try:
        from sam_3d_body import SAM3DBodyEstimator, load_sam_3d_body
        from tools.build_detector import HumanDetector
        from tools.vis_utils import visualize_sample_together
    except ImportError as exc:
        raise ReconstructionError(f"Unable to import the official model dependencies: {exc}") from exc
    rgb = np.asarray(image)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    recorder = StageRecorder(torch)
    try:
        recorder.begin()
        # Initialize cuBLAS too: its per-process workspace (8,519,680 bytes by default) is allocated on the
        # first matmul and persists, so it belongs in the baseline rather than in "detector leftovers".
        probe = torch.ones((8, 8), device=device)
        torch.nn.functional.linear(probe, probe, probe[0])
        del probe
        context = recorder.end("cuda_context")

        recorder.begin()
        detector: Any = HumanDetector(name="vitdet", device=device, path=str(detector_dir))
        loaded = recorder.end("detector_load")

        recorder.begin()
        boxes = detector.run_human_detection(bgr, det_cat_id=0, bbox_thr=0.8, nms_thr=0.3, default_to_full_image=False)
        boxes, warnings = validate_detection(boxes, image.width, image.height)
        recorder.end("detection", boxes=np.asarray(boxes).tolist())

        if mode == "release-detector":
            recorder.begin()
            del detector
            gc.collect()
            torch.cuda.empty_cache()
            released = recorder.end("detector_release")
            leftover = released["allocated_bytes"] - context["allocated_bytes"]
            if leftover > RELEASE_TOLERANCE_BYTES:
                raise ReconstructionError(f"Detector release left {leftover} bytes allocated; live references remain.")
            warnings.append(f"Detector released before SAM load; {leftover} bytes above the CUDA-context baseline remained allocated.")
        else:
            warnings.append(f"Detector stayed resident ({loaded['allocated_bytes']} bytes allocated) during SAM load and inference.")

        recorder.begin()
        model, config = load_sam_3d_body(str(checkpoint), device=device, mhr_path=str(mhr))
        estimator = SAM3DBodyEstimator(sam_3d_body_model=model, model_cfg=config)
        recorder.end("sam_load")

        recorder.begin()
        outputs = infer(estimator, rgb, boxes)
        inference = recorder.end("inference")
    except ReconstructionError:
        raise
    except torch.OutOfMemoryError as exc:
        stage = len(recorder.stages)
        raise ReconstructionError(f"CUDA out of memory after {stage} completed stages: {exc}") from exc
    except Exception as exc:
        raise ReconstructionError(f"Detection or model stage failed: {type(exc).__name__}: {exc}") from exc

    result = outputs[0]
    arrays: dict[str, Any] = {}
    absent: list[str] = []
    for key, value in result.items():
        if value is None:
            absent.append(key)
            continue
        array = np.asarray(value)
        if array.dtype.kind not in "biuf" or not np.isfinite(array).all():
            raise ReconstructionError(f"Model output {key!r} is not a finite numeric array.")
        arrays[key] = array
    faces = np.asarray(estimator.faces)
    vertices = arrays.get("pred_vertices")
    if vertices is None or vertices.ndim != 2 or vertices.shape[1] != 3 or faces.ndim != 2 or int(faces.max()) >= len(vertices):
        raise ReconstructionError("Model returned invalid mesh geometry or topology.")
    arrays["mesh_faces"] = faces

    rendered = None
    if preview:
        recorder.begin()
        try:
            rendered = visualize_sample_together(bgr, outputs, estimator.faces)
        except Exception as exc:
            raise ReconstructionError(f"Official visualization failed: {exc}") from exc
        recorder.end("visualization")

    metadata = {
        "schema_version": 1,
        "profile_mode": mode,
        "model_family": "SAM 3D Body",
        "input_sha256": sha256(input_path),
        "checkpoint_sha256": sha256(checkpoint),
        "detector_sha256": sha256(detector_dir / "model_final_f05665.pkl"),
        "device": device,
        "gpu_name": torch.cuda.get_device_name(0),
        "torch_version": str(torch.__version__),
        "torch_cuda_version": torch.version.cuda,
        "input_dimensions": {"width": image.width, "height": image.height},
        "inference_seconds": inference["seconds"],
        "peak_gpu_allocated_bytes": max(stage["stage_peak_allocated_bytes"] for stage in recorder.stages),
        "peak_gpu_reserved_bytes": max(stage["stage_peak_reserved_bytes"] for stage in recorder.stages),
        "memory_stages": recorder.stages,
        "warnings": warnings,
        "absent_fields": absent,
        "arrays": {name: {"shape": list(value.shape), "dtype": str(value.dtype)} for name, value in arrays.items()},
        "interpretation": "Model-estimated body mesh; not an exact digital twin.",
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=".sam3d-profile-", dir=output_path.parent))
    try:
        np.savez_compressed(temporary / "reconstruction.npz", **arrays)
        (temporary / "metadata.json").write_text(json.dumps(metadata, indent=2, allow_nan=False), encoding="utf-8")
        if rendered is not None and not cv2.imwrite(str(temporary / "preview.png"), np.clip(rendered, 0, 255).astype(np.uint8)):
            raise ReconstructionError("Failed to write visualization preview.")
        temporary.rename(output_path)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    print(f"Profiled reconstruction saved to {output_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--mode", choices=MODES, required=True)
    parser.add_argument("--input", type=Path, required=True, help="Photo you have permission to process")
    parser.add_argument("--output", type=Path, required=True, help="New directory inside outputs/")
    parser.add_argument("--checkpoint-dir", type=Path, required=True)
    parser.add_argument("--detector-dir", type=Path, required=True)
    parser.add_argument("--no-preview", action="store_true", help="Skip the official CPU/EGL preview render")
    args = parser.parse_args()
    try:
        profile(args.mode, args.input, args.output, args.checkpoint_dir, args.detector_dir, not args.no_preview)
    except ReconstructionError as exc:
        print(f"Profile error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
