"""Validate a skinned garment GLB against the avatar GLB it must bind to.

Checks attributes, normals, UVs, weight normalization, joint indices, the skeleton (names, inverse bind
matrices, and that they invert the GLB's own node hierarchy), closed-shell topology and approximate
rest-pose clearance from the avatar surface. Clearance uses nearest-surface-sample signed distance and
is approximate (about ±2 mm at 400k samples).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np
import trimesh
from scipy.spatial import cKDTree

from garment_glb import read_glb, skinned_primitive

REQUIRED_ATTRIBUTES = ("POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0", "_REGION")
REQUIRED_METADATA = ("schemaVersion", "garmentId", "category", "units", "upAxis", "skeleton", "regions", "openings", "thicknessM", "material", "fit", "provenance")


class GarmentValidationError(ValueError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise GarmentValidationError(message)


def node_globals(document: dict[str, Any]) -> dict[str, np.ndarray]:
    """World matrices of skeleton nodes, composed from the GLB's own local node matrices."""
    parents: dict[int, int] = {}
    for index, node in enumerate(document["nodes"]):
        for child in node.get("children", []):
            parents[child] = index
    cache: dict[int, np.ndarray] = {}

    def world(index: int) -> np.ndarray:
        if index not in cache:
            local = np.array(document["nodes"][index].get("matrix", np.eye(4).reshape(-1).tolist()), dtype=np.float64).reshape(4, 4).T
            cache[index] = world(parents[index]) @ local if index in parents else local
        return cache[index]

    return {document["nodes"][j]["name"]: world(j) for j in document["skins"][0]["joints"]}


def rest_clearance(garment: dict[str, np.ndarray], avatar: dict[str, np.ndarray], samples: int = 400_000) -> dict[str, Any]:
    body = trimesh.Trimesh(avatar["POSITION"].astype(np.float64), avatar["indices"], process=False)
    points, face = trimesh.sample.sample_surface(body, samples, seed=11)
    normals = np.asarray(body.face_normals)[face]
    _, nearest = cKDTree(points).query(garment["POSITION"], workers=-1)
    signed = np.einsum("ij,ij->i", garment["POSITION"] - points[nearest], normals[nearest])
    region = garment["_REGION"].astype(int)
    per_region = {}
    for value, name in enumerate(("torso", "left_sleeve", "right_sleeve")):
        selected = signed[region == value]
        per_region[name] = {"vertices": int(len(selected)), "min_m": float(selected.min()), "median_m": float(np.median(selected)), "below_0": int((selected < 0).sum()), "below_minus_3mm": int((selected < -0.003).sum())}
    return {"approximate": True, "min_clearance_m": float(signed.min()), "penetrating_vertices": int((signed < 0).sum()), "penetrating_beyond_3mm": int((signed < -0.003).sum()), "regions": per_region}


