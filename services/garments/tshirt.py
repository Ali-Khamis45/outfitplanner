"""Procedural T-shirt: a landmark-driven garment volume extracted as a surface, solidified, UV-mapped and skinned.

Fitting strategy (Sprint 1.0, documented in docs/sprint-1/garment-rigging.md):
1. Garment core = body occupancy (without forearms/hands) plus a "hang" fill that drops the torso
   silhouette straight down from the chest, so the shirt does not follow the waist like body paint.
2. Outer surface = zero set of (distance to core − ease), with ease rising from shoulders to hem.
3. Openings are cut by planes and a cylinder placed from joints (hem, sleeve ends, scooped neckline);
   cut caps are removed, leaving exactly four boundary loops.
4. Taubin smoothing, boundary re-projection, then a clearance pass pushes any vertex closer than the
   minimum clearance back out along the body normal.
5. Skin weights are transferred from the nearest body vertices, restricted to torso/arm/leg joints,
   smoothed over the garment surface, then reduced to four normalized influences.
6. A 2 mm inner layer and closed rims give the shell real thickness; UVs are per-panel cylindrical.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field, replace
from typing import Any

import numpy as np
import trimesh
from scipy import ndimage, sparse
from scipy.spatial import cKDTree

from body import FOREARM_HAND, HEAD, LEFT_ARM, LEG, RIGHT_ARM, TORSO, RestBody

REGION_TORSO, REGION_LEFT_SLEEVE, REGION_RIGHT_SLEEVE = 0, 1, 2
REGION_NAMES = ("torso", "left_sleeve", "right_sleeve")
BOUNDARY_KINDS = ("hem", "neck", "left_sleeve", "right_sleeve")


@dataclass(frozen=True)
class FitRules:
    voxel_m: float = 0.006
    ease_shoulder_m: float = 0.012
    ease_chest_m: float = 0.02
    ease_hem_m: float = 0.035
    ease_sleeve_m: float = 0.022
    ease_blur_m: float = 0.02
    hem_below_hip_m: float = 0.03
    hang_start_below_spine3_m: float = 0.05
    sleeve_length_ratio: float = 0.5
    sleeve_cut_radius_m: float = 0.11
    neck_radius_m: float = 0.09
    neck_cone_slope: float = 0.8
    close_voxels: int = 2
    open_voxels: int = 1
    neck_drop_back_m: float = 0.005
    neck_front_slope: float = 0.6
    top_above_neck_m: float = 0.08
    field_blur_voxels: float = 1.2
    smoothing_iterations: int = 20
    min_clearance_m: float = 0.006
    clearance_passes: int = 4
    thickness_m: float = 0.002
    weight_neighbours: int = 8
    weight_smoothing_iterations: int = 12
    body_samples: int = 400_000
    seed: int = 7
    # Sprint 1.1 options. Defaults reproduce the Sprint 1.0 garment exactly; V2_RULES enables them.
    underarm_separation_m: float = 0.0  # half-width of the carved gap between sleeve and torso below the axilla (0 = off)
    underarm_length_m: float = 0.35
    weight_mode: str = "nearest"  # "nearest" (1.0) or "region": torso/arm-restricted transfer blended across the armhole
    weight_band_m: float = 0.03  # half-width of the geodesic torso→arm blend band
    clearance_smoothing_iterations: int = 0  # diffuse clearance push-outs so neighbours move together (0 = per vertex)
    retarget_smoothing_iterations: int = 0  # diffuse the retarget displacement field (0 = raw 8-NN blend)
    discontinuity_ratio: float = 0.0  # projection mode: edges whose projected body points are this many times farther apart than the edge (0 = off)
    discontinuity_radius_m: float = 0.04  # geodesic radius around those edges where weights are diffused
    discontinuity_iterations: int = 30
    discontinuity_spatial_radius_m: float = 0.0  # also average weights over 3D neighbours inside the band (folded creases; 0 = off)
    underarm_panel_radius_m: float = 0.0  # Sprint 1.3 explicit gusset: geodesic radius of the replaced underarm disk (0 = off)
    underarm_panel_target_stretch: float = 4.0  # design average stretch of the panel at a 90° raise (sets the cuff extension)
    gusset_close_voxels: int = 0  # extra closing near each axilla: turns the sharp armpit crease into a broader gusset (0 = off)
    gusset_radius_m: float = 0.07  # region around the axilla where the gusset closing applies


SPRINT_1_1_FIELDS = ("underarm_separation_m", "underarm_length_m", "weight_mode", "weight_band_m", "clearance_smoothing_iterations", "retarget_smoothing_iterations", "discontinuity_ratio", "discontinuity_radius_m", "discontinuity_iterations", "gusset_close_voxels", "gusset_radius_m", "discontinuity_spatial_radius_m", "underarm_panel_radius_m", "underarm_panel_target_stretch")


def rules_record(rules: FitRules) -> dict[str, Any]:
    """Rules for metadata; Sprint 1.1 fields are omitted while at their defaults so 1.0 assets stay byte-identical."""
    defaults = FitRules()
    return {k: v for k, v in asdict(rules).items() if k not in SPRINT_1_1_FIELDS or v != getattr(defaults, k)}


# Chosen from the Sprint 1.1 ablations (docs/sprint-1/deformation-analysis.md): exact projection weights, smoothing only
# around projection discontinuities (graph + 3D), smoothed clearance and retarget fields. Underarm separation, the
# "region" transfer and the gusset were measured and rejected; they remain available for reproducibility.
V2_RULES = FitRules(weight_mode="projection", weight_smoothing_iterations=0, discontinuity_ratio=3.0, discontinuity_radius_m=0.04, discontinuity_iterations=30, discontinuity_spatial_radius_m=0.015, clearance_smoothing_iterations=10, clearance_passes=8, retarget_smoothing_iterations=20)


@dataclass
class OuterGarment:
    """Welded outer surface plus per-corner UVs and per-vertex skinning, before thickness is added."""

    vertices: np.ndarray
    faces: np.ndarray
    corner_uv: np.ndarray  # (F, 3, 2)
    joints: np.ndarray  # (V, 4)
    weights: np.ndarray  # (V, 4)
    region: np.ndarray  # (V,)
    boundaries: dict[str, list[int]]
    report: dict[str, Any] = field(default_factory=dict)


class BodySurface:
    """Dense surface samples with normals for approximate signed distance and nearest-label queries."""

    def __init__(self, body: RestBody, samples: int, seed: int) -> None:
        mesh = trimesh.Trimesh(body.vertices, body.faces, process=False)
        points, face_index = trimesh.sample.sample_surface(mesh, samples, seed=seed)
        self.points = np.asarray(points)
        self.normals = np.asarray(mesh.face_normals)[face_index]
        corner_labels = body.labels[body.faces[face_index]]
        self.labels = np.array([np.bincount(row, minlength=6).argmax() for row in corner_labels], dtype=np.int32)
        self.tree = cKDTree(self.points)

    def query(self, points: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Signed distance (negative inside, approximate), outward normal and label of the nearest sample."""
        _, index = self.tree.query(points, workers=-1)
        offset = points - self.points[index]
        return np.einsum("ij,ij->i", offset, self.normals[index]), self.normals[index], self.labels[index]


