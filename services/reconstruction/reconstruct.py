"""Run the official SAM 3D Body estimator on one authorized local photo."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

PROJECT = Path(__file__).resolve().parents[2]
UPSTREAM = PROJECT / "external" / "sam-3d-body"
DEFAULT_CHECKPOINT = PROJECT / "external" / "checkpoints" / "sam-3d-body-dinov3"
DEFAULT_DETECTOR = PROJECT / "external" / "checkpoints" / "vitdet"
SUPPORTED = {".jpg", ".jpeg", ".jfif", ".png", ".webp", ".bmp", ".tif", ".tiff"}


class ReconstructionError(Exception):
    """A stage failed; no reconstruction was published."""


def validate_image(path: Path) -> Any:
    if path.suffix.lower() not in SUPPORTED:
        raise ReconstructionError("Unsupported image format; use JPEG/JFIF, PNG, WebP, BMP, or TIFF.")
    if not path.is_file():
        raise ReconstructionError(f"Input image does not exist: {path}")
    try:
        from PIL import Image, ImageOps, ImageStat, UnidentifiedImageError
    except ImportError as exc:
        raise ReconstructionError("Pillow is required to validate images in the isolated environment.") from exc
    try:
        with Image.open(path) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            image.load()
            if image.width < 256 or image.height < 384:
                raise ReconstructionError("Image is too small: use at least 256 × 384 pixels with a visible full body.")
            stats = ImageStat.Stat(image.convert("L"))
            if stats.stddev[0] < 2:
                raise ReconstructionError("Image has almost no visible contrast; use a clear, well-lit photograph.")
            return image.copy()
    except ReconstructionError:
        raise
    except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise ReconstructionError("Image cannot be decoded; provide a valid, non-corrupt photograph.") from exc


def require_assets(checkpoint_dir: Path, detector_dir: Path) -> tuple[Path, Path]:
    checkpoint, config = checkpoint_dir / "model.ckpt", checkpoint_dir / "model_config.yaml"
    mhr = checkpoint_dir / "assets" / "mhr_model.pt"
    for path in (checkpoint, config, mhr):
        if not path.is_file():
            raise ReconstructionError(f"Missing official checkpoint asset: {path}. Request Hugging Face access and download the complete snapshot.")
    detector = detector_dir / "model_final_f05665.pkl"
    if not detector.is_file():
        raise ReconstructionError(f"Missing official ViTDet weights: {detector}. See the SAM 3D setup documentation.")
    return checkpoint, mhr


def require_cuda(torch_module: Any) -> str:
    if not torch_module.cuda.is_available():
        raise ReconstructionError("CUDA is unavailable in PyTorch. This upstream estimator currently sends batches to CUDA; CPU inference is not supported by this adapter.")
    return "cuda:0"


def validate_detection(boxes: Any, width: int, height: int) -> tuple[Any, list[str]]:
    if len(boxes) != 1:
        raise ReconstructionError(f"Expected exactly one detected person; found {len(boxes)}. Use a clear single-person photo.")
    box = boxes[0]
    if len(box) != 4 or not all(math.isfinite(float(v)) for v in box):
        raise ReconstructionError("Person detector returned an invalid bounding box.")
    x1, y1, x2, y2 = (float(v) for v in box)
    if not (0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height):
        raise ReconstructionError("Person detector returned a bounding box outside the image.")
    if (y2 - y1) / height < 0.45:
        raise ReconstructionError("Detected person is too small in the frame. Use a closer full-body photo.")
    if x1 <= 1 or y1 <= 1 or x2 >= width - 1 or y2 >= height - 1:
        raise ReconstructionError("The detected person touches an image edge and may be cropped. Leave space around the full body.")
    return boxes, ["Detection and bounding-box checks cannot verify that every body part is visible or unoccluded.", "Camera intrinsics use the upstream default FOV; no camera calibration was supplied."]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def infer(estimator: Any, rgb: Any, boxes: Any) -> list[dict[str, Any]]:
    try:
        result = estimator.process_one_image(rgb, bboxes=boxes, inference_type="full")
    except Exception as exc:
        raise ReconstructionError(f"SAM 3D Body inference failed: {exc}") from exc
    if not isinstance(result, list) or len(result) != 1 or not isinstance(result[0], dict):
        raise ReconstructionError("SAM 3D Body did not return exactly one person result.")
    return result


def reconstruct(input_path: Path, output_path: Path, checkpoint_dir: Path, detector_dir: Path) -> None:
    image = validate_image(input_path)
    checkpoint, mhr = require_assets(checkpoint_dir, detector_dir)
    if not UPSTREAM.is_dir():
        raise ReconstructionError(f"Official source checkout is missing: {UPSTREAM}")
    if output_path.exists():
        raise ReconstructionError(f"Output already exists; choose a new directory: {output_path}")
    output_root = (PROJECT / "outputs").resolve()
    output_path = output_path.resolve()
    if output_root not in output_path.parents:
        raise ReconstructionError("Output directory must be inside the ignored project outputs directory.")
    try:
        import numpy as np
        import torch
        import cv2
    except ImportError as exc:
        raise ReconstructionError(f"The isolated SAM 3D Body environment is missing a dependency: {exc}") from exc
    device = require_cuda(torch)
    try:
        torch.cuda.set_device(0)
    except Exception as exc:
        raise ReconstructionError(f"Could not initialize CUDA device 0: {exc}") from exc
    sys.path.insert(0, str(UPSTREAM))
    try:
        from sam_3d_body import SAM3DBodyEstimator, load_sam_3d_body
        from tools.build_detector import HumanDetector
        from tools.vis_utils import visualize_sample_together
    except ImportError as exc:
        raise ReconstructionError(f"Unable to import the official model dependencies: {exc}") from exc
    rgb = np.asarray(image)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    try:
        detector = HumanDetector(name="vitdet", device=device, path=str(detector_dir))
        boxes = detector.run_human_detection(bgr, det_cat_id=0, bbox_thr=0.8, nms_thr=0.3, default_to_full_image=False)
        boxes, warnings = validate_detection(boxes, image.width, image.height)
        model, config = load_sam_3d_body(str(checkpoint), device=device, mhr_path=str(mhr))
        estimator = SAM3DBodyEstimator(sam_3d_body_model=model, model_cfg=config)
        torch.cuda.synchronize()
        torch.cuda.reset_peak_memory_stats()
        start = time.perf_counter()
        outputs = infer(estimator, rgb, boxes)
        torch.cuda.synchronize()
        duration = time.perf_counter() - start
        peak = int(torch.cuda.max_memory_allocated())
    except ReconstructionError:
        raise
    except Exception as exc:
        raise ReconstructionError(f"Detection or model setup failed: {exc}") from exc
    result = outputs[0]
    if "pred_vertices" not in result or "pred_cam_t" not in result or "focal_length" not in result:
        raise ReconstructionError("Model output is missing fields required for geometry and visualization.")
    arrays: dict[str, Any] = {}
    absent: list[str] = []
    for key, value in result.items():
        if value is None:
            absent.append(key)
            continue
        arr = np.asarray(value)
        if arr.dtype.kind not in "biuf" or not np.isfinite(arr).all():
            raise ReconstructionError(f"Model output {key!r} is not a finite numeric array.")
        arrays[key] = arr
    vertices = arrays["pred_vertices"]
    faces = np.asarray(estimator.faces)
    if vertices.ndim != 2 or vertices.shape[1] != 3 or not len(vertices):
        raise ReconstructionError("Model returned invalid vertex geometry.")
    if faces.ndim != 2 or faces.shape[1] != 3 or not len(faces) or faces.dtype.kind not in "iu" or int(faces.min()) < 0 or int(faces.max()) >= len(vertices):
        raise ReconstructionError("Model returned invalid mesh topology.")
    arrays["mesh_faces"] = faces
    try:
        preview = visualize_sample_together(bgr, outputs, estimator.faces)
    except Exception as exc:
        raise ReconstructionError(f"Official visualization failed: {exc}") from exc
    try:
        source_revision = subprocess.check_output(["git", "-C", str(UPSTREAM), "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL).strip()
    except (OSError, subprocess.CalledProcessError):
        source_revision = None
        warnings.append("Could not determine the official source checkout revision.")
    metadata = {"schema_version": 1, "model_family": "SAM 3D Body", "source_revision": source_revision, "checkpoint_sha256": sha256(checkpoint), "detector_sha256": sha256(detector_dir / "model_final_f05665.pkl"), "device": device, "gpu_name": torch.cuda.get_device_name(0), "torch_version": str(torch.__version__), "torch_cuda_version": torch.version.cuda, "input_dimensions": {"width": image.width, "height": image.height}, "inference_seconds": duration, "peak_gpu_allocated_bytes": peak, "warnings": warnings, "absent_fields": absent, "arrays": {name: {"shape": list(value.shape), "dtype": str(value.dtype)} for name, value in arrays.items()}, "interpretation": "Model-estimated body mesh; not an exact digital twin."}
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = Path(tempfile.mkdtemp(prefix=".sam3d-", dir=output_path.parent))
        try:
            np.savez_compressed(temporary / "reconstruction.npz", **arrays)
            (temporary / "metadata.json").write_text(json.dumps(metadata, indent=2, allow_nan=False), encoding="utf-8")
            if not cv2.imwrite(str(temporary / "preview.png"), np.clip(preview, 0, 255).astype(np.uint8)):
                raise ReconstructionError("Failed to write visualization preview.")
            temporary.rename(output_path)
        finally:
            if temporary.exists():
                shutil.rmtree(temporary)
    except OSError as exc:
        raise ReconstructionError(f"Failed to save reconstruction output: {exc}") from exc
    print(f"Reconstruction saved to {output_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Photo you have permission to process")
    parser.add_argument("--output", type=Path, required=True, help="New directory inside outputs/")
    parser.add_argument("--checkpoint-dir", type=Path, default=DEFAULT_CHECKPOINT)
    parser.add_argument("--detector-dir", type=Path, default=DEFAULT_DETECTOR)
    args = parser.parse_args()
    try:
        reconstruct(args.input, args.output, args.checkpoint_dir, args.detector_dir)
    except ReconstructionError as exc:
        print(f"Reconstruction error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
