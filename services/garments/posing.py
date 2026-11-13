"""Skeleton posing, corrective-morph weights and skinning that mirror the web lab exactly (Sprint 1.4A).

- `pose_world` reproduces `apps/web/lib/garment/poses.ts` `applyPose`: each rotation is a world-axis rotation about the
  joint's pivot, local' = parentWorld⁻¹ · delta · parentWorld · local.
- `swing_deg` and `corrective_weights` implement docs/contracts/corrective-morphs.md §3-§4 verbatim.
- `skin` applies morphs before linear blend skinning, as Three.js does (bind matrices are identity for these assets).
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from garment_glb import read_glb, skinned_primitive

Rotation = tuple[str, tuple[float, float, float], float]  # (joint, world axis, degrees)
SWING_EPSILON_DEG = 0.01  # contract §3: swings below this are exactly 0


@dataclass
class Skeleton:
    names: list[str]
    parents: np.ndarray  # (J,) -1 for roots, in skin joint order
    local: np.ndarray  # (J, 4, 4) rest local matrices
    inverse_bind: np.ndarray  # (J, 4, 4)

    def index(self, name: str) -> int:
        return self.names.index(name)


def load_skeleton(document: dict[str, Any], inverse_bind: np.ndarray) -> Skeleton:
    joints = document["skins"][0]["joints"]
    node_parent = {child: i for i, node in enumerate(document["nodes"]) for child in node.get("children", [])}
    position = {node: k for k, node in enumerate(joints)}
    names = [document["nodes"][j]["name"] for j in joints]
    parents = np.array([position.get(node_parent.get(j, -1), -1) for j in joints])
    local = np.stack([np.array(document["nodes"][j]["matrix"], dtype=np.float64).reshape(4, 4).T for j in joints])
    if any(parents[k] >= k for k in range(len(joints)) if parents[k] >= 0):
        raise ValueError("Skin joints must list parents before children.")
    return Skeleton(names, parents, local, inverse_bind.astype(np.float64))


def _rotation(axis: tuple[float, float, float], degrees: float) -> np.ndarray:
    a = np.asarray(axis, dtype=np.float64)
    a /= np.linalg.norm(a)
    t = np.radians(degrees)
    k = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + np.sin(t) * k + (1 - np.cos(t)) * (k @ k)


def _rotation_part(matrix: np.ndarray) -> np.ndarray:
    m = matrix[:3, :3]
    return m / np.linalg.norm(m, axis=0, keepdims=True)


def world_from_local(skeleton: Skeleton, local: np.ndarray) -> np.ndarray:
    world = np.empty_like(local)
    for k, parent in enumerate(skeleton.parents):
        world[k] = local[k] if parent < 0 else world[parent] @ local[k]
    return world


def pose_local(skeleton: Skeleton, rotations: list[Rotation]) -> np.ndarray:
    """Local matrices after applying the rotations in order, exactly as poses.ts does."""
    local = skeleton.local.copy()
    for joint, axis, degrees in rotations:
        k = skeleton.index(joint)
        world = world_from_local(skeleton, local)
        parent_rotation = _rotation_part(world[skeleton.parents[k]])
        scale = np.linalg.norm(local[k][:3, :3], axis=0)
        rotation = _rotation_part(local[k])
        new_rotation = parent_rotation.T @ _rotation(axis, degrees) @ parent_rotation @ rotation
        local[k][:3, :3] = new_rotation * scale
    return local


def swing_deg(skeleton: Skeleton, local: np.ndarray, joint: str, child: str) -> float:
    """Contract §3: angle between rest and current bone direction, both in the parent's space."""
    j, c = skeleton.index(joint), skeleton.index(child)
    d = skeleton.local[c][:3, 3]
    rest = _rotation_part(skeleton.local[j]) @ d
    now = _rotation_part(local[j]) @ d
    rest, now = rest / np.linalg.norm(rest), now / np.linalg.norm(now)
    swing = float(np.degrees(np.arccos(np.clip(np.dot(rest, now), -1.0, 1.0))))
    return 0.0 if swing < SWING_EPSILON_DEG else swing  # contract §3: round-off near rest counts as exactly 0