def axilla(body: RestBody, arm_label: int) -> np.ndarray:
    """Armpit apex: lowest body vertex on the boundary between torso- and arm-dominant skin."""
    edges = np.concatenate([body.faces[:, [0, 1]], body.faces[:, [1, 2]], body.faces[:, [2, 0]]])
    a, b = body.labels[edges[:, 0]], body.labels[edges[:, 1]]
    boundary = np.unique(edges[((a == TORSO) & (b == arm_label)) | ((a == arm_label) & (b == TORSO))])
    if not len(boundary):
        raise RuntimeError("Body has no torso/arm skin boundary; cannot locate the axilla.")
    return body.vertices[boundary[body.vertices[boundary, 1].argmin()]]


def underarm_gap(grid: np.ndarray, marks: dict[str, Any], rules: FitRules) -> np.ndarray:
    """Positive inside a thin slab bisecting the torso-side/arm wedge below each axilla (a real shirt's side/underarm seam gap)."""
    result = np.full(grid.shape[:3], -1.0, dtype=np.float32)
    for side in ("l", "r"):
        sleeve = marks["sleeves"][side]
        arm = sleeve["direction"] * np.array([1.0, 1.0, 0.0])
        bisector = np.array([0.0, -1.0, 0.0]) + arm / np.linalg.norm(arm)
        bisector /= np.linalg.norm(bisector)
        normal = np.cross(bisector, [0.0, 0.0, 1.0])
        relative = grid - sleeve["axilla"]
        along = relative @ bisector
        slab = np.minimum(np.minimum(rules.underarm_separation_m - np.abs(relative @ normal), along), rules.underarm_length_m - along)
        result = np.maximum(result, slab.astype(np.float32))
    return result


def landmarks(body: RestBody, rules: FitRules) -> dict[str, Any]:
    hip_y = float((body.joint("l_upleg")[1] + body.joint("r_upleg")[1]) / 2)
    neck = body.joint("c_neck")
    sleeves = {}
    for side in ("l", "r"):
        shoulder, elbow = body.joint(f"{side}_uparm"), body.joint(f"{side}_lowarm")
        direction = (elbow - shoulder) / np.linalg.norm(elbow - shoulder)
        sleeves[side] = {"shoulder": shoulder, "direction": direction, "end": shoulder + rules.sleeve_length_ratio * (elbow - shoulder), "length": float(np.linalg.norm(elbow - shoulder)), "axilla": axilla(body, LEFT_ARM if side == "l" else RIGHT_ARM)}
    return {"hem_y": hip_y - rules.hem_below_hip_m, "hang_y": float(body.joint("c_spine3")[1]) - rules.hang_start_below_spine3_m, "shoulder_y": float((sleeves["l"]["shoulder"][1] + sleeves["r"]["shoulder"][1]) / 2), "neck": neck, "top_y": float(neck[1]) + rules.top_above_neck_m, "sleeves": sleeves}


def ease_profile(y: np.ndarray, marks: dict[str, Any], rules: FitRules) -> np.ndarray:
    heights = [marks["hem_y"], marks["hang_y"], marks["shoulder_y"]]
    return np.interp(y, heights, [rules.ease_hem_m, rules.ease_chest_m, rules.ease_shoulder_m])


