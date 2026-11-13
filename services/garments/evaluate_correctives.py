"""Evaluate garments with pose-driven corrective morphs exactly as the contract specifies (Sprint 1.4A).

Each GLB is read from disk with its `<stem>.correctives.json` sidecar (if any); morph weights come from
`posing.corrective_weights` (contract §3-§4), morphs are applied before skinning, and the deformation metrics are the
Python port of the web lab's diagnostics (deform_metrics.py). Poses mirror poses.ts `raise` for the left arm, right
arm and both arms at 0, 45, 90, 105 and 120 degrees.

    python evaluate_correctives.py                      # original, v2, v4, v5 on the neutral avatar
    python evaluate_correctives.py --garment v5=path.glb --base path/to/v2.glb
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
import trimesh

from body import PROJECT
from correctives import CorrectiveRules, region_weight
from deform_metrics import body_penetration, self_intersections, summarize, triangle_deformation, weld_ids
from garment_glb import accessor_array, read_glb
from posing import SkinnedAsset, load_asset, posed_positions, raise_arm, world_from_local
from validate_garment import GarmentValidationError, validate

GARMENTS = PROJECT / "outputs" / "garments"
DEFAULT_GARMENTS = {
    "original": GARMENTS / "tshirt-mhr-neutral.glb",
    "v2": GARMENTS / "tshirt-v2-mhr-neutral.glb",
    "v4": GARMENTS / "experiments" / "tshirt-v4-mhr-neutral.glb",
    "v5": GARMENTS / "experiments" / "tshirt-v5-mhr-neutral.glb",
}
AVATAR = PROJECT / "outputs" / "avatars" / "mhr-neutral.glb"
SIDES = ("l", "r", "both")
ANGLES = (0, 45, 90, 105, 120)
# Sprint 1.4A gates (v2/v4 measurements from Sprint 1.3).
GATES = {"both_90_stretch_max": 8.785, "both_120_flipped": 123, "both_120_self_above_rest": 186, "penetrating_beyond_3mm": 0}
REST_ATTRIBUTES = ("POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0", "_REGION")


def rotations(side: str, degrees: float) -> list[tuple[str, tuple[float, float, float], float]]:
    return [raise_arm(s, degrees) for s in (("l", "r") if side == "both" else (side,))]


def evaluate_poses(asset: SkinnedAsset, body: SkinnedAsset) -> dict[str, Any]:
    welded = weld_ids(asset.positions)
    rest_pairs, _ = self_intersections(asset.positions, asset.indices, welded)
    poses: dict[str, Any] = {}
    for side in SIDES:
        for degrees in ANGLES:
            rots = rotations(side, degrees)
            posed, matrices, weights = posed_positions(asset, rots)
            body_posed, _, _ = posed_positions(body, rots)
            deformation = triangle_deformation(asset.positions, posed, asset.indices, asset.joints, asset.weights, matrices)
            pairs, _ = self_intersections(posed, asset.indices, welded)
            signed = body_penetration(body_posed, body.indices, posed)
            poses[f"{side}_{degrees}"] = {**summarize(deformation, pairs, rest_pairs, signed), "morph_weights": {k: round(v, 4) for k, v in weights.items()}}
    return {"rest_self_pairs": rest_pairs, "poses": poses}


def accessor_bytes(path: Path) -> dict[str, bytes]:
    document, blob = read_glb(path)
    primitive = document["meshes"][0]["primitives"][0]

    def raw(index: int) -> bytes:
        return np.ascontiguousarray(accessor_array(document, blob, index)).tobytes()

    out = {name: raw(primitive["attributes"][name]) for name in REST_ATTRIBUTES}
    out["indices"] = raw(primitive["indices"])
    out["inverseBindMatrices"] = raw(document["skins"][0]["inverseBindMatrices"])
    out["skeleton_nodes"] = json.dumps([node for node in document["nodes"] if "mesh" not in node]).encode()  # names, matrices, hierarchy
    return out


def morph_quality(asset: SkinnedAsset) -> dict[str, Any]:
    """Locality (support inside the region of its own side) and smoothness (no single-vertex spikes) of every target."""
    rest_world = world_from_local(asset.skeleton, asset.skeleton.local)
    welded = weld_ids(asset.positions)
    _, compact = np.unique(welded, return_inverse=True)
    edges = trimesh.Trimesh(asset.positions, compact[asset.indices], process=False).edges_unique  # welded topology
    degree = np.bincount(edges.ravel(), minlength=compact.max() + 1)
    rules = CorrectiveRules()
    report: dict[str, Any] = {}
    for name, delta in asset.morphs.items():
        side = "l" if "_L_" in name else "r"
        pivot = rest_world[asset.skeleton.index(f"{side}_uparm")][:3, 3]
        outside = region_weight(asset.positions, pivot, side, rules) == 0
        per_welded = np.zeros((compact.max() + 1, 3))
        per_welded[compact] = delta  # coincident copies (UV seams) share the welded vertex's delta
        neighbour_mean = np.zeros_like(per_welded)
        np.add.at(neighbour_mean, edges[:, 0], per_welded[edges[:, 1]])
        np.add.at(neighbour_mean, edges[:, 1], per_welded[edges[:, 0]])
        neighbour_mean /= np.maximum(degree, 1)[:, None]
        spike = np.linalg.norm(per_welded - neighbour_mean, axis=1)
        # isolation: |delta - neighbour mean| / max |neighbour delta - neighbour mean|. A single-vertex spike (neighbours
        # agree, the vertex sticks out) is >> 1; a steep but continuous gradient or fold is <= ~1.
        spread = np.zeros(len(per_welded))
        for a, b in ((edges[:, 0], edges[:, 1]), (edges[:, 1], edges[:, 0])):
            np.maximum.at(spread, a, np.linalg.norm(per_welded[b] - neighbour_mean[a], axis=1))
        significant = spike > 0.002
        isolation = spike[significant] / np.maximum(spread[significant], 1e-12)
        magnitude = np.linalg.norm(delta, axis=1)
        report[name] = {
            "max_delta_m": round(float(magnitude.max()), 4),
            "nonzero_vertices": int((magnitude > 0).sum()),
            "max_delta_outside_region_m": float(magnitude[outside].max()) if outside.any() else 0.0,
            "max_delta_other_side_of_midline_m": float(magnitude[(asset.positions[:, 0] < 0) if side == "l" else (asset.positions[:, 0] > 0)].max()),
            "max_laplacian_m": round(float(spike.max()), 4),  # |delta - mean of welded neighbours|
            "p99_laplacian_m": round(float(np.sort(spike)[int(0.99 * len(spike))]), 5),
            "vertices_laplacian_over_2mm": int(significant.sum()),
            "max_isolation_ratio": round(float(isolation.max()), 3) if len(isolation) else 0.0,
        }
    return report


def gates(result: dict[str, Any], rest_equal: bool | None, validator_ok: bool) -> dict[str, Any]:
    poses = result["poses"]
    checks = {
        "both_90_stretch_max": (poses["both_90"]["stretch_max"], poses["both_90"]["stretch_max"] <= GATES["both_90_stretch_max"]),
        "both_120_flipped": (poses["both_120"]["flipped"], poses["both_120"]["flipped"] <= GATES["both_120_flipped"]),
        "both_120_self_above_rest": (poses["both_120"]["self_pairs_above_rest"], poses["both_120"]["self_pairs_above_rest"] <= GATES["both_120_self_above_rest"]),
        "penetrating_beyond_3mm_all_poses": (max(p["penetrating_beyond_3mm"] for p in poses.values()), all(p["penetrating_beyond_3mm"] == 0 for p in poses.values())),
        "rest_equals_base": (rest_equal, rest_equal) if rest_equal is not None else (None, None),
        "validator": (validator_ok, validator_ok),
    }
    return {k: {"value": v, "pass": ok} for k, (v, ok) in checks.items()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--garment", action="append", metavar="LABEL=PATH", help="garment to evaluate (repeatable); default: original, v2, v4, v5")
    parser.add_argument("--base", type=Path, default=DEFAULT_GARMENTS["v2"], help="garment whose rest data a corrective garment must equal byte-for-byte")
    parser.add_argument("--avatar", type=Path, default=AVATAR)
    parser.add_argument("--out", type=Path, default=PROJECT / "outputs" / "garment-tests" / "correctives-sprint-1.4a.json")
    args = parser.parse_args()
    garments = dict(item.split("=", 1) for item in args.garment) if args.garment else {k: str(v) for k, v in DEFAULT_GARMENTS.items()}
    body = load_asset(args.avatar)
    base_bytes = accessor_bytes(args.base)
    results: dict[str, Any] = {"avatar": str(args.avatar), "base": str(args.base), "gates": GATES, "garments": {}}
    for label, raw_path in garments.items():
        path = Path(raw_path)
        started = time.perf_counter()
        asset = load_asset(path)
        entry: dict[str, Any] = {"path": str(path), "morph_targets": list(asset.morphs), "sidecar": asset.sidecar is not None}
        try:
            validate(path, args.avatar)
            validator_ok = True
        except GarmentValidationError as error:
            validator_ok, entry["validator_error"] = False, str(error)
        rest_equal = None
        if asset.morphs:
            mine = accessor_bytes(path)
            entry["rest_byte_equal"] = {key: mine[key] == base_bytes[key] for key in base_bytes}
            rest_equal = all(entry["rest_byte_equal"].values())
            entry["morph_quality"] = morph_quality(asset)
        entry.update(evaluate_poses(asset, body))
        entry["gates"] = gates(entry, rest_equal, validator_ok)
        entry["seconds"] = round(time.perf_counter() - started, 1)
        results["garments"][label] = entry
        print(f"{label}: {entry['seconds']} s", file=sys.stderr)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(results, indent=2), encoding="utf-8")
    header = f"{'pose':10s}" + "".join(f"{label:>34s}" for label in results["garments"])
    print(header + "\n" + " " * 10 + "".join(f"{'max / p99 / flip / self+ / pen':>34s}" for _ in results["garments"]))
    for key in results["garments"][next(iter(results["garments"]))]["poses"]:
        row = f"{key:10s}"
        for entry in results["garments"].values():
            p = entry["poses"][key]
            row += f"{p['stretch_max']:>10.3f}{p['stretch_p99']:>7.3f}{p['flipped']:>6d}{p['self_pairs_above_rest']:>6d}{p['penetrating_beyond_3mm']:>5d}"
        print(row)
    for label, entry in results["garments"].items():
        print(label, {k: ("PASS" if g["pass"] else "FAIL" if g["pass"] is False else "n/a", g["value"]) for k, g in entry["gates"].items()})
    print(f"Wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
