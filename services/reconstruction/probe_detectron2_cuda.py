"""Check that the installed Detectron2 native extension executes real CUDA operators."""
from __future__ import annotations

import json
import sys
from typing import Any, Callable


def run_check(name: str, check: Callable[[], Any], results: dict[str, Any]) -> None:
    try:
        results[name] = {"status": "PASS", "result": check()}
    except Exception as exc:
        results[name] = {"status": "FAIL", "error": f"{type(exc).__name__}: {exc}"}


def main() -> int:
    try:
        import torch
        import detectron2
        from detectron2 import _C
        from detectron2.layers import ROIAlignRotated, batched_nms_rotated, nms_rotated
        from detectron2.layers.rotated_boxes import pairwise_iou_rotated
    except Exception as exc:
        print(f"Detectron2 import failed ({type(exc).__name__}): {exc}", file=sys.stderr)
        return 1
    if not torch.cuda.is_available():
        print("CUDA is unavailable in this PyTorch environment", file=sys.stderr)
        return 1
    device = torch.device("cuda:0")
    boxes = torch.tensor([[10.0, 10.0, 8.0, 4.0, 0.0], [10.5, 10.0, 8.0, 4.0, 5.0], [40.0, 40.0, 6.0, 6.0, 30.0]], device=device)
    scores = torch.tensor([0.9, 0.8, 0.7], device=device)
    results: dict[str, Any] = {
        "detectron2_version": detectron2.__version__,
        "torch_version": torch.__version__,
        "torch_cuda_version": torch.version.cuda,
        "extension_cuda_version": _C.get_cuda_version(),
        "extension_compiler": _C.get_compiler_version(),
        "device": torch.cuda.get_device_name(0),
    }
    run_check("nms_rotated", lambda: nms_rotated(boxes, scores, 0.5).tolist(), results)
    run_check("batched_nms_rotated", lambda: batched_nms_rotated(boxes, scores, torch.tensor([0, 0, 1], device=device), 0.5).tolist(), results)
    run_check("pairwise_iou_rotated", lambda: [round(v, 4) for v in pairwise_iou_rotated(boxes, boxes).diagonal().tolist()], results)
    features = torch.rand((1, 2, 16, 16), device=device)
    rois = torch.tensor([[0.0, 8.0, 8.0, 6.0, 6.0, 15.0]], device=device)
    run_check("roi_align_rotated", lambda: list(ROIAlignRotated((2, 2), 1.0, 2)(features, rois).shape), results)
    torch.cuda.synchronize()
    results["peak_gpu_allocated_bytes"] = torch.cuda.max_memory_allocated()
    failed = [name for name, value in results.items() if isinstance(value, dict) and value.get("status") == "FAIL"]
    results["status"] = "FAIL" if failed else "PASS"
    print(json.dumps(results, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