def garment_fields(body: RestBody, surface: BodySurface, rules: FitRules, marks: dict[str, Any]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Component fields on a grid: index 0 is the garment volume, 1.. are cuts (positive = removed)."""
    h = rules.voxel_m
    left, right = marks["sleeves"]["l"]["end"], marks["sleeves"]["r"]["end"]
    lo = np.array([min(right[0], left[0]) - 0.12, marks["hem_y"] - 0.04, body.vertices[:, 2].min() - 0.08])
    hi = np.array([max(right[0], left[0]) + 0.12, marks["top_y"] + 0.04, body.vertices[:, 2].max() + 0.08])
    axes = [np.arange(lo[i], hi[i] + h, h) for i in range(3)]
    grid = np.stack(np.meshgrid(*axes, indexing="ij"), axis=-1)
    points = grid.reshape(-1, 3)
    signed, _, labels = surface.query(points)
    shape = grid.shape[:3]
    inside = (signed < 0).reshape(shape)
    labels = labels.reshape(shape)
    core = inside & (labels != FOREARM_HAND)
    # Hang fill: torso silhouette at the hang height drops straight down to the hem (vertical sweep).
    torso = inside & (labels == TORSO)
    y_axis = axes[1]
    hang_index = int(np.searchsorted(y_axis, marks["hang_y"]))
    hem_index = max(int(np.searchsorted(y_axis, marks["hem_y"])) - 2, 0)
    for j in range(hang_index - 1, hem_index - 1, -1):
        torso[:, j, :] |= torso[:, j + 1, :]
    core |= torso
    outside_distance = ndimage.distance_transform_edt(~core, sampling=h) - h / 2
    inside_distance = ndimage.distance_transform_edt(core, sampling=h) - h / 2
    distance = np.where(core, -inside_distance, outside_distance)
    distance = ndimage.gaussian_filter(distance, sigma=rules.field_blur_voxels)  # removes EDT quantization terraces
    is_arm = (labels == LEFT_ARM) | (labels == RIGHT_ARM)
    ease = np.where(is_arm, rules.ease_sleeve_m, ease_profile(grid[..., 1], marks, rules))
    ease = ndimage.gaussian_filter(ease, sigma=rules.ease_blur_m / h)
    garment = distance - ease
    gap = underarm_gap(grid, marks, rules) if rules.underarm_separation_m > 0 else None
    if gap is not None:  # part of the garment's own shape (its faces are kept), not an opening cut
        garment = np.maximum(garment, gap)
    components = [garment, marks["hem_y"] - grid[..., 1], grid[..., 1] - marks["top_y"]]
    for side in ("l", "r"):
        sleeve = marks["sleeves"][side]
        relative = grid - sleeve["end"]
        along = relative @ sleeve["direction"]
        radial = np.linalg.norm(relative - along[..., None] * sleeve["direction"], axis=-1)
        components.append(np.minimum(along, rules.sleeve_cut_radius_m - radial))
    neck = marks["neck"]
    collar_normal = np.array([0.0, 1.0, rules.neck_front_slope]) / np.hypot(1.0, rules.neck_front_slope)
    collar = (grid - (neck - np.array([0.0, rules.neck_drop_back_m, 0.0]))) @ collar_normal
    neck_radial = np.hypot(grid[..., 0] - neck[0], grid[..., 2] - neck[2])
    # A cone that widens upward cuts the neck column transversely instead of grazing the shoulders.
    cone_radius = rules.neck_radius_m + rules.neck_cone_slope * np.clip(grid[..., 1] - neck[1], 0.0, None)
    components.append(np.minimum(collar, cone_radius - neck_radial))
    stack = np.stack(components).astype(np.float32)
    stack[:, [0, -1], :, :] = stack[:, :, [0, -1], :] = stack[:, :, :, [0, -1]] = 1.0  # closed grid border
    stack[1:, [0, -1], :, :] = stack[1:, :, [0, -1], :] = stack[1:, :, :, [0, -1]] = -1.0
    clean_garment_solid(stack, rules)
    if rules.gusset_close_voxels:
        armpit_gusset(stack, grid, marks, rules)
    if gap is not None:  # morphological closing must not re-bridge the underarm gap
        stack[0] = np.maximum(stack[0], gap)
    return stack, lo, np.array([len(a) for a in axes])


def clean_garment_solid(stack: np.ndarray, rules: FitRules) -> None:
    """Close sub-voxel gaps (armpits) and open sub-voxel slivers so surface nets stays 2-manifold.

    Only the garment component is replaced, and only near voxels the morphology changed; cut
    components still win in the max, so openings can never be closed over.
    """
    h = rules.voxel_m
    solid = stack.max(axis=0) < 0
    ball = ndimage.generate_binary_structure(3, 1)
    cleaned = ndimage.binary_closing(solid, ball, iterations=rules.close_voxels)
    cleaned = ndimage.binary_opening(cleaned, ball, iterations=rules.open_voxels)
    changed = ndimage.binary_dilation(cleaned != solid, ball, iterations=2)
    if not changed.any():
        return
    signed = np.where(cleaned, -(ndimage.distance_transform_edt(cleaned, sampling=h) - h / 2), ndimage.distance_transform_edt(~cleaned, sampling=h) - h / 2)
    stack[0] = np.where(changed, signed, stack[0])


def armpit_gusset(stack: np.ndarray, grid: np.ndarray, marks: dict[str, Any], rules: FitRules) -> None:
    """Close the garment solid more strongly near each axilla, giving the underarm a broader gusset of material
    that opens gradually when the arm is raised instead of a tight crease of tiny triangles."""
    h = rules.voxel_m
    solid = stack.max(axis=0) < 0
    region = np.zeros(solid.shape, dtype=bool)
    for side in ("l", "r"):
        region |= np.linalg.norm(grid - marks["sleeves"][side]["axilla"], axis=-1) < rules.gusset_radius_m
    ball = ndimage.generate_binary_structure(3, 1)
    closed = ndimage.binary_closing(solid, ball, iterations=rules.gusset_close_voxels, border_value=0)
    filled = solid | (closed & region)
    changed = ndimage.binary_dilation(filled != solid, ball, iterations=2)
    if not changed.any():
        return
    signed = np.where(filled, -(ndimage.distance_transform_edt(filled, sampling=h) - h / 2), ndimage.distance_transform_edt(~filled, sampling=h) - h / 2)
    stack[0] = np.where(changed, np.minimum(stack[0], signed), stack[0])


def surface_nets(stack: np.ndarray, origin: np.ndarray, h: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Naive surface nets on max(stack); returns vertices, triangles and a per-triangle 'cap' flag."""
    field = stack.max(axis=0)
    inside = field < 0
    nx, ny, nz = field.shape
    corners = np.array([[i, j, k] for i in (0, 1) for j in (0, 1) for k in (0, 1)])
    edges = [(a, b) for a in range(8) for b in range(a + 1, 8) if np.abs(corners[a] - corners[b]).sum() == 1]
    cell_shape = (nx - 1, ny - 1, nz - 1)
    total, count = np.zeros(cell_shape + (3,)), np.zeros(cell_shape)

    def corner(values: np.ndarray, offset: np.ndarray) -> np.ndarray:
        return values[offset[0]:offset[0] + nx - 1, offset[1]:offset[1] + ny - 1, offset[2]:offset[2] + nz - 1]

    for a, b in edges:
        fa, fb = corner(field, corners[a]), corner(field, corners[b])
        crossing = (fa < 0) != (fb < 0)
        t = np.where(crossing, fa / np.where(crossing, fa - fb, 1.0), 0.0)
        position = corners[a] + t[..., None] * (corners[b] - corners[a])
        total += np.where(crossing[..., None], position, 0.0)
        count += crossing
    active = count > 0
    cell_index = -np.ones(cell_shape, dtype=np.int64)
    cell_index[active] = np.arange(active.sum())
    base = np.stack(np.nonzero(active), axis=-1).astype(np.float64)
    vertices = origin + h * (base + total[active] / count[active][:, None])

    quads, caps = [], []
    for axis in range(3):
        u, v = (axis + 1) % 3, (axis + 2) % 3
        step = np.zeros(3, dtype=int)
        step[axis] = 1
        lower = inside[: nx - step[0], : ny - step[1], : nz - step[2]]
        upper = inside[step[0]:, step[1]:, step[2]:]
        crossing = lower != upper
        for d in (u, v):  # quads need the cells at index-1 along both other axes
            crossing[tuple(slice(0, 1) if axis_d == d else slice(None) for axis_d in range(3))] = False
        idx = np.stack(np.nonzero(crossing), axis=-1)
        if not len(idx):
            continue
        fa = field[tuple(idx.T)]
        fb = field[tuple((idx + step).T)]
        t = fa / (fa - fb)
        components = stack[:, idx[:, 0], idx[:, 1], idx[:, 2]] * (1 - t) + stack[:, idx[:, 0] + step[0], idx[:, 1] + step[1], idx[:, 2] + step[2]] * t
        cap = components.argmax(axis=0) != 0
        offsets = []
        for du, dv in ((-1, -1), (0, -1), (0, 0), (-1, 0)):
            cell = idx.copy()
            cell[:, u] += du
            cell[:, v] += dv
            offsets.append(cell_index[tuple(cell.T)])
        quad = np.stack(offsets, axis=1)
        flip = lower[tuple(idx.T)]  # inside at the lower end: surface faces +axis
        quad[~flip] = quad[~flip][:, ::-1]
        quads.append(quad)
        caps.append(cap)
    quads_array, caps_array = np.concatenate(quads), np.concatenate(caps)
    if (quads_array < 0).any():
        raise RuntimeError("Surface nets produced a quad touching the grid border; enlarge the grid margin.")
    p = vertices[quads_array]
    split_first = np.linalg.norm(p[:, 0] - p[:, 2], axis=1) <= np.linalg.norm(p[:, 1] - p[:, 3], axis=1)
    tri_a = np.where(split_first[:, None], quads_array[:, [0, 1, 2]], quads_array[:, [0, 1, 3]])
    tri_b = np.where(split_first[:, None], quads_array[:, [0, 2, 3]], quads_array[:, [1, 2, 3]])
    return vertices, np.concatenate([tri_a, tri_b]), np.concatenate([caps_array, caps_array])


def boundary_loops(faces: np.ndarray) -> list[list[int]]:
    """Ordered boundary loops following each boundary edge's face orientation."""
    directed = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    keys = {tuple(edge) for edge in directed.tolist()}
    nxt = {a: b for a, b in directed.tolist() if (b, a) not in keys}
    loops, seen = [], set()
    for start in nxt:
        if start in seen:
            continue
        loop, cursor = [], start
        while cursor not in seen:
            seen.add(cursor)
            loop.append(cursor)
            cursor = nxt[cursor]
        loops.append(loop)
    return loops


def edge_uses(faces: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    edges = np.sort(np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]), axis=1)
    return np.unique(edges, axis=0, return_counts=True)