def validate(garment_path: Path, avatar_path: Path) -> dict[str, Any]:
    document, blob = read_glb(garment_path)
    require(len(document.get("meshes", [])) == 1 and len(document.get("skins", [])) == 1, "Garment must contain exactly one mesh and one skin")
    primitive = document["meshes"][0]["primitives"][0]
    missing = [name for name in REQUIRED_ATTRIBUTES if name not in primitive["attributes"]]
    require(not missing, f"Missing vertex attributes: {missing}")
    material = document["materials"][primitive["material"]]["pbrMetallicRoughness"]
    require({"baseColorFactor", "metallicFactor", "roughnessFactor"} <= set(material), "Material must be PBR metallic-roughness")
    metadata = document["asset"].get("extras", {}).get("garment", {})
    require(all(key in metadata for key in REQUIRED_METADATA), f"Garment metadata is missing keys: {[k for k in REQUIRED_METADATA if k not in metadata]}")
    garment = skinned_primitive(document, blob)
    avatar_document, avatar_blob = read_glb(avatar_path)
    avatar = skinned_primitive(avatar_document, avatar_blob)

    positions, normals, uv = garment["POSITION"], garment["NORMAL"], garment["TEXCOORD_0"]
    require(np.isfinite(positions).all() and np.isfinite(normals).all() and np.isfinite(uv).all(), "Non-finite vertex data")
    normal_error = float(np.abs(np.linalg.norm(normals, axis=1) - 1).max())
    require(normal_error < 1e-3, f"Normals are not unit length (max error {normal_error})")
    require(uv.min() > -0.1 and uv.max() < 1.15, f"UVs outside the expected atlas range [{uv.min()}, {uv.max()}]")
    joints, weights = garment["JOINTS_0"].astype(int), garment["WEIGHTS_0"].astype(np.float64)
    joint_count = len(garment["joint_names"])
    sums = weights.sum(axis=1)
    require((weights >= 0).all() and np.abs(sums - 1).max() < 1e-5, f"Skin weights must be non-negative and sum to 1 (max error {np.abs(sums - 1).max()})")
    require(joints.max() < joint_count, "Joint index outside the skeleton")

    require(list(garment["joint_names"]) == list(avatar["joint_names"]), "Garment joint names/order differ from the avatar skeleton")
    inverse_delta = float(np.abs(garment["inverse_bind"] - avatar["inverse_bind"]).max())
    require(inverse_delta < 1e-5, f"Inverse bind matrices differ from the avatar's (max {inverse_delta}); garment was fitted to another skeleton")
    worlds = node_globals(document)
    identity_error = max(float(np.abs(worlds[name] @ garment["inverse_bind"][i] - np.eye(4)).max()) for i, name in enumerate(garment["joint_names"]))
    require(identity_error < 1e-4, f"Inverse bind matrices do not invert the node hierarchy (max {identity_error})")
    rest_skinned = np.einsum("vk,vkij,vj->vi", weights, (np.stack([worlds[n] for n in garment["joint_names"]]) @ garment["inverse_bind"])[joints], np.c_[positions, np.ones(len(positions))])[:, :3]
    bind_drift = float(np.abs(rest_skinned - positions).max())
    require(bind_drift < 1e-4, f"Garment moves at its own bind pose (max {bind_drift} m)")

    welded = trimesh.Trimesh(positions, garment["indices"], process=False)
    welded.merge_vertices(merge_tex=True, merge_norm=True)
    euler = len(welded.vertices) - len(welded.edges_unique) + len(welded.faces)
    require(welded.is_watertight and welded.is_winding_consistent and welded.volume > 0, "Garment shell must be watertight, consistently wound and outward-facing")
    lo, hi = avatar["POSITION"].min(axis=0), avatar["POSITION"].max(axis=0)
    require((positions.min(axis=0) > lo - 0.1).all() and (positions.max(axis=0) < hi + 0.1).all(), "Garment lies outside the avatar's bounds (scale or axis mismatch)")
    used = np.unique(joints[weights > 1e-4])
    return {
        "garment": str(garment_path.name),
        "avatar": str(avatar_path.name),
        "vertices": int(len(positions)),
        "triangles": int(len(garment["indices"])),
        "max_normal_length_error": normal_error,
        "uv_range": [float(uv.min()), float(uv.max())],
        "max_weight_sum_error": float(np.abs(sums - 1).max()),
        "joints_with_influence": [str(garment["joint_names"][j]) for j in used],
        "max_inverse_bind_delta_vs_avatar": inverse_delta,
        "max_world_times_inverse_bind_identity_error": identity_error,
        "max_bind_pose_skinning_drift_m": bind_drift,
        "shell": {"watertight": True, "winding_consistent": True, "volume_m3": float(welded.volume), "euler_characteristic": int(euler), "genus": int((2 - euler) // 2)},
        "bounds_m": [positions.min(axis=0).tolist(), positions.max(axis=0).tolist()],
        "rest_clearance": rest_clearance(garment, avatar),
        "metadata": {key: metadata[key] for key in ("garmentId", "bodyVariant", "retargetedFrom", "units", "upAxis") if key in metadata},
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("garment", type=Path)
    parser.add_argument("avatar", type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(validate(args.garment, args.avatar), indent=2))
    except GarmentValidationError as error:
        print(f"Garment validation failed: {error}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
