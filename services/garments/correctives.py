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

from dataclasses import dataclass, replace
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
    # Sprint 2.1A: push along the closest point on the body's triangles (face normal) instead of the nearest body
    # vertex's normal, which picks the wrong side of deep creases (belly/thigh at 90 deg hip flexion). Off for v5.
    triangle_collision: bool = False
    # Sprint 2.1A: scale of the rest edge lengths ARAP aims for (1 = ARAP; < 1 lets crease fabric compress smoothly
    # instead of buckling into folds; 0 = membrane smoothing of the start shape). 1 for v5.
    rest_edge_scale: float = 1.0


SPRINT_2_1_FIELDS = ("triangle_collision", "rest_edge_scale")


def rules_record(rules: CorrectiveRules) -> dict[str, Any]:
    """Rules for reports; Sprint 2.1A fields are omitted at their defaults so earlier reports stay byte-identical."""
    defaults = CorrectiveRules()
    return {k: v for k, v in rules.__dict__.items() if k not in SPRINT_2_1_FIELDS or v != getattr(defaults, k)}


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


def _triangle_signed_distance(points: np.ndarray, body: np.ndarray, body_faces: np.ndarray, tree: cKDTree, vertex_faces: np.ndarray, neighbours: int = 8) -> tuple[np.ndarray, np.ndarray]:
    """Signed distance to the closest point on the body triangles (candidates around the nearest vertices) and the
    outward normal of that face."""
    from tshirt import closest_point_on_triangles

    _, nearest = tree.query(points, k=neighbours, workers=-1)
    candidates = vertex_faces[nearest].reshape(len(points), -1)
    best = np.full(len(points), np.inf)
    signed = np.zeros(len(points))
    normals = np.zeros((len(points), 3))
    for column in range(candidates.shape[1]):
        face = candidates[:, column]
        valid = face >= 0
        corners = body[body_faces[np.where(valid, face, 0)]]
        bary = closest_point_on_triangles(points, corners[:, 0], corners[:, 1], corners[:, 2])
        closest = np.einsum("ij,ijk->ik", bary, corners)
        distance = np.where(valid, np.linalg.norm(points - closest, axis=1), np.inf)
        normal = np.cross(corners[:, 1] - corners[:, 0], corners[:, 2] - corners[:, 0])
        normal /= np.clip(np.linalg.norm(normal, axis=1, keepdims=True), 1e-30, None)
        better = distance < best - 1e-12
        best[better] = distance[better]
        signed[better] = np.einsum("ij,ij->i", points[better] - closest[better], normal[better])
        normals[better] = normal[better]
    return signed, normals


def _arap(rest: np.ndarray, start: np.ndarray, faces: np.ndarray, free: np.ndarray, body: np.ndarray, body_normals: np.ndarray, rules: CorrectiveRules, anchor: float, body_faces: np.ndarray | None = None, extra_bodies: list[np.ndarray] | None = None) -> np.ndarray:
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
    vertex_faces = trimesh.Trimesh(body, body_faces, process=False).vertex_faces if rules.triangle_collision and body_faces is not None else None
    extra = [(other, cKDTree(other)) for other in (extra_bodies or [])]  # Sprint 2.2A: also clear these posed bodies
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
        if rules.rest_edge_scale != 1.0:
            rotated = rules.rest_edge_scale * rotated
        rhs = np.zeros((n, 3))
        np.add.at(rhs, edges[:, 0], rotated)
        np.add.at(rhs, edges[:, 1], -rotated)
        b = rhs[free_ids] + coupling @ current[fixed_ids] + anchor * start[free_ids]
        current[free_ids] = solver.solve(b)
        if rules.triangle_collision and body_faces is not None:
            for posed_body, posed_tree in [(body, tree)] + extra:
                signed, normals = _triangle_signed_distance(current[free_ids], posed_body, body_faces, posed_tree, vertex_faces)
                current[free_ids] += normals * np.clip(rules.body_clearance_m - signed, 0.0, None)[:, None]
            continue
        # collision: push free vertices out of the posed body along the nearest body vertex normal
        _, nearest = tree.query(current[free_ids], workers=-1)
        signed = np.einsum("ij,ij->i", current[free_ids] - body[nearest], body_normals[nearest])
        deficit = np.clip(rules.body_clearance_m - signed, 0.0, None)
        current[free_ids] += body_normals[nearest] * deficit[:, None]
    return current


