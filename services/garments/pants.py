"""Basic straight-leg pants for an MHR rest body (Sprint 2.0A).

The volume is built like the T-shirt (tshirt.py): fields on a voxel grid, surface nets, manifold repair, Taubin
smoothing, a clearance pass, then v2-style projection skin weights. Pants-specific parts:

- Seat and thighs: the body (torso and leg skin groups) offset by an ease that tapers from the waist to the thigh.
- Straight legs: below the knee, each leg is a straight tube around an axis fitted through the leg's cross-section
  centroids (knee to ankle), with the radius of the widest body section plus ease, so the hem is as wide as the calf.
- Crotch seam: a thin vertical slab on the midline below the crotch splits the two legs. It is part of the garment
  shape (its faces are kept), as is the T-shirt's underarm gap.
- Openings: a horizontal waist cut (the waistband rim is closed by assemble's thickness rims) and one hem cut per leg,
  perpendicular to its axis.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import trimesh
from scipy import ndimage

from body import LEG, TORSO, RestBody
from tshirt import V2_RULES, BodySurface, FitRules, OuterGarment, boundary_loops, clean_garment_solid, enforce_clearance, fill_small_holes, repair_manifold, surface_nets, transfer_weights

REGION_SEAT, REGION_LEFT_LEG, REGION_RIGHT_LEG, REGION_WAISTBAND = range(4)
REGION_NAMES = ("seat", "left_leg", "right_leg", "waistband")
OPENINGS = ("waist", "left_hem", "right_hem")


@dataclass(frozen=True)
class PantsRules:
    fit: FitRules = field(default_factory=lambda: V2_RULES)  # voxel size, clearance, thickness, smoothing and weights
    waist_above_hip_m: float = 0.06  # waist cut height above the hip joints
    ease_waist_m: float = 0.008
    ease_hip_m: float = 0.02
    ease_thigh_m: float = 0.022
    ease_leg_m: float = 0.012  # straight-leg tube radius beyond the widest body section below the knee
    tube_start_above_knee_m: float = 0.10  # the tube starts this far above the knee (overlaps the thigh)
    body_offset_end_above_knee_m: float = 0.05  # the body-offset volume stops here; the tube continues below
    hem_above_ankle_m: float = 0.04
    crotch_drop_m: float = 0.02  # the legs split this far below the body's lowest midline point
    crotch_gap_half_m: float = 0.005
    waistband_m: float = 0.04  # region label only
    crotch_blend_band_m: float = 0.06  # half-width of the symmetric left/right weight blend at the crotch (0 = off)
    crotch_blend_height_m: float = 0.06  # the blend fades out this far above the body's crotch point


def leg_axis(body: RestBody, side: str) -> dict[str, Any]:
    """Straight-leg axis: a line fitted through the leg's cross-section centroids from knee to ankle."""
    knee, ankle = body.joint(f"{side}_lowleg"), body.joint(f"{side}_foot")
    shank = (ankle - knee) / np.linalg.norm(ankle - knee)
    length = float(np.linalg.norm(ankle - knee))
    points = body.vertices[(body.labels == LEG) & (np.sign(body.vertices[:, 0]) == (1 if side == "l" else -1))]
    t = (points - knee) @ shank
    centroids = np.array([points[(t >= lo) & (t < lo + 0.02)].mean(axis=0) for lo in np.arange(-0.05, length - 0.06, 0.02)])
    centre = centroids.mean(axis=0)
    direction = np.linalg.svd(centroids - centre)[2][0]
    direction *= np.sign(direction @ shank)  # points down the leg
    relative = points - centre
    along = relative @ direction
    radial = np.linalg.norm(relative - along[:, None] * direction, axis=1)
    knee_t, ankle_t = float((knee - centre) @ direction), float((ankle - centre) @ direction)
    section = (along > knee_t - 0.05) & (along < ankle_t - 0.06)
    return {"centre": centre, "direction": direction, "knee_t": knee_t, "ankle_t": ankle_t, "body_radius": float(radial[section].max())}


def pants_landmarks(body: RestBody, rules: PantsRules) -> dict[str, Any]:
    hip_y = float((body.joint("l_upleg")[1] + body.joint("r_upleg")[1]) / 2)
    midline = np.abs(body.vertices[:, 0]) < 0.01
    crotch_y = float(body.vertices[midline, 1].min())
    legs = {}
    for side in ("l", "r"):
        axis = leg_axis(body, side)
        axis["radius"] = axis["body_radius"] + rules.ease_leg_m
        axis["hem_t"] = axis["ankle_t"] - rules.hem_above_ankle_m
        axis["hem_centre"] = axis["centre"] + axis["hem_t"] * axis["direction"]
        legs[side] = axis
    knee_y = float((body.joint("l_lowleg")[1] + body.joint("r_lowleg")[1]) / 2)
    return {"hip_y": hip_y, "waist_y": hip_y + rules.waist_above_hip_m, "crotch_y": crotch_y, "seam_y": crotch_y - rules.crotch_drop_m, "knee_y": knee_y, "legs": legs}