def repair_manifold(faces: np.ndarray, rounds: int = 6) -> tuple[np.ndarray, dict[str, int]]:
    """Delete faces around non-manifold edges and bow-tie boundary vertices until the surface is 2-manifold."""
    removed, initial_edges = 0, None
    for _ in range(rounds):
        edges, uses = edge_uses(faces)
        bad_edges = edges[uses > 2]
        boundary = edges[uses == 1].reshape(-1)
        vertex_ids, degree = np.unique(boundary, return_counts=True)
        bad_vertices = set(vertex_ids[degree > 2].tolist()) | set(bad_edges.reshape(-1).tolist())
        if initial_edges is None:
            initial_edges = int(len(bad_edges))
        if not bad_vertices:
            return faces, {"non_manifold_edges_found": initial_edges, "faces_removed": removed}
        drop = np.isin(faces, list(bad_vertices)).any(axis=1)
        removed += int(drop.sum())
        faces = faces[~drop]
    raise RuntimeError("Garment surface could not be made 2-manifold; adjust voxel size or cleaning.")


def fill_small_holes(mesh: trimesh.Trimesh, keep: int) -> int:
    """Fan-fill every boundary loop except the `keep` longest (the real garment openings)."""
    loops = sorted(boundary_loops(np.asarray(mesh.faces)), key=len, reverse=True)
    vertices, faces = list(np.asarray(mesh.vertices)), [np.asarray(mesh.faces)]
    for loop in loops[keep:]:
        centre = len(vertices)
        vertices.append(np.asarray(mesh.vertices)[loop].mean(axis=0))
        ring = np.array(loop)
        faces.append(np.stack([np.roll(ring, -1), ring, np.full(len(ring), centre)], axis=1))  # reverse boundary direction
    if len(loops) > keep:
        mesh.vertices, mesh.faces = np.array(vertices), np.concatenate(faces)
    return max(len(loops) - keep, 0)


def extract_outer(body: RestBody, surface: BodySurface, rules: FitRules, marks: dict[str, Any]) -> tuple[trimesh.Trimesh, dict[str, Any]]:
    stack, origin, dims = garment_fields(body, surface, rules, marks)
    vertices, faces, caps = surface_nets(stack, origin, rules.voxel_m)
    opened, repair = repair_manifold(faces[~caps])
    mesh = trimesh.Trimesh(vertices, opened, process=False)
    mesh.remove_unreferenced_vertices()
    parts = mesh.split(only_watertight=False)
    largest = max(parts, key=lambda part: len(part.faces))
    filled = fill_small_holes(largest, keep=4)
    report = {"grid_points": int(np.prod(dims)), "raw_vertices": int(len(vertices)), "components_dropped": len(parts) - 1, "dropped_faces": int(sum(len(p.faces) for p in parts) - len(largest.faces)), "manifold_repair": {**repair, "small_holes_filled": filled}}
    trimesh.smoothing.filter_taubin(largest, lamb=0.5, nu=0.53, iterations=rules.smoothing_iterations)
    return largest, report


