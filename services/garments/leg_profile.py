"""Garment-to-body gap along each pants leg (pants v3.1 knee-step gate).

For every outer-layer vertex of a leg (regions left_leg / right_leg, below the crotch seam): the distance to the
nearest point of the body surface (dense even sample). Binned in 1 cm height bins per leg and per sector around the
leg (front, back, outer side, inner side: 90-degree sectors about the bin's garment centroid). The step metric is the
largest change of a sector's median gap between neighbouring bins, per zone:

- "leg": from the crotch down to the bottom of the v3.1 knee blend (knee + TUBE_TOP_ABOVE_KNEE_M). Limit 4 mm.
- "tube": from there down to where the turned-in cuff starts (hem + CUFF_ZONE_M). The leg is the same straight tube
  as in pants v3; the gap follows the body's relief under it (kneecap, tibial tuberosity, fibula head), so v3.1 is
  compared with the same v3 file instead of a fixed limit.
- "cuff": the turned-in cuff, which narrows on purpose; reported only.

    python leg_profile.py <garment.glb> <avatar.glb> [...]    (prints the step per leg and sector)
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import numpy as np

from garment_glb import read_glb, skinned_primitive
from uv_layout import glb_outer_faces

BIN_M = 0.01
CUFF_ZONE_M = 0.05  # turned-in cuff (cuff_turn_in_m 4 cm) plus the hem rim: excluded from the step metric
def _tube_top_above_knee() -> float:
    from pants import PANTS_V3_1_RULES as r

    return (r.tube_start_above_knee_m + r.body_offset_end_above_knee_m) / 2 - r.knee_blend_m / 2


TUBE_TOP_ABOVE_KNEE_M = _tube_top_above_knee()  # 0.025: below it the v3.1 leg is the v3 straight tube
SECTORS = ("front", "back", "outer", "inner")
LEG_REGIONS = {"left": 1, "right": 2}  # pants.REGION_LEFT_LEG / REGION_RIGHT_LEG


def body_tree(avatar: Path, samples: int = 400_000) -> Any:
    import trimesh
    from scipy.spatial import cKDTree

    data = skinned_primitive(*read_glb(avatar))
    mesh = trimesh.Trimesh(data["POSITION"].astype(np.float64), np.asarray(data["indices"]).reshape(-1, 3), process=False)
    points, _ = trimesh.sample.sample_surface_even(mesh, samples, seed=1)
    return cKDTree(np.vstack([points, mesh.vertices]))


def knee_y(avatar: Path) -> float:
    """Mean rest height of the two knee joints (l_lowleg, r_lowleg) of an avatar GLB."""
    from posing import load_asset, world_from_local

    skeleton = load_asset(avatar).skeleton
    world = world_from_local(skeleton, skeleton.local)
    return float(np.mean([world[skeleton.index(f"{side}_lowleg")][1, 3] for side in ("l", "r")]))


def profile(garment: Path, avatar: Path, tree: Any = None, knee: float | None = None) -> dict[str, Any]:
    """Per leg: hem and knee heights and rows {y, front, back, outer, inner} of the median gap in mm (None: too few
    vertices)."""
    data = skinned_primitive(*read_glb(garment))
    positions = data["POSITION"].astype(np.float64)
    outer = np.unique(glb_outer_faces(data["indices"], data["TEXCOORD_0"].astype(np.float64)))
    region = np.rint(data["_REGION"]).astype(int)
    tree = tree if tree is not None else body_tree(avatar)
    result: dict[str, Any] = {}
    for leg, code in LEG_REGIONS.items():
        side = 1.0 if leg == "left" else -1.0
        p = positions[outer[region[outer] == code]]
        gap = tree.query(p)[0] * 1000.0
        bottom = float(p[:, 1].min())
        bins = np.floor((p[:, 1] - bottom) / BIN_M).astype(int)
        centre = {b: p[bins == b][:, [0, 2]].mean(axis=0) for b in np.unique(bins)}
        cx = np.array([centre[b][0] for b in bins]); cz = np.array([centre[b][1] for b in bins])
        angle = np.degrees(np.arctan2(p[:, 2] - cz, (p[:, 0] - cx) * side))  # 0 = outer side, +90 = front
        sector = np.select([np.abs(angle - 90) <= 45, np.abs(angle + 90) <= 45, np.abs(angle) < 45], ["front", "back", "outer"], "inner")
        rows = []
        for b in range(int(bins.max()) + 1):
            in_bin = bins == b
            if in_bin.sum() < 10:
                continue
            row: dict[str, Any] = {"y": round(bottom + (b + 0.5) * BIN_M, 3)}
            for name in SECTORS:
                m = in_bin & (sector == name)
                row[name] = round(float(np.median(gap[m])), 1) if m.sum() >= 5 else None
            rows.append(row)
        result[leg] = {"hem_y": round(bottom, 3), "knee_y": round(knee if knee is not None else knee_y(avatar), 3), "rows": rows}
    return result


def zone_of(leg: dict[str, Any], y0: float, y1: float) -> str:
    """Zone of the pair of neighbouring bins (y0 < y1): a pair touching a lower zone belongs to it."""
    if y0 <= leg["hem_y"] + CUFF_ZONE_M:
        return "cuff"
    return "tube" if y0 <= leg["knee_y"] + TUBE_TOP_ABOVE_KNEE_M else "leg"


def largest_step(leg: dict[str, Any], zone: str = "leg", sectors: tuple[str, ...] = SECTORS) -> dict[str, Any]:
    """Largest change of a sector's median gap between neighbouring 1 cm bins inside a zone ("leg", "tube", "cuff")."""
    best = {"mm": 0.0, "sector": None, "y": None}
    for name in sectors:
        values = [(r["y"], r[name]) for r in leg["rows"] if r[name] is not None]
        for (y0, a), (y1, b) in zip(values, values[1:]):
            if y1 - y0 > 1.5 * BIN_M:  # a gap in the data, not a neighbour
                continue
            if zone_of(leg, y0, y1) != zone:
                continue
            if abs(b - a) > abs(best["mm"]):
                best = {"mm": round(b - a, 1), "sector": name, "y": round((y0 + y1) / 2, 3)}
    return best


if __name__ == "__main__":
    args = sys.argv[1:]
    for garment, avatar in zip(args[::2], args[1::2]):
        prof = profile(Path(garment), Path(avatar))
        for name, leg in prof.items():
            print(Path(garment).name, name, *(f"{zone} {largest_step(leg, zone)}" for zone in ("leg", "tube", "cuff")))