def _tube(grid: np.ndarray, leg: dict[str, Any], radius: float) -> tuple[np.ndarray, np.ndarray]:
    relative = grid - leg["centre"]
    along = relative @ leg["direction"]
    radial = np.linalg.norm(relative - along[..., None] * leg["direction"], axis=-1)
    return along, radial - radius


def pants_fields(body: RestBody, surface: BodySurface, rules: PantsRules, marks: dict[str, Any]) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Component fields: index 0 the pants volume, 1.. the opening cuts (positive = removed)."""
    h = rules.fit.voxel_m
    hem_y = min(leg["hem_centre"][1] for leg in marks["legs"].values())
    legs_x = max(abs(leg["hem_centre"][0]) + leg["radius"] for leg in marks["legs"].values())
    hips = body.vertices[(body.vertices[:, 1] > marks["seam_y"]) & (body.vertices[:, 1] < marks["waist_y"]) & ((body.labels == TORSO) | (body.labels == LEG))]
    half_width = max(legs_x, np.abs(hips[:, 0]).max()) + 0.08
    lo = np.array([-half_width, hem_y - 0.08, body.vertices[:, 2].min() - 0.08])
    hi = np.array([half_width, marks["waist_y"] + 0.05, body.vertices[:, 2].max() + 0.08])
    axes = [np.arange(lo[i], hi[i] + h, h) for i in range(3)]
    grid = np.stack(np.meshgrid(*axes, indexing="ij"), axis=-1)
    signed, _, labels = surface.query(grid.reshape(-1, 3))
    shape = grid.shape[:3]
    core = (signed < 0).reshape(shape) & np.isin(labels.reshape(shape), (TORSO, LEG))
    outside = ndimage.distance_transform_edt(~core, sampling=h) - h / 2
    inside = ndimage.distance_transform_edt(core, sampling=h) - h / 2
    distance = ndimage.gaussian_filter(np.where(core, -inside, outside), sigma=rules.fit.field_blur_voxels)
    y = grid[..., 1]
    ease = np.interp(y, [marks["knee_y"], marks["seam_y"], marks["hip_y"], marks["waist_y"]], [rules.ease_thigh_m, rules.ease_thigh_m, rules.ease_hip_m, rules.ease_waist_m])
    garment = np.maximum(distance - ease, marks["knee_y"] + rules.body_offset_end_above_knee_m - y)  # body offset above the knee only
    cuts = [y - marks["waist_y"]]
    for side in ("l", "r"):
        leg = marks["legs"][side]
        along, radial = _tube(grid, leg, leg["radius"])
        garment = np.minimum(garment, np.maximum(radial, leg["knee_t"] - rules.tube_start_above_knee_m - along))
        cuts.append(np.minimum(along - leg["hem_t"], leg["radius"] + 0.05 - (radial + leg["radius"])))
    gap = np.minimum(rules.crotch_gap_half_m - np.abs(grid[..., 0]), marks["seam_y"] - y)
    garment = np.maximum(garment, gap)
    stack = np.stack([garment] + cuts).astype(np.float32)
    stack[:, [0, -1], :, :] = stack[:, :, [0, -1], :] = stack[:, :, :, [0, -1]] = 1.0  # closed grid border
    stack[1:, [0, -1], :, :] = stack[1:, :, [0, -1], :] = stack[1:, :, :, [0, -1]] = -1.0
    clean_garment_solid(stack, rules.fit)
    stack[0] = np.maximum(stack[0], gap)  # closing must not re-bridge the crotch seam
    return stack, lo, np.array([len(a) for a in axes]), grid


def classify_pants_loops(mesh: trimesh.Trimesh, marks: dict[str, Any]) -> dict[str, list[int]]:
    loops = boundary_loops(np.asarray(mesh.faces))
    if len(loops) != 3:
        raise RuntimeError(f"Expected 3 pants openings (waist, two hems); found {len(loops)} boundary loops.")
    centres = {"waist": np.array([0.0, marks["waist_y"], 0.0]), "left_hem": marks["legs"]["l"]["hem_centre"], "right_hem": marks["legs"]["r"]["hem_centre"]}
    result: dict[str, list[int]] = {}
    for loop in loops:
        kind = min(centres, key=lambda name: np.linalg.norm(mesh.vertices[loop].mean(axis=0) - centres[name]))
        if kind in result:
            raise RuntimeError(f"Two boundary loops matched the {kind} opening.")
        result[kind] = loop
    return result


def project_pants_boundaries(vertices: np.ndarray, loops: dict[str, list[int]], marks: dict[str, Any]) -> None:
    vertices[loops["waist"], 1] = marks["waist_y"]
    for kind, side in (("left_hem", "l"), ("right_hem", "r")):
        leg, ids = marks["legs"][side], loops[kind]
        offset = (vertices[ids] - leg["hem_centre"]) @ leg["direction"]
        vertices[ids] -= offset[:, None] * leg["direction"]


def pants_regions(vertices: np.ndarray, marks: dict[str, Any], rules: PantsRules) -> np.ndarray:
    region = np.where(vertices[:, 1] > marks["seam_y"], REGION_SEAT, np.where(vertices[:, 0] > 0, REGION_LEFT_LEG, REGION_RIGHT_LEG))
    return np.where(vertices[:, 1] > marks["waist_y"] - rules.waistband_m, REGION_WAISTBAND, region).astype(np.int32)


UV_ISLANDS = {REGION_SEAT: (0.0, 0.5), REGION_WAISTBAND: (0.0, 0.5), REGION_LEFT_LEG: (0.52, 0.23), REGION_RIGHT_LEG: (0.77, 0.23)}


def _panel(points: np.ndarray, region: int, marks: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]:
    if region in (REGION_SEAT, REGION_WAISTBAND):  # around the vertical axis, seam at centre back
        bottom = marks["seam_y"] - 0.1
        return np.arctan2(points[:, 0], points[:, 2]), (points[:, 1] - bottom) / (marks["waist_y"] - bottom)
    leg = marks["legs"]["l" if region == REGION_LEFT_LEG else "r"]
    e1 = np.cross(leg["direction"], [0.0, 0.0, 1.0])
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(leg["direction"], e1)
    relative = points - leg["centre"]
    along = relative @ leg["direction"]
    return np.arctan2(relative @ e2, relative @ e1), (leg["hem_t"] - along) / (leg["hem_t"] - leg["knee_t"] + 0.45)


def pants_corner_uvs(vertices: np.ndarray, faces: np.ndarray, region: np.ndarray, marks: dict[str, Any]) -> np.ndarray:
    """Per-corner cylindrical UVs per panel, unwrapped so no face spans the panel seam (as tshirt.corner_uvs)."""
    face_region = np.array([np.bincount(row, minlength=4).argmax() for row in region[faces]])
    uv = np.zeros(faces.shape + (2,))
    for value, (start, span) in UV_ISLANDS.items():
        selected = np.flatnonzero(face_region == value)
        if not len(selected):
            continue
        reference, _ = _panel(vertices[faces[selected, 0]], value, marks)
        for c in range(3):
            angle, v = _panel(vertices[faces[selected, c]], value, marks)
            angle = np.where(angle - reference > np.pi, angle - 2 * np.pi, np.where(reference - angle > np.pi, angle + 2 * np.pi, angle))
            uv[selected, c, 0] = start + span * (angle + np.pi) / (2 * np.pi)
            uv[selected, c, 1] = np.clip(v, 0.0, 1.0)
    return uv


def symmetrize_crotch_weights(vertices: np.ndarray, joints: np.ndarray, weights: np.ndarray, names: tuple[str, ...], marks: dict[str, Any], band_m: float, height_m: float) -> tuple[np.ndarray, np.ndarray, int]:
    """Blend each crotch vertex's weights with their left/right-swapped copy: 50/50 on the midline, unchanged at the
    band edge, so the left/right leg share changes smoothly across the band instead of jumping across one row of seam
    triangles."""
    index = {name: k for k, name in enumerate(names)}
    mirror_joint = np.array([index.get(("r_" + n[2:]) if n.startswith("l_") else ("l_" + n[2:]) if n.startswith("r_") else n, k) for k, n in enumerate(names)])
    dense = np.zeros((len(vertices), len(names)))
    np.put_along_axis(dense, joints, weights, axis=1)
    mirrored = np.zeros_like(dense)
    mirrored[:, mirror_joint] = dense  # the vertex's own weights with left and right swapped
    # distance from the crotch seam: |x| above it, and down the inner leg below it (the two inner-leg surfaces sit only
    # millimetres from the midline there, so |x| alone would blend whole inner legs)
    distance = np.hypot(vertices[:, 0], np.clip(marks["seam_y"] - vertices[:, 1], 0.0, None))
    t = np.clip(distance / band_m, 0.0, 1.0)
    own = 0.5 + 0.5 * t * t * (3 - 2 * t)  # 0.5 at the seam, 1 at the band edge
    upper = np.clip((marks["crotch_y"] + height_m - vertices[:, 1]) / 0.03, 0.0, 1.0)  # fades out above the crotch
    own = 1.0 - upper * (1.0 - own)
    blended = own[:, None] * dense + (1.0 - own[:, None]) * mirrored
    order = np.argsort(blended, axis=1)[:, -4:][:, ::-1]
    top = np.take_along_axis(blended, order, axis=1)
    return order.astype(np.int64), top / top.sum(axis=1, keepdims=True), int((own < 1.0).sum())


def design_pants(body: RestBody, rules: PantsRules = PantsRules()) -> tuple[OuterGarment, dict[str, Any]]:
    surface = BodySurface(body, rules.fit.body_samples, rules.fit.seed)
    marks = pants_landmarks(body, rules)
    stack, origin, dims, _ = pants_fields(body, surface, rules, marks)
    raw_vertices, faces, caps = surface_nets(stack, origin, rules.fit.voxel_m)
    opened, repair = repair_manifold(faces[~caps])
    mesh = trimesh.Trimesh(raw_vertices, opened, process=False)
    mesh.remove_unreferenced_vertices()
    parts = mesh.split(only_watertight=False)
    mesh = max(parts, key=lambda part: len(part.faces))
    filled = fill_small_holes(mesh, keep=len(OPENINGS))
    trimesh.smoothing.filter_taubin(mesh, lamb=0.5, nu=0.53, iterations=rules.fit.smoothing_iterations)
    loops = classify_pants_loops(mesh, marks)
    vertices = np.array(mesh.vertices)
    project_pants_boundaries(vertices, loops, marks)
    mesh.vertices = vertices
    report: dict[str, Any] = {"grid_points": int(np.prod(dims)), "components_dropped": len(parts) - 1, "manifold_repair": {**repair, "small_holes_filled": filled}}
    report["clearance"] = enforce_clearance(mesh, surface, rules.fit, np.zeros(len(mesh.vertices), dtype=bool))
    _, _, labels = surface.query(mesh.vertices)
    joints, weights, report["weights"] = transfer_weights(mesh, body, rules.fit, labels)
    vertices, faces = np.array(mesh.vertices), np.asarray(mesh.faces)
    if rules.crotch_blend_band_m > 0:
        joints, weights, report["weights"]["crotch_blend_vertices"] = symmetrize_crotch_weights(vertices, joints, weights, tuple(body.joint_names), marks, rules.crotch_blend_band_m, rules.crotch_blend_height_m)
    region = pants_regions(vertices, marks, rules)
    report["landmarks"] = {key: marks[key] for key in ("hip_y", "waist_y", "crotch_y", "seam_y", "knee_y")}
    report["legs"] = {side: {"radius_m": leg["radius"], "body_radius_m": leg["body_radius"], "direction": leg["direction"].tolist(), "hem_centre": leg["hem_centre"].tolist()} for side, leg in marks["legs"].items()}
    garment = OuterGarment(vertices, faces, pants_corner_uvs(vertices, faces, region, marks), joints, weights, region, loops, report)
    return garment, marks


def leg_corrective_specs(hip_ramp_start_deg: float = 20.0, hip_radii: tuple[float, float] = (0.18, 0.25), knee_radii: tuple[float, float] = (0.12, 0.17), anchor: float = 1.0) -> tuple[Any, ...]:
    """Hip-flexion and knee-flexion correctives per leg (corrective-morphs contract, swing-driven).

    Hip targets start their ramp at `hip_ramp_start_deg` so the 15-20 deg extension/abduction poses, which swing the
    thigh as much as a small flexion would, leave them off.
    """
    from correctives import CorrectiveSpec

    x = (1.0, 0.0, 0.0)
    specs = []
    for side, tag in (("l", "L"), ("r", "R")):
        specs.append(CorrectiveSpec(f"corr_{tag}_hip90", f"{side}_upleg", f"{side}_lowleg", (hip_ramp_start_deg, 90.0), ((f"{side}_upleg", x, -90.0),), f"{side}_upleg", hip_radii[0], hip_radii[1], side, anchor))
        specs.append(CorrectiveSpec(f"corr_{tag}_knee90", f"{side}_lowleg", f"{side}_foot", (0.0, 90.0), ((f"{side}_lowleg", x, 90.0),), f"{side}_lowleg", knee_radii[0], knee_radii[1], side, anchor))
    return tuple(specs)
