"""Body and garment measurements for sizing (Sprint 3A, docs/contracts/fit-map.md §4).

A girth is the perimeter of the 2-D convex hull (x, z) of a horizontal cross-section: what a tape measure reads around
a body. The section is the exact intersection of the chosen faces (torso, or torso and legs; never arms or hands) with
the plane, so it does not depend on vertex density. Levels come from the body's own rig and mesh, so every body is
measured the same way.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import trimesh
from scipy.spatial import ConvexHull

from body import LEFT_ARM, LEG, RIGHT_ARM, TORSO, RestBody

def section_points(vertices: np.ndarray, faces: np.ndarray, level: float) -> np.ndarray:
    """(x, z) points of the exact cross-section of these faces with the plane y = level."""
    a, b, c = vertices[faces[:, 0], 1], vertices[faces[:, 1], 1], vertices[faces[:, 2], 1]
    crossing = (np.minimum(np.minimum(a, b), c) <= level) & (np.maximum(np.maximum(a, b), c) >= level)
    if not crossing.any():
        return np.zeros((0, 2))
    segments = trimesh.intersections.mesh_plane(trimesh.Trimesh(vertices, faces[crossing], process=False), [0.0, 1.0, 0.0], [0.0, level, 0.0])
    return segments.reshape(-1, 3)[:, [0, 2]] if len(segments) else np.zeros((0, 2))


def girth(vertices: np.ndarray, faces: np.ndarray, level: float) -> float:
    """Convex-hull perimeter (m) of the section of these faces at y = level (0 if the section is degenerate)."""
    section = section_points(vertices, faces, level)
    if len(section) < 3:
        return 0.0
    try:
        hull = ConvexHull(section)
    except Exception:  # degenerate (collinear) section
        return 0.0
    ring = section[hull.vertices]
    return float(np.linalg.norm(np.roll(ring, -1, axis=0) - ring, axis=1).sum())


def _scan(vertices: np.ndarray, faces: np.ndarray, lo: float, hi: float, pick: str, step: float = 0.004) -> tuple[float, float]:
    levels = np.arange(lo, hi + 1e-9, step)
    values = np.array([girth(vertices, faces, y) for y in levels])
    valid = values > 0
    index = (np.argmax if pick == "max" else np.argmin)(np.where(valid, values, -np.inf if pick == "max" else np.inf))
    return float(levels[index]), float(values[index])


def label_faces(body: RestBody, labels: tuple[int, ...]) -> np.ndarray:
    """Faces whose three corners all belong to the given skin groups."""
    return body.faces[np.isin(body.labels[body.faces], labels).all(axis=1)]


def body_levels(body: RestBody) -> dict[str, float]:
    from tshirt import axilla

    hip_y = float((body.joint("l_upleg")[1] + body.joint("r_upleg")[1]) / 2)
    midline = np.abs(body.vertices[:, 0]) < 0.01
    return {
        "axilla_y": float((axilla(body, LEFT_ARM)[1] + axilla(body, RIGHT_ARM)[1]) / 2),
        "hip_y": hip_y,
        "crotch_y": float(body.vertices[midline, 1].min()),
        "ankle_y": float((body.joint("l_foot")[1] + body.joint("r_foot")[1]) / 2),
        "shoulder_y": float((body.joint("l_uparm")[1] + body.joint("r_uparm")[1]) / 2),
    }


def body_measurements(body: RestBody) -> dict[str, Any]:
    """Chest, natural waist and seat girths, shoulder width and the levels they were taken at (metres)."""
    levels = body_levels(body)
    torso = label_faces(body, (TORSO,))
    lower = label_faces(body, (TORSO, LEG))
    chest_y, chest = _scan(body.vertices, torso, levels["axilla_y"] - 0.10, levels["axilla_y"] - 0.02, "max")
    waist_y, waist = _scan(body.vertices, torso, levels["hip_y"] + 0.06, levels["axilla_y"] - 0.10, "min")
    hips_y, hips = _scan(body.vertices, lower, levels["crotch_y"] + 0.02, levels["hip_y"] + 0.06, "max")
    shoulder = section_points(body.vertices, torso, levels["shoulder_y"])
    return {
        **levels,
        "chest_y": chest_y, "chest_m": chest,
        "waist_y": waist_y, "waist_m": waist,
        "hips_y": hips_y, "hips_m": hips,
        "shoulder_width_m": float(shoulder[:, 0].max() - shoulder[:, 0].min()) if len(shoulder) else 0.0,
        "height_m": float(body.vertices[:, 1].max() - body.vertices[:, 1].min()),
        "inseam_m": float(levels["crotch_y"] - body.vertices[:, 1].min()),
    }