def classify_loops(mesh: trimesh.Trimesh, marks: dict[str, Any]) -> dict[str, list[int]]:
    loops = boundary_loops(np.asarray(mesh.faces))
    if len(loops) != 4:
        raise RuntimeError(f"Expected 4 garment openings (hem, neck, two sleeves); found {len(loops)} boundary loops.")
    centres = {kind: point for kind, point in (("hem", np.array([0.0, marks["hem_y"], 0.0])), ("neck", marks["neck"]), ("left_sleeve", marks["sleeves"]["l"]["end"]), ("right_sleeve", marks["sleeves"]["r"]["end"]))}
    result: dict[str, list[int]] = {}
    for loop in loops:
        centroid = mesh.vertices[loop].mean(axis=0)
        kind = min(centres, key=lambda name: np.linalg.norm(centroid - centres[name]))
        if kind in result:
            raise RuntimeError(f"Two boundary loops matched the {kind} opening.")
        result[kind] = loop
    return result


def project_boundaries(vertices: np.ndarray, loops: dict[str, list[int]], marks: dict[str, Any]) -> None:
    """Snap hem and sleeve-end loops back onto their cut planes after smoothing (crisp openings)."""
    vertices[loops["hem"], 1] = marks["hem_y"]
    for kind, side in (("left_sleeve", "l"), ("right_sleeve", "r")):
        sleeve = marks["sleeves"][side]
        ids = loops[kind]
        offset = (vertices[ids] - sleeve["end"]) @ sleeve["direction"]
        vertices[ids] -= offset[:, None] * sleeve["direction"]


def mean_operator(mesh: trimesh.Trimesh) -> sparse.csr_matrix:
    """Uniform 1-ring averaging operator over the garment surface graph."""
    adjacency = mesh.edges_unique
    graph = sparse.coo_matrix((np.ones(len(adjacency) * 2), (np.concatenate([adjacency[:, 0], adjacency[:, 1]]), np.concatenate([adjacency[:, 1], adjacency[:, 0]]))), shape=(len(mesh.vertices),) * 2).tocsr()
    degree = np.asarray(graph.sum(axis=1)).ravel()
    return sparse.diags(1.0 / np.clip(degree, 1, None)) @ graph


def diffuse(values: np.ndarray, mean: sparse.csr_matrix, iterations: int) -> np.ndarray:
    for _ in range(iterations):
        values = 0.5 * values + 0.5 * (mean @ values)
    return values


def enforce_clearance(mesh: trimesh.Trimesh, surface: BodySurface, rules: FitRules, fixed: np.ndarray) -> dict[str, Any]:
    """Push vertices out along the body normal until the inner layer clears the body by min_clearance.

    With clearance_smoothing_iterations > 0 the push-out vectors are diffused over the surface (keeping
    each vertex's own push as a lower bound) so neighbours move together instead of crinkling the edge.
    """
    required = rules.min_clearance_m + rules.thickness_m
    moved_total, max_push = np.zeros(len(mesh.vertices), dtype=bool), 0.0
    mean = mean_operator(mesh) if rules.clearance_smoothing_iterations else None
    for _ in range(rules.clearance_passes):
        signed, normals, _ = surface.query(mesh.vertices)
        deficit = np.where(fixed, 0.0, np.clip(required - signed, 0.0, None))
        if not deficit.any():
            break
        push = normals * deficit[:, None]
        if mean is not None:
            spread = diffuse(push, mean, rules.clearance_smoothing_iterations)
            own = np.einsum("ij,ij->i", spread, normals)
            push = np.where((own < deficit)[:, None], spread + normals * (deficit - own)[:, None], spread)
            push[fixed] = 0.0
        moved = np.linalg.norm(push, axis=1)
        moved_total |= moved > 1e-9
        max_push = max(max_push, float(moved.max()))
        mesh.vertices = mesh.vertices + push
    signed, _, _ = surface.query(mesh.vertices)
    return {"vertices_pushed": int(moved_total.sum()), "max_push_m": max_push, "min_outer_clearance_m": float(signed.min()), "inner_violations": int((signed - rules.thickness_m < rules.min_clearance_m - 1e-4).sum())}


def _accumulate(dense: np.ndarray, points: np.ndarray, body: RestBody, candidates: np.ndarray, scale: np.ndarray, k: int) -> None:
    """Add scale × (inverse-distance blend of the k nearest candidate body vertices' influences) into dense."""
    if not len(candidates) or not scale.any():
        return
    distance, nearest = cKDTree(body.vertices[candidates]).query(points, k=k, workers=-1)
    inverse = 1.0 / (distance**2 + 1e-8)
    inverse /= inverse.sum(axis=1, keepdims=True)
    rows = np.arange(len(points))[:, None]
    for column in range(k):
        source = candidates[nearest[:, column]]
        np.add.at(dense, (rows, body.skin_joints[source]), (scale * inverse[:, column])[:, None] * body.skin_weights[source])


def closest_point_on_triangles(points: np.ndarray, a: np.ndarray, b: np.ndarray, c: np.ndarray) -> np.ndarray:
    """Barycentric coordinates of the closest point on each triangle (Ericson, Real-Time Collision Detection 5.1.5)."""
    ab, ac, ap = b - a, c - a, points - a
    d1, d2 = np.einsum("ij,ij->i", ab, ap), np.einsum("ij,ij->i", ac, ap)
    bp = points - b
    d3, d4 = np.einsum("ij,ij->i", ab, bp), np.einsum("ij,ij->i", ac, bp)
    cp = points - c
    d5, d6 = np.einsum("ij,ij->i", ab, cp), np.einsum("ij,ij->i", ac, cp)
    va, vb, vc = d3 * d6 - d5 * d4, d5 * d2 - d1 * d6, d1 * d4 - d3 * d2
    total = np.where(np.abs(va + vb + vc) > 1e-30, va + vb + vc, 1e-30)
    bary = np.stack([va / total, vb / total, vc / total], axis=1)  # interior
    with np.errstate(divide="ignore", invalid="ignore"):
        regions = [
            ((d1 <= 0) & (d2 <= 0), lambda: np.c_[np.ones_like(d1), np.zeros_like(d1), np.zeros_like(d1)]),
            ((d3 >= 0) & (d4 <= d3), lambda: np.c_[np.zeros_like(d1), np.ones_like(d1), np.zeros_like(d1)]),
            ((d6 >= 0) & (d5 <= d6), lambda: np.c_[np.zeros_like(d1), np.zeros_like(d1), np.ones_like(d1)]),
            ((vc <= 0) & (d1 >= 0) & (d3 <= 0), lambda: (lambda v: np.c_[1 - v, v, np.zeros_like(v)])(np.nan_to_num(d1 / (d1 - d3)))),
            ((vb <= 0) & (d2 >= 0) & (d6 <= 0), lambda: (lambda w: np.c_[1 - w, np.zeros_like(w), w])(np.nan_to_num(d2 / (d2 - d6)))),
            ((va <= 0) & (d4 - d3 >= 0) & (d5 - d6 >= 0), lambda: (lambda w: np.c_[np.zeros_like(w), 1 - w, w])(np.nan_to_num((d4 - d3) / ((d4 - d3) + (d5 - d6))))),
        ]
        assigned = np.zeros(len(points), dtype=bool)
        for mask, value in regions:  # first matching Voronoi region wins, as in the reference algorithm
            take = mask & ~assigned
            if take.any():
                bary[take] = value()[take]
                assigned |= take
    return np.clip(bary, 0.0, 1.0)


