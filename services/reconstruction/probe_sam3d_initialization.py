"""Load the official SAM 3D Body model and report real CUDA initialization metrics."""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint-dir", type=Path, required=True)
    parser.add_argument("--source-dir", type=Path, default=Path(__file__).resolve().parents[2] / "external" / "sam-3d-body")
    args = parser.parse_args()
    sys.path.insert(0, str(args.source_dir.resolve()))
    try:
        import torch
        from sam_3d_body import load_sam_3d_body

        if not torch.cuda.is_available():
            raise RuntimeError("CUDA is unavailable in this PyTorch environment")
        checkpoint = args.checkpoint_dir / "model.ckpt"
        mhr = args.checkpoint_dir / "assets" / "mhr_model.pt"
        for path in (checkpoint, mhr, args.checkpoint_dir / "model_config.yaml"):
            if not path.is_file():
                raise FileNotFoundError(f"Required official model asset is missing: {path}")
        torch.cuda.reset_peak_memory_stats()
        started = time.perf_counter()
        model, _ = load_sam_3d_body(str(checkpoint), device="cuda:0", mhr_path=str(mhr))
        torch.cuda.synchronize()
        print(json.dumps({"status": "PASS", "device": torch.cuda.get_device_name(0), "initialization_seconds": time.perf_counter() - started, "peak_gpu_allocated_bytes": torch.cuda.max_memory_allocated(), "peak_gpu_reserved_bytes": torch.cuda.max_memory_reserved(), "training": model.training}))
        return 0
    except Exception as exc:
        print(f"SAM initialization failed ({type(exc).__name__}): {exc}", file=sys.stderr)
        try:
            import torch
            if torch.cuda.is_available():
                print(f"Peak CUDA allocation before failure: {torch.cuda.max_memory_allocated()} bytes", file=sys.stderr)
                torch.cuda.empty_cache()
        except Exception:
            pass
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
