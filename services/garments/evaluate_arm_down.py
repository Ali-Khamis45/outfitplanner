"""Arm-down check for the T-shirt (Sprint 2.1A): arms lowered towards the body from the rest A-pose, with an optional
walk arm swing, as the /try-on Stand and Walk poses do.

Run with the collision tool's environment, from the repository root:

    tools/collision/.venv/Scripts/python.exe services/garments/evaluate_arm_down.py [--garment label=path.glb ...]

Poses (poses.ts convention, world axes about each joint's pivot, applied in order):
- down_N: both upper arms rotated N deg towards the body (the opposite of poses.ts `raise`):
  l_uparm about +Z by -N, r_uparm about +Z by +N.
- walk_N: down_N followed by a 10 deg swing about X: right arm forward (r_uparm [1,0,0] -10), left arm back
  (l_uparm [1,0,0] +10), opposite to a leading left leg.
Penetration is tools/collision `exact_collisions` against the posed body; morph weights follow the garment's sidecar.
"""
from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import trimesh

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
sys.path.insert(0, str(PROJECT / "tools" / "collision"))

from check import exact_collisions  # noqa: E402
from deform_metrics import self_intersections, triangle_deformation, weld_ids  # noqa: E402
from posing import SkinnedAsset, load_asset, posed_positions  # noqa: E402

AVATAR = PROJECT / "outputs" / "avatars" / "mhr-neutral.glb"
GARMENTS = {
    "v2": PROJECT / "outputs" / "garments" / "tshirt-v2-mhr-neutral.glb",
    "v5": PROJECT / "outputs" / "garments" / "experiments" / "tshirt-v5-mhr-neutral.glb",
}
ANGLES = (0, 5, 10, 15, 20, 25, 30)
X, Z = (1.0, 0.0, 0.0), (0.0, 0.0, 1.0)


def down(degrees: float) -> list[Any]:
    return [("l_uparm", Z, -degrees), ("r_uparm", Z, degrees)]


def walk(degrees: float) -> list[Any]:
    return down(degrees) + [("r_uparm", X, -10.0), ("l_uparm", X, 10.0)]


def poses() -> dict[str, list[Any]]:
    result = {f"down_{a}": down(a) for a in ANGLES}
    result.update({f"walk_{a}": walk(a) for a in (0, 15, 20)})
    return result


def region(points: np.ndarray, asset: SkinnedAsset, ids: np.ndarray) -> dict[str, int]:
    """Coarse location of garment vertices: sleeve (garment region 1/2) vs torso, by side."""
    labels = []
    for v in ids:
        part = "sleeve" if asset.region is not None and asset.region[v] in (1, 2) else "torso"
        labels.append(f"{part}-{'L' if points[v, 0] > 0 else 'R'}")
    names, counts = np.unique(labels, return_counts=True)
    return dict(zip(names.tolist(), counts.tolist()))


def evaluate(asset: SkinnedAsset, body: SkinnedAsset, rest_pairs: int, welded: np.ndarray) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for name, rotations in poses().items():
        posed, matrices, weights = posed_positions(asset, rotations)
        body_posed, _, _ = posed_positions(body, rotations)
        inside, depth, _ = exact_collisions(trimesh.Trimesh(body_posed, body.indices, process=False), posed)
        pairs, _ = self_intersections(posed, asset.indices, welded)
        deep = np.flatnonzero(depth > 0.003)
        deformation = triangle_deformation(asset.positions, posed, asset.indices, asset.joints, asset.weights, matrices)
        out[name] = {
            "beyond_3mm": int(len(deep)), "max_depth_mm": round(float(depth.max(initial=0.0)) * 1000, 2), "inside": int(inside.sum()),
            "where_beyond_3mm": region(asset.positions, asset, deep) if len(deep) else {},
            "self_pairs_above_rest": max(0, pairs - rest_pairs), "flipped": int(deformation["flipped"].sum()),
            "stretch_max": round(float(deformation["stretch"].max()), 3),
            "morph_weights": {k: round(v, 3) for k, v in weights.items() if v},
        }
        print(name, json.dumps(out[name]), file=sys.stderr)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--garment", action="append", metavar="LABEL=PATH")
    parser.add_argument("--abd90-ramp-start", type=float, action="append", default=[], help="also evaluate the first garment with abd90 ramps starting here (what-if, sidecar copy in memory)")
    parser.add_argument("--avatar", type=Path, default=AVATAR)
    parser.add_argument("--out", type=Path, default=PROJECT / "outputs" / "garment-tests" / "tshirt-arm-down.json")
    args = parser.parse_args()
    garments = dict(item.split("=", 1) for item in args.garment) if args.garment else {k: str(v) for k, v in GARMENTS.items()}
    body = load_asset(args.avatar)
    results: dict[str, Any] = {"poses": {k: [list(r) for r in v] for k, v in poses().items()}, "garments": {}}
    first = None
    for label, path in garments.items():
        asset = load_asset(Path(path))
        first = first or asset
        welded = weld_ids(asset.positions)
        rest_pairs, _ = self_intersections(asset.positions, asset.indices, welded)
        print("==", label, file=sys.stderr)
        results["garments"][label] = evaluate(asset, body, rest_pairs, welded)
    for start in args.abd90_ramp_start:
        variant = copy.copy(first)
        variant.sidecar = copy.deepcopy(first.sidecar)
        for entry in variant.sidecar["correctives"]:
            if entry["target"].endswith("abd90"):
                entry["ramp"] = [start, 90]
        welded = weld_ids(variant.positions)
        rest_pairs, _ = self_intersections(variant.positions, variant.indices, welded)
        print("== ramp", start, file=sys.stderr)
        results["garments"][f"{next(iter(garments))}_abd90_ramp_{start:g}"] = evaluate(variant, body, rest_pairs, welded)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(results, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