def closest_body_points(body: RestBody, points: np.ndarray, neighbours: int = 8) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Exact closest point on the body surface: (face index, barycentric coordinates, distance) per query point.

    Candidates are the faces around the nearest body vertices (exact unless the true closest face touches none
    of them, which needs triangles far larger than the vertex spacing)."""
    mesh = trimesh.Trimesh(body.vertices, body.faces, process=False)
    vertex_faces = np.asarray(mesh.vertex_faces)
    _, nearest = cKDTree(body.vertices).query(points, k=neighbours, workers=-1)
    candidates = vertex_faces[nearest].reshape(len(points), -1)
    best_face = np.full(len(points), -1)
    best_bary = np.zeros((len(points), 3))
    best_distance = np.full(len(points), np.inf)
    for column in range(candidates.shape[1]):
        face = candidates[:, column]
        valid = face >= 0
        if not valid.any():
            continue
        corners = body.vertices[body.faces[np.where(valid, face, 0)]]
        bary = closest_point_on_triangles(points, corners[:, 0], corners[:, 1], corners[:, 2])
        closest = np.einsum("ij,ijk->ik", bary, corners)
        distance = np.where(valid, np.linalg.norm(points - closest, axis=1), np.inf)
        better = distance < best_distance
        best_face[better], best_bary[better], best_distance[better] = face[better], bary[better], distance[better]
    return best_face, best_bary, best_distance


def armhole_blend(mesh: trimesh.Trimesh, labels: np.ndarray, arm_label: int, band: float) -> np.ndarray:
    """Arm fraction in [0, 1]: smoothstep of signed geodesic distance (+ arm side) to the torso/arm label boundary."""
    from scipy.sparse.csgraph import dijkstra

    edges, lengths = mesh.edges_unique, mesh.edges_unique_length
    a, b = labels[edges[:, 0]], labels[edges[:, 1]]
    is_arm = labels == arm_label
    crossing = edges[is_arm[edges[:, 0]] != is_arm[edges[:, 1]]]
    if not len(crossing):
        return is_arm.astype(np.float64)
    graph = sparse.coo_matrix((np.r_[lengths, lengths], (np.r_[edges[:, 0], edges[:, 1]], np.r_[edges[:, 1], edges[:, 0]])), shape=(len(labels),) * 2).tocsr()
    distance = dijkstra(graph, directed=False, indices=np.unique(crossing), min_only=True)
    signed = np.where(is_arm, distance, -distance)
    t = np.clip((signed + band) / (2 * band), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def transfer_weights(mesh: trimesh.Trimesh, body: RestBody, rules: FitRules, labels: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
    """Transfer skin weights from the body, smoothed over the garment.

    "nearest" (Sprint 1.0): inverse-distance blend of the 8 nearest body vertices of any group.
    "region" (Sprint 1.1): torso vertices sample only torso/leg skin, sleeve vertices only their own arm's
    skin, blended across the armhole by geodesic distance on the garment — no arm influence leaks onto
    the torso side below the armpit, and no torso influence onto the sleeve underside.
    """
    joint_count = len(body.joint_names)
    from body import joint_groups

    groups = joint_groups(body.joint_names, body.joint_parents)
    allowed = (groups != HEAD) & (groups != FOREARM_HAND)
    points = np.asarray(mesh.vertices)
    dense = np.zeros((len(points), joint_count))
    report: dict[str, Any] = {"mode": rules.weight_mode}
    if rules.weight_mode == "region":
        if labels is None:
            raise ValueError("Region weight transfer needs garment vertex labels.")
        left, right = armhole_blend(mesh, labels, LEFT_ARM, rules.weight_band_m), armhole_blend(mesh, labels, RIGHT_ARM, rules.weight_band_m)
        torso_share = np.clip(1.0 - left - right, 0.0, 1.0)
        _accumulate(dense, points, body, np.flatnonzero((body.labels == TORSO) | (body.labels == LEG)), torso_share, rules.weight_neighbours)
        _accumulate(dense, points, body, np.flatnonzero(body.labels == LEFT_ARM), left, rules.weight_neighbours)
        _accumulate(dense, points, body, np.flatnonzero(body.labels == RIGHT_ARM), right, rules.weight_neighbours)
        report["blend_band_vertices"] = int(((left > 0.01) & (left < 0.99)).sum() + ((right > 0.01) & (right < 0.99)).sum())
    elif rules.weight_mode == "projection":
        # Each garment vertex inherits the skin weights of the exact closest point on the body surface
        # (barycentric blend of that face's influences), so it moves like the skin directly beneath it.
        face, bary, distance = closest_body_points(body, points)
        for corner in range(3):
            source = body.faces[face, corner]
            np.add.at(dense, (np.arange(len(points))[:, None], body.skin_joints[source]), bary[:, corner:corner + 1] * body.skin_weights[source])
        report["projection_distance_max_m"] = float(distance.max())
        report["projection_distance_median_m"] = float(np.median(distance))
        if rules.discontinuity_ratio > 0:
            # Neighbouring garment vertices that project onto different body surfaces (e.g. arm vs torso across the
            # A-pose armpit gap) inherit unrelated weights; diffuse weights only in a geodesic band around those edges.
            from scipy.sparse.csgraph import dijkstra

            projected = np.einsum("vc,vcd->vd", bary, body.vertices[body.faces[face]])
            edges, lengths = mesh.edges_unique, mesh.edges_unique_length
            ratio = np.linalg.norm(projected[edges[:, 0]] - projected[edges[:, 1]], axis=1) / np.clip(lengths, 1e-9, None)
            seeds = np.unique(edges[ratio > rules.discontinuity_ratio])
            report["discontinuity_edges"] = int((ratio > rules.discontinuity_ratio).sum())
            if len(seeds):
                graph = sparse.coo_matrix((np.r_[lengths, lengths], (np.r_[edges[:, 0], edges[:, 1]], np.r_[edges[:, 1], edges[:, 0]])), shape=(len(points),) * 2).tocsr()
                reach = dijkstra(graph, directed=False, indices=seeds, min_only=True, limit=rules.discontinuity_radius_m)
                band = np.clip(1.0 - reach / rules.discontinuity_radius_m, 0.0, 1.0)[:, None]  # 1 at the seam, 0 at the radius
                band = band * band * (3 - 2 * band)
                dense[:, ~allowed] = 0.0
                dense /= np.clip(dense.sum(axis=1, keepdims=True), 1e-12, None)
                mean = mean_operator(mesh)
                for _ in range(rules.discontinuity_iterations):
                    dense = dense + band * 0.5 * ((mean @ dense) - dense)
                report["discontinuity_band_vertices"] = int((band[:, 0] > 0).sum())
                if rules.discontinuity_spatial_radius_m > 0:
                    # Across a fold, vertices millimetres apart in space can be far apart along the surface; a Gaussian
                    # average over 3D neighbours makes them move together so short crease edges are not torn.
                    radius = rules.discontinuity_spatial_radius_m
                    inside = np.flatnonzero(band[:, 0] > 0)
                    tree = cKDTree(points)
                    averaged = dense.copy()
                    for vertex, neighbours in zip(inside, tree.query_ball_point(points[inside], radius, workers=-1)):
                        neighbours = np.asarray(neighbours)
                        weight = np.exp(-0.5 * (np.linalg.norm(points[neighbours] - points[vertex], axis=1) / (radius / 2)) ** 2)
                        averaged[vertex] = weight @ dense[neighbours] / weight.sum()
                    dense = dense + band * (averaged - dense)
    elif rules.weight_mode == "nearest":
        _accumulate(dense, points, body, np.arange(len(body.vertices)), np.ones(len(points)), rules.weight_neighbours)
    else:
        raise ValueError(f"Unknown weight mode: {rules.weight_mode}")
    dense[:, ~allowed] = 0.0
    dense /= np.clip(dense.sum(axis=1, keepdims=True), 1e-12, None)
    dense = diffuse(dense, mean_operator(mesh), rules.weight_smoothing_iterations)
    order = np.argsort(dense, axis=1)[:, -4:][:, ::-1]
    weights = np.take_along_axis(dense, order, axis=1)
    weights /= weights.sum(axis=1, keepdims=True)
    dropped = 1.0 - np.take_along_axis(dense, order, axis=1).sum(axis=1)
    report.update({"max_weight_mass_dropped_by_top4": float(dropped.max()), "joints_used": int(len(np.unique(order[weights > 1e-4])))})
    if rules.weight_mode == "nearest":
        report.pop("mode")  # keep the Sprint 1.0 report shape unchanged
    return order.astype(np.int64), weights, report


UV_ISLANDS = {REGION_TORSO: (0.0, 0.6), REGION_LEFT_SLEEVE: (0.62, 0.17), REGION_RIGHT_SLEEVE: (0.81, 0.17)}  # (u start, u width)


def panel_coordinates(points: np.ndarray, region: int, marks: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]:
    """Cylindrical angle and v: torso around the vertical neck axis (seam at centre back), sleeves around arm axes."""
    if region == REGION_TORSO:
        angle = np.arctan2(points[:, 0] - marks["neck"][0], points[:, 2] - marks["neck"][2])
        return angle, (points[:, 1] - marks["hem_y"]) / (marks["top_y"] - marks["hem_y"])
    sleeve = marks["sleeves"]["l" if region == REGION_LEFT_SLEEVE else "r"]
    direction = sleeve["direction"]
    e1 = np.cross(direction, [0.0, 0.0, 1.0])
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(direction, e1)
    relative = points - sleeve["shoulder"]
    return np.arctan2(relative @ e2, relative @ e1), 0.5 + (relative @ direction) / (2.0 * sleeve["length"])


def corner_uvs(vertices: np.ndarray, faces: np.ndarray, region: np.ndarray, marks: dict[str, Any]) -> np.ndarray:
    """Per-corner UVs in each face's majority panel, unwrapped so no face spans a cylindrical seam."""
    face_region = np.array([np.bincount(row, minlength=3).argmax() for row in region[faces]])
    uv = np.zeros(faces.shape + (2,))
    for value, (start, span) in UV_ISLANDS.items():
        selected = np.flatnonzero(face_region == value)
        if not len(selected):
            continue
        reference, _ = panel_coordinates(vertices[faces[selected, 0]], value, marks)
        for c in range(3):
            angle, v = panel_coordinates(vertices[faces[selected, c]], value, marks)
            angle = np.where(angle - reference > np.pi, angle - 2 * np.pi, np.where(reference - angle > np.pi, angle + 2 * np.pi, angle))
            uv[selected, c, 0] = start + span * (angle + np.pi) / (2 * np.pi)
            uv[selected, c, 1] = v
    return uv