def _skinning_inputs(arrays: dict[str, Any], outer_vertices: np.ndarray) -> dict[str, np.ndarray]:
    source, inner = np.asarray(arrays["_source"]), np.asarray(arrays["_inner"], dtype=bool)
    joints_all, weights_all = np.asarray(arrays["joints"]), np.asarray(arrays["weights"], dtype=np.float64)
    # Welded outer surface skinning data (outer copies of each welded vertex share its weights).
    outer_joints = np.zeros((len(outer_vertices), 4), dtype=np.int64)
    outer_weights = np.zeros((len(outer_vertices), 4))
    outer_joints[source[~inner]], outer_weights[source[~inner]] = joints_all[~inner], weights_all[~inner]
    return {"source": source, "rest_all": np.asarray(arrays["position"], dtype=np.float64), "joints_all": joints_all, "weights_all": weights_all, "outer_joints": outer_joints, "outer_weights": outer_weights}


def _solve_pose(data: dict[str, np.ndarray], outer_vertices: np.ndarray, outer_faces: np.ndarray, mask: np.ndarray, rotations: list[Any], skeleton: Skeleton, body: SkinnedAsset, rules: CorrectiveRules, anchor: float, collision_poses: tuple[Any, ...] = ()) -> np.ndarray:
    """Bind-space delta for every GLB vertex that moves the garment to its solved shape at one key pose."""
    source, rest_all, joints_all, weights_all = data["source"], data["rest_all"], data["joints_all"], data["weights_all"]
    matrices = skin_matrices(skeleton, pose_local(skeleton, rotations))
    posed_body = skin(body.positions, body.joints, body.weights, skin_matrices(body.skeleton, pose_local(body.skeleton, rotations)))
    start = dual_quaternion_skin(outer_vertices, data["outer_joints"], data["outer_weights"], matrices)
    extra = [skin(body.positions, body.joints, body.weights, skin_matrices(body.skeleton, pose_local(body.skeleton, list(pose)))) for pose in collision_poses]
    solved = _arap(outer_vertices, start, outer_faces, mask > 0, posed_body, vertex_normals(posed_body, body.indices), rules, anchor, body.indices, extra)
    # inner layer and rims: the rest offset from the welded outer vertex, carried by the same DQS rotation
    target = solved[source] + dual_quaternion_skin(rest_all, joints_all, weights_all, matrices) - start[source]
    skinned_all = skin(rest_all, joints_all, weights_all, matrices)
    desired = skinned_all + mask[source][:, None] * (target - skinned_all)
    blended = blend_matrices(joints_all, weights_all, matrices)
    delta = np.einsum("vij,vj->vi", np.linalg.inv(blended[:, :3, :3]), desired - blended[:, :3, 3]) - rest_all
    delta[mask[source] == 0] = 0.0  # exactly zero outside the region (removes round-off)
    return delta


def solve_targets(arrays: dict[str, Any], outer_vertices: np.ndarray, outer_faces: np.ndarray, skeleton: Skeleton, body: SkinnedAsset, rules: CorrectiveRules = CorrectiveRules()) -> tuple[dict[str, np.ndarray], dict[str, Any]]:
    """Bind-space POSITION deltas for the four T-shirt contract targets, for every GLB vertex in `arrays`."""
    data = _skinning_inputs(arrays, outer_vertices)
    rest_world = world_from_local(skeleton, skeleton.local)
    morphs: dict[str, np.ndarray] = {}
    report: dict[str, Any] = {"rules": rules_record(rules), "targets": {}}
    for side, low, high in TARGETS:
        pivot = rest_world[skeleton.index(f"{side}_uparm")][:3, 3]
        mask = region_weight(outer_vertices, pivot, side, rules)
        total: dict[float, np.ndarray] = {}
        for angle in (90.0, 120.0):
            total[angle] = _solve_pose(data, outer_vertices, outer_faces, mask, [raise_arm(side, angle)], skeleton, body, rules, dict(rules.anchor_weights)[angle])
            report["targets"][f"{side}_{int(angle)}"] = {"region_vertices": int((mask > 0).sum()), "max_delta_m": float(np.linalg.norm(total[angle], axis=1).max())}
        morphs[low] = total[90.0]
        morphs[high] = total[120.0] - total[90.0]  # contract: abd120 holds only the correction beyond abd90
    return morphs, report


