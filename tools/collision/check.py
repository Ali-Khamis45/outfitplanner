"""Triangle-surface distance and parity-based collision checks for posed MHR GLBs.

The read-only Node bridge calls the same Three.js loader, binder, pose definitions and
approximate collision function as the frontend tests. No output files are written.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

import numpy as np
import trimesh

HERE = Path(__file__).resolve().parent
POSES = ("rest", "left-90", "both-90", "both-120", "torso-twist")


def exact_collisions(body: trimesh.Trimesh, points: np.ndarray, *, batch_size: int = 256) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return inside flags, exact closest-triangle depths (m), and closest face indices.

    Ray parity defines inside independently of surface normals. Boundary points within
    1e-8 m are treated as on the surface, not penetrating. Only closed, consistently
    oriented meshes are supported; deformed self-intersecting bodies remain ambiguous.
    """
    if not body.is_watertight or not body.is_winding_consistent:
        raise ValueError("Body must be watertight and consistently wound")
    inside = np.zeros(len(points), dtype=bool)
    depth = np.zeros(len(points), dtype=np.float64)
    faces = np.zeros(len(points), dtype=np.int64)
    for start in range(0, len(points), batch_size):
        segment = points[start:start + batch_size]
        _, distance, nearest = trimesh.proximity.closest_point(body, segment)
        is_inside = body.contains(segment) & (distance > 1e-8)
        inside[start:start + len(segment)] = is_inside
        depth[start:start + len(segment)] = np.where(is_inside, distance, 0)
        faces[start:start + len(segment)] = nearest
    return inside, depth, faces


def evaluate(data: dict[str, Any]) -> dict[str, Any]:
    body = trimesh.Trimesh(vertices=np.asarray(data["body"], dtype=float).reshape(-1, 3), faces=np.asarray(data["faces"], dtype=np.int64).reshape(-1, 3), process=False)
    points = np.asarray(data["cloth"], dtype=float).reshape(-1, 3)
    inside, depth, face_ids = exact_collisions(body, points)
    approx = np.array([np.inf if v is None else v for v in data["approx"]])
    approx_inside = approx < 0
    labels = np.asarray(data["regions"])
    worst = []
    for index in np.flatnonzero(inside)[np.argsort(depth[inside])[::-1][:20]]:
        vertices = body.faces[face_ids[index]]
        closest = vertices[np.argmin(np.linalg.norm(body.vertices[vertices] - points[index], axis=1))]
        worst.append({"vertex": int(index), "depth_mm": float(depth[index] * 1000), "body_region": str(labels[closest])})
    return {"inside_vertices": int(inside.sum()), "max_depth_mm": float(depth.max(initial=0) * 1000), "worst_vertices": worst,
            "approx_inside_vertices": int(approx_inside.sum()), "exact_only": int((inside & ~approx_inside).sum()),
            "approx_only": int((approx_inside & ~inside).sum()), "exact_beyond_3mm": int((depth > .003).sum()),
            "approx_beyond_3mm": int((approx < -.003).sum())}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("avatar", type=Path)
    parser.add_argument("garment", type=Path)
    parser.add_argument("pose", choices=POSES)
    args = parser.parse_args()
    result = subprocess.run(["node", "--no-warnings", str(HERE / "pose.mjs"), str(args.avatar.resolve()), str(args.garment.resolve()), args.pose], check=True, capture_output=True, text=True, encoding="utf-8")
    if result.stderr:
        print(result.stderr, file=sys.stderr, end="")
    print(json.dumps(evaluate(json.loads(result.stdout)), indent=2))

if __name__ == "__main__":
    main()