def design_tshirt(body: RestBody, rules: FitRules = FitRules()) -> tuple[OuterGarment, BodySurface]:
    surface = BodySurface(body, rules.body_samples, rules.seed)
    marks = landmarks(body, rules)
    mesh, report = extract_outer(body, surface, rules, marks)
    loops = classify_loops(mesh, marks)
    vertices = np.array(mesh.vertices)
    project_boundaries(vertices, loops, marks)
    mesh.vertices = vertices
    fixed = np.zeros(len(vertices), dtype=bool)
    report["clearance"] = enforce_clearance(mesh, surface, rules, fixed)
    _, _, labels = surface.query(mesh.vertices)
    region = np.select([labels == LEFT_ARM, labels == RIGHT_ARM], [REGION_LEFT_SLEEVE, REGION_RIGHT_SLEEVE], REGION_TORSO).astype(np.int32)
    joints, weights, weight_report = transfer_weights(mesh, body, rules, labels)
    report["weights"] = weight_report
    report["landmarks"] = {"hem_y": marks["hem_y"], "hang_y": marks["hang_y"], "shoulder_y": marks["shoulder_y"], "top_y": marks["top_y"]}
    report["rules"] = rules_record(rules)
    faces = np.asarray(mesh.faces)
    garment = OuterGarment(np.array(mesh.vertices), faces, corner_uvs(np.array(mesh.vertices), faces, region, marks), joints, weights, region, loops, report)
    if rules.underarm_panel_radius_m > 0:  # Sprint 1.3: replace each underarm disk with an explicit stitched gusset panel
        from gusset import add_underarm_gussets

        garment, gusset_report = add_underarm_gussets(garment, body, surface, marks, rules)
        garment.report["gusset"] = gusset_report
    return garment, surface


