"""Sprint 2.0A gates for the pants at every leg pose in docs/contracts/leg-poses.md.

Run with the collision tool's environment (trimesh + Embree), from the repository root:

    tools/collision/.venv/Scripts/python.exe services/garments/evaluate_pants.py [--pants path.glb] [--shirt path.glb]

Penetration uses tools/collision/check.py `exact_collisions` (ray parity + exact closest-triangle depth) on bodies and
garments posed here with the contract's rotations (posing.py mirrors poses.ts applyPose). Deformation uses the same
metrics as the shirt (deform_metrics.py). The rest-pose shirt/pants layering check uses the same exact method
against the shirt shell.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import trimesh

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
sys.path.insert(0, str(PROJECT / "tools" / "collision"))

from check import exact_collisions  # noqa: E402  (tools/collision, unmodified)
from deform_metrics import body_penetration, percentile, self_intersections, triangle_deformation, weld_ids  # noqa: E402
from leg_poses import LEG_POSES  # noqa: E402
from posing import SkinnedAsset, load_asset, posed_positions  # noqa: E402

PANTS = PROJECT / "outputs" / "garments" / "pants-basic-v1-mhr-neutral.glb"
SHIRT = PROJECT / "outputs" / "garments" / "experiments" / "tshirt-v5-mhr-neutral.glb"
AVATAR = PROJECT / "outputs" / "avatars" / "mhr-neutral.glb"
MIN_OVERLAP_M = 0.03


def edge_ratios(rest: np.ndarray, posed: np.ndarray, index: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Per-triangle max and min posed/rest edge length ratio."""
    ratios = []
    for p, q in ((0, 1), (1, 2), (2, 0)):
        rest_length = np.linalg.norm(rest[index[:, p]] - rest[index[:, q]], axis=1)
        ratios.append(np.linalg.norm(posed[index[:, p]] - posed[index[:, q]], axis=1) / np.maximum(rest_length, 1e-12))
    stacked = np.stack(ratios, axis=1)
    return stacked.max(axis=1), stacked.min(axis=1)


def pose_report(pants: SkinnedAsset, body: SkinnedAsset, name: str, welded: np.ndarray, rest_pairs: int) -> dict[str, Any]:
    rotations = LEG_POSES[name]
    posed, matrices, _ = posed_positions(pants, rotations)
    body_posed, body_matrices, _ = posed_positions(body, rotations)
    body_mesh = trimesh.Trimesh(body_posed, body.indices, process=False)
    inside, depth, _ = exact_collisions(body_mesh, posed)
    approx = body_penetration(body_posed, body.indices, posed)
    deformation = triangle_deformation(pants.positions, posed, pants.indices, pants.joints, pants.weights, matrices)
    stretch, compression = edge_ratios(pants.positions, posed, pants.indices)
    body_stretch, body_compression = edge_ratios(body.positions, body_posed, body.indices)
    body_flips = triangle_deformation(body.positions, body_posed, body.indices, body.joints, body.weights, body_matrices)["flipped"]
    pairs, self_triangles = self_intersections(posed, pants.indices, welded)
    flipped = deformation["flipped"]
    penetrating_triangles = inside[pants.indices].any(axis=1)  # a corner strictly inside the posed body (exact parity)
    flipped_and_colliding = flipped & (self_triangles | penetrating_triangles)
    worst = np.argmax(stretch)
    body_flipped = int(body_flips.sum())
    return {
        # Sprint 2.1A flip gate: a fold may flip triangles, but a flipped triangle must not also intersect the garment
        # or lie inside the body, and the total must stay within 3x the body skin's own flips at the same pose.
        "flipped_and_self_intersecting_or_penetrating": int(flipped_and_colliding.sum()),
        "flipped_and_self_intersecting": int((flipped & self_triangles).sum()),
        "flipped_and_penetrating": int((flipped & penetrating_triangles).sum()),
        "flip_limit_3x_body": 3 * body_flipped,
        "inside_vertices_exact": int(inside.sum()),
        "beyond_3mm_exact": int((depth > 0.003).sum()),
        "max_depth_mm_exact": round(float(depth.max(initial=0.0)) * 1000, 2),
        "beyond_3mm_approx": int((approx < -0.003).sum()),
        "stretch_max": round(float(stretch.max()), 4),
        "stretch_p99": round(percentile(stretch, 0.99), 4),
        "compression_min": round(float(compression.min()), 4),
        "compression_p01": round(float(np.sort(compression)[int(0.01 * len(compression))]), 4),
        "worst_stretch_rest_centroid": pants.positions[pants.indices[worst]].mean(axis=0).round(3).tolist(),
        "flipped": int(deformation["flipped"].sum()),
        "degenerate": int(deformation["degenerate"].sum()),
        "self_pairs_above_rest": max(0, pairs - rest_pairs),
        "body_skin_stretch_max": round(float(body_stretch.max()), 4),
        "body_skin_compression_min": round(float(body_compression.min()), 4),
        "body_skin_flipped": body_flipped,
    }