def signed_swing_deg(skeleton: Skeleton, local: np.ndarray, joint: str, child: str, axis: Any) -> float:
    """Contract v2 §3b: swing within the plane of the rest bone direction and `axis` (parent space), positive towards
    the axis."""
    j, c = skeleton.index(joint), skeleton.index(child)
    d = skeleton.local[c][:3, 3]
    rest = _rotation_part(skeleton.local[j]) @ d
    now = _rotation_part(local[j]) @ d
    rest, now = rest / np.linalg.norm(rest), now / np.linalg.norm(now)
    a = np.asarray(axis, dtype=np.float64)
    e = a - (a @ rest) * rest
    norm = np.linalg.norm(e)
    if norm < 1e-9:
        raise ValueError(f"Corrective axis is parallel to the {joint} bone.")
    angle = float(np.degrees(np.arctan2(now @ (e / norm), now @ rest)))
    return 0.0 if abs(angle) < SWING_EPSILON_DEG else angle


def corrective_weights(sidecar: dict[str, Any], skeleton: Skeleton, local: np.ndarray) -> dict[str, float]:
    """Contract §4: weight = clamp((s - ramp0) / (ramp1 - ramp0), 0, 1) per target; v2 adds signed_swing_deg."""
    version = sidecar.get("version")
    if version not in (1, 2):
        raise ValueError("Unsupported corrective sidecar version.")
    weights = {}
    for entry in sidecar["correctives"]:
        if entry["measure"] == "swing_deg":
            swing = swing_deg(skeleton, local, entry["joint"], entry["child"])
        elif entry["measure"] == "signed_swing_deg" and version == 2:
            swing = signed_swing_deg(skeleton, local, entry["joint"], entry["child"], entry["axis"])
        else:
            raise ValueError(f"Unsupported measure {entry['measure']!r} in a version {version} sidecar")
        lo, hi = entry["ramp"]
        weights[entry["target"]] = float(np.clip((swing - lo) / (hi - lo), 0.0, 1.0))
    return weights


def skin_matrices(skeleton: Skeleton, local: np.ndarray) -> np.ndarray:
    return world_from_local(skeleton, local) @ skeleton.inverse_bind


def blend_matrices(joints: np.ndarray, weights: np.ndarray, matrices: np.ndarray) -> np.ndarray:
    return np.einsum("vk,vkij->vij", weights, matrices[joints])


def skin(positions: np.ndarray, joints: np.ndarray, weights: np.ndarray, matrices: np.ndarray) -> np.ndarray:
    blended = blend_matrices(joints, weights, matrices)
    return np.einsum("vij,vj->vi", blended[:, :3, :3], positions) + blended[:, :3, 3]


@dataclass
class SkinnedAsset:
    skeleton: Skeleton
    positions: np.ndarray
    indices: np.ndarray
    joints: np.ndarray
    weights: np.ndarray
    region: np.ndarray | None
    morphs: dict[str, np.ndarray]
    sidecar: dict[str, Any] | None


def load_asset(path: Path) -> SkinnedAsset:
    document, blob = read_glb(path)
    data = skinned_primitive(document, blob)
    skeleton = load_skeleton(document, data["inverse_bind"])
    morphs: dict[str, np.ndarray] = {}
    primitive = document["meshes"][0]["primitives"][0]
    names = document["meshes"][0].get("extras", {}).get("targetNames", [])
    if primitive.get("targets"):
        from garment_glb import accessor_array

        for name, target in zip(names, primitive["targets"], strict=True):
            morphs[name] = accessor_array(document, blob, target["POSITION"]).astype(np.float64)
    sidecar_path = path.with_name(path.stem + ".correctives.json")
    sidecar = json.loads(sidecar_path.read_text(encoding="utf-8")) if sidecar_path.is_file() else None
    return SkinnedAsset(skeleton, data["POSITION"].astype(np.float64), data["indices"], data["JOINTS_0"].astype(np.int64), data["WEIGHTS_0"].astype(np.float64), data.get("_REGION"), morphs, sidecar)


def posed_positions(asset: SkinnedAsset, rotations: list[Rotation]) -> tuple[np.ndarray, np.ndarray, dict[str, float]]:
    """Posed vertices (morphs per the sidecar, then skinning), the skin matrices and the morph weights used."""
    local = pose_local(asset.skeleton, rotations)
    matrices = skin_matrices(asset.skeleton, local)
    weights = corrective_weights(asset.sidecar, asset.skeleton, local) if asset.sidecar and asset.morphs else {}
    rest = asset.positions.copy()
    for name, value in weights.items():
        if value:
            rest += value * asset.morphs[name]
    return skin(rest, asset.joints, asset.weights, matrices), matrices, weights


def raise_arm(side: str, degrees: float) -> Rotation:
    """poses.ts `raise`: abduction about world +Z from the rest A-pose (negative angle for the right arm)."""
    return (f"{side}_uparm", (0.0, 0.0, 1.0), degrees if side == "l" else -degrees)