@dataclass(frozen=True)
class CorrectiveSpec:
    """One morph target: solved alone at `rotations`, driven by swing of joint->child over `ramp` (contract §3-4)."""
    target: str
    joint: str
    child: str
    ramp: tuple[float, float]
    rotations: tuple[tuple[str, tuple[float, float, float], float], ...]
    pivot_joint: str
    inner_radius_m: float
    outer_radius_m: float
    side: str | None = None  # gate to this side of the midline ("l": x > 0)
    anchor: float = 1.0
    # Sprint 2.1A: "influence" gates by the vertex's skin-weight share of `joint` and its descendants instead of by
    # the midline, so a corrective covers every vertex its joint moves (crotch vertices blended across the seam).
    gate: str = "midline"
    influence_full_share: float = 0.1  # share at which the influence gate reaches 1
    midline_cross_m: float = 0.0  # Sprint 2.1A: let a midline-gated region extend this far past the midline
    # Contract v2: "signed_swing_deg" entries carry an axis: the world rotation axis whose positive rotation defines
    # the positive direction, converted to the parent's space when the sidecar is written (signed_axis).
    measure: str = "swing_deg"
    positive_rotation_axis: tuple[float, float, float] | None = None
    # Sprint 2.2A: further poses (rotation lists) whose posed body the solved shape must also clear, e.g. the walk arm
    # swing around the key pose; the garment is solved at `rotations` only.
    collision_poses: tuple[Any, ...] = ()


def spec_region(rest: np.ndarray, pivot: np.ndarray, spec: CorrectiveSpec, midline_fade_m: float) -> np.ndarray:
    radial = _smoothstep((spec.outer_radius_m - np.linalg.norm(rest - pivot, axis=1)) / (spec.outer_radius_m - spec.inner_radius_m))
    if spec.side is None:
        return radial
    lateral = (rest[:, 0] if spec.side == "l" else -rest[:, 0]) + spec.midline_cross_m
    return radial * _smoothstep(lateral / midline_fade_m)


def signed_axis(skeleton: Skeleton, joint: str, child: str, rotation_axis: tuple[float, float, float]) -> list[float]:
    """Contract v2 §3b producer convention: axis = omega x r_world (the bone tip's initial motion), in the parent's
    rest frame, rounded to 4 decimals."""
    world = world_from_local(skeleton, skeleton.local)
    j = skeleton.index(joint)
    d = skeleton.local[skeleton.index(child)][:3, 3]
    rotation = world[j][:3, :3] / np.linalg.norm(world[j][:3, :3], axis=0, keepdims=True)
    r_world = rotation @ d
    tangent = np.cross(np.asarray(rotation_axis, dtype=np.float64), r_world / np.linalg.norm(r_world))
    parent = world[skeleton.parents[j]][:3, :3]
    parent = parent / np.linalg.norm(parent, axis=0, keepdims=True)
    axis = parent.T @ (tangent / np.linalg.norm(tangent))
    return [round(float(v), 4) + 0.0 for v in axis]


def _entry(spec: CorrectiveSpec, skeleton: Skeleton | None) -> dict[str, Any]:
    entry: dict[str, Any] = {"target": spec.target, "joint": spec.joint, "child": spec.child, "measure": spec.measure}
    if spec.measure == "signed_swing_deg":
        if skeleton is None or spec.positive_rotation_axis is None:
            raise ValueError(f"{spec.target}: a signed entry needs the skeleton and positive_rotation_axis")
        entry["axis"] = signed_axis(skeleton, spec.joint, spec.child, spec.positive_rotation_axis)
    entry["ramp"] = list(spec.ramp)
    return entry


def spec_sidecar(specs: tuple[CorrectiveSpec, ...], skeleton: Skeleton | None = None) -> dict[str, Any]:
    """Version 1 when every entry is swing_deg (unchanged bytes for earlier assets), version 2 otherwise."""
    entries = [_entry(spec, skeleton) for spec in specs]
    return {"version": 2 if any(spec.measure != "swing_deg" for spec in specs) else 1, "correctives": entries}


def solve_specs(arrays: dict[str, Any], outer_vertices: np.ndarray, outer_faces: np.ndarray, skeleton: Skeleton, body: SkinnedAsset, specs: tuple[CorrectiveSpec, ...], rules: CorrectiveRules = CorrectiveRules()) -> tuple[dict[str, np.ndarray], dict[str, Any]]:
    """Bind-space POSITION deltas for independent corrective specs (each solved alone at its key pose)."""
    data = _skinning_inputs(arrays, outer_vertices)
    rest_world = world_from_local(skeleton, skeleton.local)
    morphs: dict[str, np.ndarray] = {}
    report: dict[str, Any] = {"rules": rules_record(rules), "targets": {}}
    for spec in specs:
        mask = spec_region(outer_vertices, rest_world[skeleton.index(spec.pivot_joint)][:3, 3], spec if spec.gate == "midline" else replace(spec, side=None), rules.midline_fade_m)
        if spec.gate == "influence":
            subtree = np.zeros(len(skeleton.names), dtype=bool)
            subtree[skeleton.index(spec.joint)] = True
            for k, parent in enumerate(skeleton.parents):  # parents precede children
                if parent >= 0 and subtree[parent]:
                    subtree[k] = True
            share = (data["outer_weights"] * subtree[data["outer_joints"]]).sum(axis=1)
            mask = mask * _smoothstep(share / spec.influence_full_share)
        morphs[spec.target] = _solve_pose(data, outer_vertices, outer_faces, mask, list(spec.rotations), skeleton, body, rules, spec.anchor, spec.collision_poses)
        report["targets"][spec.target] = {"region_vertices": int((mask > 0).sum()), "max_delta_m": float(np.linalg.norm(morphs[spec.target], axis=1).max())}
    return morphs, report