def retarget(garment: OuterGarment, source: RestBody, target: RestBody, rules: FitRules = FitRules()) -> OuterGarment:
    """Move the same garment (topology, UVs, weights) by the body's own displacement field (same MHR topology)."""
    if source.vertices.shape != target.vertices.shape or not np.array_equal(source.faces, target.faces):
        raise ValueError("Retargeting requires bodies with identical MHR topology.")
    distance, index = cKDTree(source.vertices).query(garment.vertices, k=rules.weight_neighbours, workers=-1)
    inverse = 1.0 / (distance**2 + 1e-8)
    inverse /= inverse.sum(axis=1, keepdims=True)
    displacement = np.einsum("vk,vkd->vd", inverse, target.vertices[index] - source.vertices[index])
    raw = displacement
    if rules.retarget_smoothing_iterations:  # an 8-NN blend is only C0 across Voronoi cells; diffuse it over the garment
        displacement = diffuse(displacement, mean_operator(trimesh.Trimesh(garment.vertices, garment.faces, process=False)), rules.retarget_smoothing_iterations)
    moved = OuterGarment(garment.vertices + displacement, garment.faces.copy(), garment.corner_uv.copy(), garment.joints.copy(), garment.weights.copy(), garment.region.copy(), {k: list(v) for k, v in garment.boundaries.items()}, dict(garment.report))
    moved.report = {"retarget_displacement_max_m": float(np.linalg.norm(displacement, axis=1).max()), "retarget_displacement_mean_m": float(np.linalg.norm(displacement, axis=1).mean())}
    if rules.retarget_smoothing_iterations:
        moved.report["retarget_smoothing_change_max_m"] = float(np.linalg.norm(displacement - raw, axis=1).max())
    return moved


def assemble(garment: OuterGarment, thickness: float) -> dict[str, np.ndarray]:
    """Split UV seams, add a thickness layer and closed rims; returns glTF-ready vertex arrays."""
    mesh = trimesh.Trimesh(garment.vertices, garment.faces, process=False)
    normals = np.asarray(mesh.vertex_normals)
    corners = garment.faces.reshape(-1)
    uv = garment.corner_uv.reshape(-1, 2)
    keys = np.concatenate([corners[:, None].astype(np.float64), np.round(uv, 6)], axis=1)
    unique, first, inverse = np.unique(keys, axis=0, return_index=True, return_inverse=True)
    source = corners[first]
    layer_faces = inverse.reshape(-1, 3)
    n = len(source)

    def attributes(ids: np.ndarray) -> dict[str, np.ndarray]:
        return {"joints": garment.joints[ids], "weights": garment.weights[ids], "region": garment.region[ids]}

    vertex_uv = np.zeros((len(garment.vertices), 2))
    vertex_uv[corners] = uv  # one representative UV per welded vertex, used only on the narrow rims
    outer = {"position": garment.vertices[source], "normal": normals[source], "uv": uv[first], **attributes(source)}
    inner = {"position": garment.vertices[source] - normals[source] * thickness, "normal": -normals[source], "uv": uv[first], **attributes(source)}
    rim_parts: list[dict[str, np.ndarray]] = []
    rim_faces: list[np.ndarray] = []
    offset = 2 * n
    openings: dict[str, list[int]] = {}
    for kind, loop in garment.boundaries.items():
        # Loops follow the outer faces' boundary edges a→b, so the rim must traverse b→a (outer) and a→b (inner).
        a = np.array(loop)
        b = np.roll(a, -1)
        corners_ab = [garment.vertices[a], garment.vertices[b], garment.vertices[a] - normals[a] * thickness, garment.vertices[b] - normals[b] * thickness]
        rim_normal = np.cross(corners_ab[0] - corners_ab[1], corners_ab[2] - corners_ab[1])
        rim_normal /= np.clip(np.linalg.norm(rim_normal, axis=1, keepdims=True), 1e-12, None)
        for ids, position in zip((a, b, a, b), corners_ab):
            rim_parts.append({"position": position, "normal": rim_normal, "uv": vertex_uv[ids], **attributes(ids)})
        m = len(a)
        ao, bo, ai, bi = (offset + i * m + np.arange(m) for i in range(4))
        rim_faces.append(np.concatenate([np.stack([bo, ao, ai], 1), np.stack([bo, ai, bi], 1)]))
        openings[kind] = ao.tolist()  # outer-edge vertex of each rim segment, in loop order
        offset += 4 * m
    parts = [outer, inner] + rim_parts
    arrays: dict[str, Any] = {key: np.concatenate([part[key] for part in parts]) for key in outer}
    arrays["faces"] = np.concatenate([layer_faces, layer_faces[:, ::-1] + n] + rim_faces)
    arrays["openings"] = openings
    return arrays


# Sprint 1.3: v2 plus one explicit underarm gusset panel per side (gusset.py).
V4_RULES = replace(V2_RULES, underarm_panel_radius_m=0.04, underarm_panel_target_stretch=4.0)
