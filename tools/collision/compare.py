"""Run the requested neutral garment/pose matrix without writing output files."""
from __future__ import annotations
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VARIANTS = {
    "v1": "outputs/garments/tshirt-mhr-neutral.glb",
    "v2": "outputs/garments/tshirt-v2-mhr-neutral.glb",
    "v4": "outputs/garments/experiments/tshirt-v4-mhr-neutral.glb",
}
POSES = ("rest", "left-90", "both-90", "both-120", "torso-twist")

if __name__ == "__main__":
    avatar = ROOT / "outputs/avatars/mhr-neutral.glb"
    for name, garment in VARIANTS.items():
        for pose in POSES:
            cmd = [sys.executable, str(ROOT / "tools/collision/check.py"), str(avatar), str(ROOT / garment), pose]
            result = subprocess.run(cmd, check=True, capture_output=True, text=True, encoding="utf-8")
            data = json.loads(result.stdout)
            print(json.dumps({"variant": name, "pose": pose, **data}), flush=True)