SHIRT_HIP_RULES = CorrectiveRules(triangle_collision=True)


def shirt_hip_specs() -> tuple[CorrectiveSpec, ...]:
    """Sprint 2.1A T-shirt hem correctives: solved at 90 deg hip flexion (leg-poses.md), driven by thigh swing with the
    pants' hip ramp (20 -> 90 deg, so hip extension and abduction leave them off)."""
    x = (1.0, 0.0, 0.0)
    return tuple(CorrectiveSpec(f"corr_{tag}_hip90", f"{side}_upleg", f"{side}_lowleg", (20.0, 90.0), ((f"{side}_upleg", x, -90.0),), f"{side}_upleg", 0.20, 0.30, side, 0.3) for side, tag in (("l", "L"), ("r", "R")))


Z_AXIS = (0.0, 0.0, 1.0)
NEG_Z_AXIS = (0.0, 0.0, -1.0)
X_AXIS = (1.0, 0.0, 0.0)
NEG_X_AXIS = (-1.0, 0.0, 0.0)


def shoulder_signed_entries(skeleton: Skeleton) -> list[dict[str, Any]]:
    """Contract v2 entries for the four shoulder targets: same ramps, measured as signed abduction."""
    entries = []
    for side, low, high in TARGETS:
        axis = signed_axis(skeleton, f"{side}_uparm", f"{side}_lowarm", Z_AXIS if side == "l" else NEG_Z_AXIS)
        for target, ramp in ((low, [0, 90]), (high, [90, 120])):
            entries.append({"target": target, "joint": f"{side}_uparm", "child": f"{side}_lowarm", "measure": "signed_swing_deg", "axis": axis, "ramp": ramp})
    return entries


def shirt_hip_specs_signed(ramp_start_deg: float = 0.0) -> tuple[CorrectiveSpec, ...]:
    """Sprint 2.2A: the v5.1 hem targets measured as signed hip flexion (extension and abduction no longer count)."""
    return tuple(replace(spec, ramp=(ramp_start_deg, 90.0), measure="signed_swing_deg", positive_rotation_axis=NEG_X_AXIS) for spec in shirt_hip_specs())


def shirt_add_specs() -> tuple[CorrectiveSpec, ...]:
    """Sprint 2.2A arm-down (sleeve underside / side panel) correctives: solved with the arm lowered 20 deg towards the
    body, clearing the arm also at a +/-10 deg walk swing; ramp [0, -20] on signed abduction (contract v2)."""
    specs = []
    for side, tag in (("l", "L"), ("r", "R")):
        lower = (f"{side}_uparm", Z_AXIS, -20.0 if side == "l" else 20.0)
        swings = tuple((lower, (f"{side}_uparm", X_AXIS, swing)) for swing in (10.0, -10.0))
        specs.append(CorrectiveSpec(f"corr_{tag}_add20", f"{side}_uparm", f"{side}_lowarm", (0.0, -20.0), (lower,), f"{side}_uparm", 0.18, 0.30, side, 0.3,
                                    measure="signed_swing_deg", positive_rotation_axis=Z_AXIS if side == "l" else NEG_Z_AXIS, collision_poses=swings))
    return tuple(specs)


def signed_shirt_sidecar(skeleton: Skeleton, with_adduction: bool) -> dict[str, Any]:
    """Contract v2 sidecar for v5.1 / v5.2: signed shoulder targets, signed hip-flexion hem targets (ramp 20 -> 90), and
    optionally the arm-down targets."""
    entries = shoulder_signed_entries(skeleton) + spec_sidecar(shirt_hip_specs_signed(20.0), skeleton)["correctives"]
    if with_adduction:
        entries += spec_sidecar(shirt_add_specs(), skeleton)["correctives"]
    return {"version": 2, "correctives": entries}
