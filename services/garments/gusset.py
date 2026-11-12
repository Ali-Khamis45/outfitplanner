"""Explicit underarm gusset (Sprint 1.3): a new kite-shaped panel inserted into each sleeve underseam.

Geometry (measured on the v2 shirt): the short sleeve's underside is only ~1.5-1.7 cm long in the A-pose, so the cuff
passes through the armpit transition and its underside is torso-weighted while the rest of the cuff follows the arm.
The panel therefore has its base on the cuff, like a sleeve-underseam gusset:

1. Remove the outer faces within geodesic radius R of the cuff vertex nearest the axilla. That disk touches the sleeve
   opening along an arc A and meets the remaining garment along a seam path B.
2. Insert a new panel bounded by B (the same vertices: a stitched seam) and a new cuff edge C that replaces A. C is A
   resampled and extended along the arm by H(t) = H·sin(πt), so the underseam gains length (extra fabric).
3. H is derived, not tuned: at a 90° raise the cuff moves through a chord c = 2·r·sin(45°) about the shoulder pivot; a
   panel of rest width W spanning that motion with linearly blended weights stretches about (W + c) / W, so for a target
   average stretch s the width must be W ≥ c / (s − 1); H = max(0, W − R).
4. The interior is a Delaunay disk triangulation with the surrounding edge length, positioned by harmonic interpolation.
5. Skin weights: B keeps the v2 weights, C takes pure upper-arm weights from fully arm-weighted sleeve vertices, and the
   interior is the harmonic blend, so the torso→arm transition spreads over the whole panel with no seam discontinuity.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import trimesh
from scipy import sparse
from scipy.sparse.csgraph import dijkstra
from scipy.sparse.linalg import spsolve
from scipy.spatial import Delaunay, cKDTree

from body import RestBody

REGION_LEFT_GUSSET, REGION_RIGHT_GUSSET = 3, 4
GUSSET_UV = {REGION_LEFT_GUSSET: (0.982, 0.00), REGION_RIGHT_GUSSET: (0.982, 0.02)}  # (u0, v0) of 0.016-wide islands
SIDES = (("l", "left_sleeve", REGION_LEFT_GUSSET, 1), ("r", "right_sleeve", REGION_RIGHT_GUSSET, 2))


class GussetError(RuntimeError):
    """The underarm region is not a valid disk for panel insertion."""


def _graph(vertices: np.ndarray, faces: np.ndarray) -> tuple[sparse.csr_matrix, np.ndarray]:
    mesh = trimesh.Trimesh(vertices, faces, process=False)
    edges, lengths = mesh.edges_unique, mesh.edges_unique_length
    graph = sparse.coo_matrix((np.r_[lengths, lengths], (np.r_[edges[:, 0], edges[:, 1]], np.r_[edges[:, 1], edges[:, 0]])), shape=(len(vertices),) * 2).tocsr()
    return graph, lengths


def _ordered_boundary(faces: np.ndarray) -> list[list[int]]:
    from tshirt import boundary_loops

    return boundary_loops(faces)


def _harmonic(n: int, triangles: np.ndarray, fixed: np.ndarray, values: np.ndarray) -> np.ndarray:
    """Solve the uniform graph Laplacian with Dirichlet values on `fixed` vertices (values has rows for all vertices)."""
    edges = np.unique(np.sort(np.concatenate([triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]]), axis=1), axis=0)
    adjacency = sparse.coo_matrix((np.ones(2 * len(edges)), (np.r_[edges[:, 0], edges[:, 1]], np.r_[edges[:, 1], edges[:, 0]])), shape=(n, n)).tocsr()
    laplacian = sparse.diags(np.asarray(adjacency.sum(axis=1)).ravel()) - adjacency
    free = np.flatnonzero(~fixed)
    result = values.astype(np.float64).copy()
    if len(free):
        a = laplacian[free][:, free].tocsc()
        b = -laplacian[free][:, np.flatnonzero(fixed)] @ values[fixed]
        solved = spsolve(a, b)
        result[free] = solved.reshape(len(free), -1) if values.ndim > 1 else solved
    return result


def _disk_points(boundary_count: int, perimeter: float, spacing: float) -> np.ndarray:
    """Boundary points on the unit circle (filled in later by arc length) plus a sunflower interior with ~`spacing`."""
    radius_world = perimeter / (2 * np.pi)
    area = np.pi * (0.92 ** 2)
    count = max(1, int(round(area * radius_world**2 / (spacing**2 * np.sqrt(3) / 2))))
    k = np.arange(count) + 0.5
    r = 0.92 * np.sqrt(k / count)
    theta = k * np.pi * (3 - np.sqrt(5))
    return np.stack([r * np.cos(theta), r * np.sin(theta)], axis=1)


def _dense(joints: np.ndarray, weights: np.ndarray, joint_count: int) -> np.ndarray:
    dense = np.zeros((len(joints), joint_count))
    np.add.at(dense, (np.arange(len(joints))[:, None], joints), weights)
    return dense


def _top4(dense: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    order = np.argsort(dense, axis=1)[:, -4:][:, ::-1]
    weights = np.take_along_axis(dense, order, axis=1)
    weights = np.clip(weights, 0, None)
    return order.astype(np.int64), weights / weights.sum(axis=1, keepdims=True)


def add_underarm_gussets(outer: Any, body: RestBody, surface: Any, marks: dict[str, Any], rules: Any) -> tuple[Any, dict[str, Any]]:
    """Return a new OuterGarment with one stitched gusset panel per underarm, plus a topology report."""
    from tshirt import OuterGarment, classify_loops, enforce_clearance

    vertices, faces = np.array(outer.vertices), np.array(outer.faces)
    joints, weights, region = np.array(outer.joints), np.array(outer.weights), np.array(outer.region)
    corner_uv = np.array(outer.corner_uv)
    joint_count = len(body.joint_names)
    arm_joint = np.array(["uparm" in name and name.startswith(("l_", "r_")) for name in body.joint_names])
    graph, lengths = _graph(vertices, faces)
    spacing = float(np.median(lengths))
    report: dict[str, Any] = {"spacing_m": spacing, "radius_m": rules.underarm_panel_radius_m, "target_average_stretch": rules.underarm_panel_target_stretch, "sides": {}}
    keep_face = np.ones(len(faces), dtype=bool)
    new_vertices: list[np.ndarray] = []
    new_faces: list[np.ndarray] = []
    new_uv: list[np.ndarray] = []
    new_joints: list[np.ndarray] = []
    new_weights: list[np.ndarray] = []
    new_region: list[np.ndarray] = []
    panel_vertex_ids: dict[str, list[int]] = {}
    next_id = len(vertices)

    for side, opening, region_id, sleeve_region in SIDES:
        sleeve = marks["sleeves"][side]
        loop = list(outer.boundaries[opening])
        loop_set = set(loop)
        anchor = loop[int(np.argmin(np.linalg.norm(vertices[loop] - sleeve["axilla"], axis=1)))]
        distance = dijkstra(graph, indices=anchor, limit=3 * rules.underarm_panel_radius_m)
        inside = distance < rules.underarm_panel_radius_m
        disk = np.flatnonzero(np.all(inside[faces], axis=1) & keep_face)
        disk_mesh = trimesh.Trimesh(vertices, faces[disk], process=False)
        if len(disk_mesh.split(only_watertight=False)) != 1:
            raise GussetError(f"{opening}: the removal region is not a single connected patch.")
        loops = _ordered_boundary(faces[disk])
        if len(loops) != 1:
            raise GussetError(f"{opening}: the removal region has {len(loops)} boundary loops; a disk has exactly one.")
        disk_loop = loops[0]
        on_opening = np.array([v in loop_set for v in disk_loop])
        # Arc A: the consecutive run of disk-boundary vertices on the sleeve opening; seam B: the rest (with A's endpoints).
        rolled = int(np.argmax(on_opening & ~np.roll(on_opening, 1)))  # start of the opening run
        ordered = np.roll(np.array(disk_loop), -rolled)
        run = np.roll(on_opening, -rolled)
        a_len = int(np.argmin(run)) if not run.all() else len(run)
        if a_len < 3 or run[a_len:].any():
            raise GussetError(f"{opening}: the removal region must touch the opening along one contiguous arc (got {int(run.sum())} vertices).")
        arc_a = ordered[:a_len]  # e1 ... e2 along the opening
        seam_b = np.r_[ordered[a_len - 1:], ordered[0]]  # e2 ... e1 through the garment (shared seam vertices)
        removed_faces = disk
        removed_vertices = np.setdiff1d(np.unique(faces[disk]), seam_b)
        keep_face[disk] = False

        # Cuff edge C: A resampled at 1.5x density and extended along the arm by H(t) = H sin(pi t).
        shoulder, direction = sleeve["shoulder"], sleeve["direction"]
        reach = float(np.linalg.norm(vertices[anchor] - shoulder))
        chord = 2 * reach * np.sin(np.radians(45))
        width_needed = chord / (rules.underarm_panel_target_stretch - 1)
        extension = max(0.0, width_needed - rules.underarm_panel_radius_m)
        a_points = vertices[arc_a]
        a_param = np.r_[0, np.cumsum(np.linalg.norm(np.diff(a_points, axis=0), axis=1))]
        c_count = max(3, int(round(1.5 * (len(arc_a) - 2))))
        t = np.linspace(0, 1, c_count + 2)[1:-1]
        c_points = np.stack([np.interp(t * a_param[-1], a_param, a_points[:, k]) for k in range(3)], axis=1) + (extension * np.sin(np.pi * t))[:, None] * direction

        # Panel boundary: seam B (e2 -> e1), then C (e1 -> e2); map to the unit circle by arc length and fill.
        boundary_points = np.r_[vertices[seam_b], c_points]
        segment = np.linalg.norm(np.diff(np.r_[boundary_points, boundary_points[:1]], axis=0), axis=1)
        perimeter = float(segment.sum())
        angle = 2 * np.pi * np.r_[0, np.cumsum(segment)[:-1]] / perimeter
        circle = np.stack([np.cos(angle), np.sin(angle)], axis=1)
        interior_2d = _disk_points(len(boundary_points), perimeter, spacing)
        points_2d = np.r_[circle, interior_2d]
        triangles = Delaunay(points_2d).simplices
        n_boundary, n_total = len(boundary_points), len(points_2d)
        fixed = np.zeros(n_total, dtype=bool)
        fixed[:n_boundary] = True
        positions = _harmonic(n_total, triangles, fixed, np.r_[boundary_points, np.zeros((n_total - n_boundary, 3))])

        # Weights: B keeps its v2 weights; C copies the nearest fully arm-weighted sleeve vertex; interior harmonic.
        dense_seam = _dense(joints[seam_b], weights[seam_b], joint_count)
        arm_mass = _dense(joints, weights, joint_count)[:, arm_joint].sum(axis=1)
        donors = np.flatnonzero((region == sleeve_region) & (arm_mass > 0.98))
        donors = donors[np.isin(donors, faces[keep_face])]  # only vertices that survive the removal
        if not len(donors):
            raise GussetError(f"{opening}: no fully arm-weighted sleeve vertices to seed the cuff weights.")
        _, nearest = cKDTree(vertices[donors]).query(c_points)
        arm_cuff = _dense(joints[donors[nearest]], weights[donors[nearest]], joint_count)
        # Continuity with the original cuff at e1/e2 (shared vertices keep their v2 weights): blend from the endpoint
        # weights at the cuff ends to pure upper-arm weights at the middle with s(t) = sin(pi t).
        ends = _dense(joints[[arc_a[0], arc_a[-1]]], weights[[arc_a[0], arc_a[-1]]], joint_count)
        along = (1 - t)[:, None] * ends[0] + t[:, None] * ends[1]
        share = np.sin(np.pi * t)[:, None]
        dense_cuff = (1 - share) * along + share * arm_cuff
        dense = _harmonic(n_total, triangles, fixed, np.r_[dense_seam, dense_cuff, np.zeros((n_total - n_boundary, joint_count))])
        panel_joints, panel_weights = _top4(dense)

        # Index the new vertices: seam B reuses existing ids; C and interior are appended.
        seam_count = len(seam_b)
        fresh = n_total - seam_count
        ids = np.r_[seam_b, next_id + np.arange(fresh)]
        new_vertices.append(positions[seam_count:])
        new_joints.append(panel_joints[seam_count:])
        new_weights.append(panel_weights[seam_count:])
        new_region.append(np.full(fresh, region_id, dtype=np.int32))
        panel_faces = ids[triangles]
        u0, v0 = GUSSET_UV[region_id]
        new_faces.append(panel_faces)
        new_uv.append(np.stack([u0 + 0.008 * (points_2d[triangles][..., 0] + 1), v0 + 0.008 * (points_2d[triangles][..., 1] + 1)], axis=-1))
        panel_vertex_ids[opening] = ids[seam_count:].tolist()
        report["sides"][opening] = {
            "anchor_vertex": int(anchor), "removed_faces": removed_faces.tolist(), "removed_vertices": removed_vertices.tolist(),
            "seam_vertices": seam_b.tolist(), "replaced_cuff_vertices": arc_a.tolist(),
            "new_cuff_vertex_count": int(c_count), "new_interior_vertex_count": int(n_total - n_boundary),
            "panel_triangles": int(len(triangles)), "shoulder_reach_m": reach, "chord_at_90deg_m": chord,
            "required_width_m": width_needed, "cuff_extension_m": extension,
            "removed_area_m2": float(disk_mesh.area), "panel_area_m2": float(trimesh.Trimesh(positions, triangles, process=False).area),
        }
        next_id += fresh

    all_vertices = np.r_[vertices, *new_vertices]
    all_joints = np.r_[joints, *new_joints]
    all_weights = np.r_[weights, *new_weights]
    all_region = np.r_[region, *new_region]
    panel_faces_all = np.concatenate(new_faces)
    panel_uv_all = np.concatenate(new_uv)
    merged_faces = np.r_[faces[keep_face], panel_faces_all]
    merged_uv = np.r_[corner_uv[keep_face], panel_uv_all]
    # Orientation: a stitched panel must traverse each seam edge opposite to the surrounding face that owns it.
    kept = faces[keep_face]
    kept_directed = {tuple(edge) for edge in np.concatenate([kept[:, [0, 1]], kept[:, [1, 2]], kept[:, [2, 0]]]).tolist()}
    start = int(keep_face.sum())
    for block_faces in new_faces:
        directed = np.concatenate([block_faces[:, [0, 1]], block_faces[:, [1, 2]], block_faces[:, [2, 0]]]).tolist()
        same = sum(tuple(edge) in kept_directed for edge in directed)
        if same:  # seam edges run the same way as the garment's: flip the whole panel
            block = slice(start, start + len(block_faces))
            merged_faces[block] = merged_faces[block][:, ::-1]
            merged_uv[block] = merged_uv[block][:, ::-1]
        start += len(block_faces)
    # Compact: drop the removed interior vertices and the replaced cuff vertices.
    used = np.unique(merged_faces)
    remap = -np.ones(len(all_vertices), dtype=np.int64)
    remap[used] = np.arange(len(used))
    merged_faces = remap[merged_faces]
    compact = OuterGarment(all_vertices[used], merged_faces, merged_uv, all_joints[used], all_weights[used], all_region[used], {}, dict(outer.report))
    mesh = trimesh.Trimesh(compact.vertices, compact.faces, process=False)
    compact.boundaries = classify_loops(mesh, marks)
    # Clearance on the new panel vertices only; every other vertex is held fixed.
    panel_mask = np.isin(np.arange(len(compact.vertices)), remap[np.concatenate([np.array(v) for v in panel_vertex_ids.values()])])
    report["clearance"] = enforce_clearance(mesh, surface, rules, ~panel_mask)
    compact.vertices = np.array(mesh.vertices)
    for opening, ids in panel_vertex_ids.items():
        report["sides"][opening]["new_vertex_ids_v4"] = remap[np.array(ids)].tolist()
    report["panel_face_ids_v4"] = list(range(int(keep_face.sum()), int(keep_face.sum()) + len(panel_faces_all)))
    report["removed_face_count"] = int((~keep_face).sum())
    report["added_face_count"] = int(len(panel_faces_all))
    report["vertices_before_after"] = [int(len(vertices)), int(len(compact.vertices))]
    report["faces_before_after"] = [int(len(faces)), int(len(compact.faces))]
    welded = trimesh.Trimesh(compact.vertices, compact.faces, process=False)
    report["winding_consistent"] = bool(welded.is_winding_consistent)
    report["openings_after"] = {k: len(v) for k, v in compact.boundaries.items()}
    if not welded.is_winding_consistent:
        raise GussetError("Panel orientation could not be made consistent with the garment surface.")
    return compact, report