def shirt_layering(pants: SkinnedAsset, shirt: SkinnedAsset, body: SkinnedAsset) -> dict[str, Any]:
    """Rest pose: the shirt hem must overlap the waistband by MIN_OVERLAP_M and the two must not interpenetrate."""
    hem_y = float(shirt.positions[:, 1].min())
    waist_top_y = float(pants.positions[:, 1].max())
    # UV seams split vertices in the GLBs; weld coincident positions so each shell is a closed solid for parity tests
    shirt_mesh = trimesh.Trimesh(shirt.positions, shirt.indices, process=True)
    pants_mesh = trimesh.Trimesh(pants.positions, pants.indices, process=True)
    pants_in_shirt, pants_depth, _ = exact_collisions(shirt_mesh, pants.positions)
    shirt_in_pants, shirt_depth, _ = exact_collisions(pants_mesh, shirt.positions)
    combined = np.concatenate([shirt.positions, pants.positions])
    index = np.concatenate([shirt.indices, pants.indices + len(shirt.positions)])
    owner = np.r_[np.zeros(len(shirt.indices), dtype=bool), np.ones(len(pants.indices), dtype=bool)]
    _, hit = self_intersections(combined, index, weld_ids(combined))
    _, shirt_only_hit = self_intersections(shirt.positions, shirt.indices, weld_ids(shirt.positions))
    _, pants_only_hit = self_intersections(pants.positions, pants.indices, weld_ids(pants.positions))
    cross = int((hit[owner] & ~pants_only_hit).sum() + (hit[~owner] & ~shirt_only_hit).sum())
    # Layer order in the overlap band, per (angle, height) cell: the shirt's innermost point must lie outside the
    # pants' outermost point, measured horizontally from the pelvis axis.
    band = (pants.positions[:, 1] > hem_y) & (pants.positions[:, 1] < waist_top_y)
    shirt_band = (shirt.positions[:, 1] > hem_y) & (shirt.positions[:, 1] < waist_top_y)
    centre = body.positions[(body.positions[:, 1] > hem_y) & (body.positions[:, 1] < waist_top_y)].mean(axis=0)

    def cells(points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        relative = points - centre
        angle = np.floor((np.arctan2(relative[:, 0], relative[:, 2]) + np.pi) / (2 * np.pi) * 72).astype(int) % 72
        height = np.floor((points[:, 1] - hem_y) / 0.01).astype(int)
        return angle * 1000 + height, np.hypot(relative[:, 0], relative[:, 2])

    pants_cell, pants_radius = cells(pants.positions[band])
    shirt_cell, shirt_radius = cells(shirt.positions[shirt_band])
    common = np.intersect1d(pants_cell, shirt_cell)
    gap = np.array([shirt_radius[shirt_cell == c].min() - pants_radius[pants_cell == c].max() for c in common])
    return {
        "shirt_hem_y": round(hem_y, 4), "waistband_top_y": round(waist_top_y, 4), "overlap_m": round(waist_top_y - hem_y, 4),
        "pants_vertices_inside_shirt_shell": int(pants_in_shirt.sum()), "shirt_vertices_inside_pants_shell": int(shirt_in_pants.sum()),
        "max_depth_mm": round(float(max(pants_depth.max(initial=0.0), shirt_depth.max(initial=0.0))) * 1000, 2),
        "shirt_pants_triangles_intersecting": cross,
        "min_layer_gap_m_in_overlap_band": round(float(gap.min()), 4), "cells_checked": int(len(gap)), "cells_with_pants_outside_shirt": int((gap < 0).sum()),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pants", type=Path, default=PANTS)
    parser.add_argument("--shirt", type=Path, default=SHIRT)
    parser.add_argument("--avatar", type=Path, default=AVATAR)
    parser.add_argument("--poses", nargs="*", default=list(LEG_POSES), choices=list(LEG_POSES))
    parser.add_argument("--skip-shirt", action="store_true")
    parser.add_argument("--out", type=Path, default=PROJECT / "outputs" / "garment-tests" / "pants-sprint-2.0a.json")
    args = parser.parse_args()
    body, pants, shirt = load_asset(args.avatar), load_asset(args.pants), load_asset(args.shirt)
    welded = weld_ids(pants.positions)
    rest_pairs, _ = self_intersections(pants.positions, pants.indices, welded)
    results: dict[str, Any] = {"pants": str(args.pants), "shirt": str(args.shirt), "rest_self_pairs": rest_pairs, "poses": {}}
    for name in args.poses:
        results["poses"][name] = pose_report(pants, body, name, welded, rest_pairs)
        print(name, json.dumps(results["poses"][name]), file=sys.stderr)
    if not args.skip_shirt:
        results["shirt_layering"] = shirt_layering(pants, shirt, body)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
