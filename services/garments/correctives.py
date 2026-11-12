"""Shoulder corrective morph targets (Sprint 1.4A) per docs/contracts/corrective-morphs.md.

For each side and key swing (90°, 120°) the target posed shape is solved in posed space, then turned into bind-space
deltas (delta = SkinMatrix⁻¹ · desired − rest):

1. Start from dual-quaternion skinning (DQS) with the v2 weights. Linear blending of the clavicle (static) and
   upper-arm twist (rotating) matrices collapses the shoulder top at +120 deg (LBS inversions); DQS blends rotations
   instead, so the shoulder keeps its volume and orientation.
2. Free only a shoulder/underarm region: a sphere around that side's upper-arm joint (full weight inside R1, smooth
   fade to 0 at R2), gated to its own side of the midline so left and right supports never overlap.
3. Inside it, relax the DQS shape as-rigid-as-possible (ARAP) against the rest garment, with every vertex outside held
   in place and a pull (anchor_weights, per key angle) back towards the DQS shape. ARAP spreads the armpit-fold
   stretch that both LBS and DQS concentrate in a few triangles; the anchor keeps the DQS orientation (no
   inversions). Free vertices are pushed out of the posed body after every iteration.
4. The 2 mm inner layer and the rims follow their welded outer vertex, keeping their rest offset rotated by that vertex's
   DQS rotation (boundary normals of the solved surface are too noisy for this). Everything is blended with the region
   weight, so deltas are exactly 0 outside the region and fade smoothly at its edge.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import trimesh
from scipy import sparse
from scipy.sparse.linalg import splu
from scipy.spatial import cKDTree
from scipy.spatial.transform import Rotation

from deform_metrics import vertex_normals
from posing import Skeleton, SkinnedAsset, blend_matrices, pose_local, raise_arm, skin, skin_matrices, world_from_local

TARGETS = (("l", "corr_L_abd90", "corr_L_abd120"), ("r", "corr_R_abd90", "corr_R_abd120"))


@dataclass(frozen=True)
class CorrectiveRules:
    inner_radius_m: float = 0.16
    outer_radius_m: float = 0.21
    midline_fade_m: float = 0.04
    # pull towards the DQS shape, per key angle: weaker at 90 deg (spread the armpit stretch), stronger at 120 deg
    # (keep the DQS orientation of the compressed shoulder top; weaker anchors re-introduce folds there)
    anchor_weights: tuple[tuple[float, float], ...] = ((90.0, 0.3), (120.0, 1.0))
    iterations: int = 25
    body_clearance_m: float = 0.006  # outer surface; the inner layer sits 2 mm inside it


def sidecar() -> dict[str, Any]:
    entries = []
    for side, low, high in TARGETS:
        joint, child = f"{side}_uparm", f"{side}_lowarm"
        entries.append({"target": low, "joint": joint, "child": child, "measure": "swing_deg", "ramp": [0, 90]})
        entries.append({"target": high, "joint": joint, "child": child, "measure": "swing_deg", "ramp": [90, 120]})
    return {"version": 1, "correctives": entries}


def _smoothstep(t: np.ndarray) -> np.ndarray:
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3 - 2 * t)


def region_weight(rest: np.ndarray, pivot: np.ndarray, side: str, rules: CorrectiveRules) -> np.ndarray:
    distance = np.linalg.norm(rest - pivot, axis=1)
    radial = _smoothstep((rules.outer_radius_m - distance) / (rules.outer_radius_m - rules.inner_radius_m))
    lateral = rest[:, 0] if side == "l" else -rest[:, 0]
    return radial * _smoothstep(lateral / rules.midline_fade_m)


def _qmul(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    ax, ay, az, aw = np.moveaxis(a, -1, 0)
    bx, by, bz, bw = np.moveaxis(b, -1, 0)
    return np.stack([aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz], -1)


def dual_quaternion_skin(positions: np.ndarray, joints: np.ndarray, weights: np.ndarray, matrices: np.ndarray) -> np.ndarray:
    """Dual-quaternion skinning (Kavan et al. 2007) with the same weights; equals LBS wherever one joint dominates."""
    rotation = matrices[:, :3, :3] / np.linalg.norm(matrices[:, :3, :3], axis=1, keepdims=True)
    real = Rotation.from_matrix(rotation).as_quat()  # x, y, z, w
    dual = 0.5 * _qmul(np.concatenate([matrices[:, :3, 3], np.zeros((len(matrices), 1))], axis=1), real)
    q, d = real[joints], dual[joints]
    pivot = q[np.arange(len(joints)), weights.argmax(axis=1)]
    sign = np.where(np.einsum("vki,vi->vk", q, pivot) < 0, -1.0, 1.0)  # shortest path: same hemisphere as the main joint
    b0, be = np.einsum("vk,vki->vi", weights * sign, q), np.einsum("vk,vki->vi", weights * sign, d)
    norm = np.linalg.norm(b0, axis=1, keepdims=True)
    b0, be = b0 / norm, be / norm
    translation = 2 * _qmul(be, b0 * np.array([-1.0, -1.0, -1.0, 1.0]))[:, :3]
    return np.einsum("vij,vj->vi", Rotation.from_quat(b0).as_matrix(), positions) + translation


def _arap(rest: np.ndarray, start: np.ndarray, faces: np.ndarray, free: np.ndarray, body: np.ndarray, body_normals: np.ndarray, rules: CorrectiveRules, anchor: float) -> np.ndarray:
    edges = trimesh.Trimesh(rest, faces, process=False).edges_unique
    edges = edges[free[edges].any(axis=1)]
    n = len(rest)
    adjacency = sparse.coo_matrix((np.ones(2 * len(edges)), (np.r_[edges[:, 0], edges[:, 1]], np.r_[edges[:, 1], edges[:, 0]])), shape=(n, n)).tocsr()
    degree = np.asarray(adjacency.sum(axis=1)).ravel()
    free_ids = np.flatnonzero(free)
    fixed_ids = np.flatnonzero(~free)
    system = (sparse.diags(degree + anchor) - adjacency)[free_ids][:, free_ids].tocsc()
    solver = splu(system)
    coupling = adjacency[free_ids][:, fixed_ids]
    tree = cKDTree(body)
    current = start.copy()
    dx = rest[edges[:, 0]] - rest[edges[:, 1]]
    for _ in range(rules.iterations):
        dp = current[edges[:, 0]] - current[edges[:, 1]]
        covariance = np.zeros((n, 3, 3))
        outer = np.einsum("ei,ej->eij", dp, dx)
        np.add.at(covariance, edges[:, 0], outer)
        np.add.at(covariance, edges[:, 1], outer)
        u, _, vt = np.linalg.svd(covariance)
        flip = np.linalg.det(u @ vt) < 0
        u[flip, :, -1] *= -1
        rotation = u @ vt
        rotated = 0.5 * np.einsum("eij,ej->ei", rotation[edges[:, 0]] + rotation[edges[:, 1]], dx)
        rhs = np.zeros((n, 3))
        np.add.at(rhs, edges[:, 0], rotated)
        np.add.at(rhs, edges[:, 1], -rotated)
        b = rhs[free_ids] + coupling @ current[fixed_ids] + anchor * start[free_ids]
        current[free_ids] = solver.solve(b)
        # collision: push free vertices out of the posed body along the nearest body vertex normal
        _, nearest = tree.query(current[free_ids], workers=-1)
        signed = np.einsum("ij,ij->i", current[free_ids] - body[nearest], body_normals[nearest])
        deficit = np.clip(rules.body_clearance_m - signed, 0.0, None)
        current[free_ids] += body_normals[nearest] * deficit[:, None]
    return current


def solve_targets(arrays: dict[str, Any], outer_vertices: np.ndarray, outer_faces: np.ndarray, skeleton: Skeleton, body: SkinnedAsset, rules: CorrectiveRules = CorrectiveRules()) -> tuple[dict[str, np.ndarray], dict[str, Any]]:
    """Bind-space POSITION deltas for the four contract targets, for every GLB vertex in `arrays`."""
    source, inner = np.asarray(arrays["_source"]), np.asarray(arrays["_inner"], dtype=bool)
    rest_all = np.asarray(arrays["position"], dtype=np.float64)
    joints_all, weights_all = np.asarray(arrays["joints"]), np.asarray(arrays["weights"], dtype=np.float64)
    # Welded outer surface skinning data (outer copies of each welded vertex share its weights).
    outer_joints = np.zeros((len(outer_vertices), 4), dtype=np.int64)
    outer_weights = np.zeros((len(outer_vertices), 4))
    outer_joints[source[~inner]], outer_weights[source[~inner]] = joints_all[~inner], weights_all[~inner]
    rest_world = world_from_local(skeleton, skeleton.local)
    morphs: dict[str, np.ndarray] = {}
    report: dict[str, Any] = {"rules": dict(rules.__dict__), "targets": {}}
    for side, low, high in TARGETS:
        pivot = rest_world[skeleton.index(f"{side}_uparm")][:3, 3]
        mask = region_weight(outer_vertices, pivot, side, rules)
        free = mask > 0
        total: dict[float, np.ndarray] = {}
        for angle in (90.0, 120.0):
            local = pose_local(skeleton, [raise_arm(side, angle)])
            matrices = skin_matrices(skeleton, local)
            body_local = pose_local(body.skeleton, [raise_arm(side, angle)])
            posed_body = skin(body.positions, body.joints, body.weights, skin_matrices(body.skeleton, body_local))
            start = dual_quaternion_skin(outer_vertices, outer_joints, outer_weights, matrices)
            solved = _arap(outer_vertices, start, outer_faces, free, posed_body, vertex_normals(posed_body, body.indices), rules, dict(rules.anchor_weights)[angle])
            # inner layer and rims: the rest offset from the welded outer vertex, carried by the same DQS rotation
            target = solved[source] + dual_quaternion_skin(rest_all, joints_all, weights_all, matrices) - start[source]
            skinned_all = skin(rest_all, joints_all, weights_all, matrices)
            desired = skinned_all + mask[source][:, None] * (target - skinned_all)
            blended = blend_matrices(joints_all, weights_all, matrices)
            delta = np.einsum("vij,vj->vi", np.linalg.inv(blended[:, :3, :3]), desired - blended[:, :3, 3]) - rest_all
            delta[mask[source] == 0] = 0.0  # exactly zero outside the region (removes round-off)
            total[angle] = delta
            report["targets"][f"{side}_{int(angle)}"] = {"region_vertices": int(free.sum()), "max_delta_m": float(np.linalg.norm(delta, axis=1).max())}
        morphs[low] = total[90.0]
        morphs[high] = total[120.0] - total[90.0]  # contract: abd120 holds only the correction beyond abd90
    return morphs, report
