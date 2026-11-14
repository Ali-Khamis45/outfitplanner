"""Garment sizes and fit maps (Sprint 3A), implementing docs/contracts/fit-map.md.

- Size specs (§7): the Simplicity / McCall's / Butterick / Vogue men's body chart (midpoints) plus regular-fit ease.
- Region grading: each size is designed on the body with per-region eases solved so the garment's measured girths
  match the spec (iterating design -> measure -> correct). Eases below the minimum clearance are clamped there: the
  garment is then drawn onto the body and the region reports a negative pattern ease (tight).
- Fit map: per-region pattern ease and status (§3, §5), per-vertex _EASE_MM (§2), and the recommended size (§6).
"""
from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any

import numpy as np

from body import LEG, TORSO, RestBody
from measure import body_measurements, girth, label_faces, section_points  # noqa: F401

SIZES = ("S", "M", "L", "XL")
# Men's body chart midpoints in cm (chest, waist, hip/seat): Simplicity / McCall's / Butterick / Vogue (2023)
CHART_CM = {"S": (89.5, 73.5, 91.5), "M": (99.5, 84.0, 101.5), "L": (109.5, 95.5, 111.5), "XL": (119.5, 109.5, 121.5)}
SHIRT_CHEST_EASE_M = 0.116  # V/B/M tops semi-fitted midpoint (4 1/8 - 5 in)
PANTS_HIP_EASE_M = 0.090  # V/B/M pants semi-fitted midpoint (3 1/8 - 4 in)
PANTS_WAIST_EASE_M = 0.020  # project rule
LENGTH_GRADE_M = 0.0254  # Gildan 5000 body-length grade: 1 in per size
MIN_EASE_M = 0.008  # min clearance (6 mm) + thickness (2 mm): the outer surface cannot sit closer to the body

INCH = 25.4
# §5 thresholds (mm). Girth "good" upper limits for the shirt waist/hips add the body's own chest - waist / chest - hips.
SHIRT_CHEST_BAND = (3 * INCH, 8 * INCH)
SHIRT_HIPS_LOW = 2 * INCH
PANTS_HIPS_BAND = (2 * INCH, 6 * INCH)
PANTS_WAIST_BAND = (0.0, 50.0)
SHOULDER_BAND = (0.0, 40.0)
LENGTH_BAND = (-40.0, 40.0)


def status(value_mm: float, low: float, high: float) -> str:
    return "tight" if value_mm < low else "loose" if value_mm > high else "good"


@dataclass(frozen=True)
class ShirtSpec:
    size: str
    chest_m: float  # garment girths (waist and hips equal the chest: straight cut)
    length_m: float  # shoulder-joint height to hem
    chest_grade_m: float  # radial chest grade relative to M (drives sleeves and shoulders)


@dataclass(frozen=True)
class PantsSpec:
    size: str
    waist_m: float  # waistband girth
    hips_m: float
    inseam_m: float  # crotch seam to hem
    hip_grade_m: float  # radial hip grade relative to M (drives thigh and leg tube)


def shirt_specs(neutral: RestBody, base_hem_below_hip_m: float) -> dict[str, ShirtSpec]:
    measurements = body_measurements(neutral)
    base_length = measurements["shoulder_y"] - (measurements["hip_y"] - base_hem_below_hip_m)  # M = base design on neutral
    chest_m = {size: CHART_CM[size][0] / 100 + SHIRT_CHEST_EASE_M for size in SIZES}
    return {size: ShirtSpec(size, chest_m[size], base_length + LENGTH_GRADE_M * (i - 1), (chest_m[size] - chest_m["M"]) / (2 * np.pi)) for i, size in enumerate(SIZES)}


def pants_specs(neutral: RestBody, waist_level_y: float, base_inseam_m: float) -> tuple[dict[str, PantsSpec], dict[str, float]]:
    """Waistband girth transfers the chart's natural waist to the pants' lower waistband line by the base body's ratio."""
    measurements = body_measurements(neutral)
    ratio = girth(neutral.vertices, label_faces(neutral, (TORSO, LEG)), waist_level_y) / measurements["waist_m"]
    hips_m = {size: CHART_CM[size][2] / 100 + PANTS_HIP_EASE_M for size in SIZES}
    specs = {size: PantsSpec(size, CHART_CM[size][1] / 100 * ratio + PANTS_WAIST_EASE_M, hips_m[size], base_inseam_m, (hips_m[size] - hips_m["M"]) / (2 * np.pi)) for size in SIZES}
    return specs, {"waistband_to_natural_waist_ratio": float(ratio)}


# ---------------------------------------------------------------------------------------------- garment measurement

def garment_girth(vertices: np.ndarray, faces: np.ndarray, level: float) -> float:
    return girth(vertices, faces, level)


def shirt_torso_faces(garment: Any) -> np.ndarray:
    from tshirt import REGION_TORSO

    return garment.faces[(garment.region[garment.faces] == REGION_TORSO).all(axis=1)]


def shirt_levels(body_m: dict[str, Any], hem_y: float) -> dict[str, float]:
    """Chest and waist at the body's levels; hips at the seat if the shirt covers it, else 10 mm above the hem."""
    return {"chest": body_m["chest_y"], "waist": body_m["waist_y"], "hips": body_m["hips_y"] if hem_y <= body_m["hips_y"] - 0.01 else hem_y + 0.01}


def measure_shirt(garment: Any, body: RestBody, body_m: dict[str, Any], hem_y: float) -> dict[str, float]:
    faces = shirt_torso_faces(garment)
    levels = shirt_levels(body_m, hem_y)
    body_torso = label_faces(body, (TORSO,))
    body_lower = label_faces(body, (TORSO, LEG))
    shoulder = section_points(garment.vertices, faces, body_m["shoulder_y"])
    return {
        **{f"{region}_y": y for region, y in levels.items()},
        "garment_chest_m": garment_girth(garment.vertices, faces, levels["chest"]),
        "garment_waist_m": garment_girth(garment.vertices, faces, levels["waist"]),
        "garment_hips_m": garment_girth(garment.vertices, faces, levels["hips"]),
        "body_chest_m": body_m["chest_m"], "body_waist_m": body_m["waist_m"],
        "body_hips_m": girth(body.vertices, body_lower if levels["hips"] <= body_m["hip_y"] + 0.06 else body_torso, levels["hips"]),
        "garment_shoulder_width_m": float(np.ptp(shoulder[:, 0])) if len(shoulder) else 0.0,
        "body_shoulder_width_m": body_m["shoulder_width_m"],
    }


def measure_pants(garment: Any, body: RestBody, body_m: dict[str, Any], waist_y: float) -> dict[str, float]:
    lower = label_faces(body, (TORSO, LEG))
    level = waist_y - 0.005  # just inside the waistband edge
    return {
        "waist_y": level, "hips_y": body_m["hips_y"],
        "garment_waist_m": garment_girth(garment.vertices, garment.faces, level),
        "garment_hips_m": garment_girth(garment.vertices, garment.faces, body_m["hips_y"]),
        "body_waist_m": girth(body.vertices, lower, level), "body_hips_m": body_m["hips_m"],
    }


# --------------------------------------------------------------------------------------------------- fit regions

CLAMP_TOLERANCE_M = 0.005  # a drawn girth more than this above the spec means the geometry was held (clamped)


def _region(value_mm: float, low: float, high: float, clamped: bool, key: str = "ease_mm") -> dict[str, Any]:
    region: dict[str, Any] = {key: round(value_mm), "status": status(value_mm, low, high)}
    if clamped:
        region["clamped"] = True
    return region


def shirt_regions(spec: ShirtSpec, measured: dict[str, float], body_m: dict[str, Any], hem_y: float, holds: dict[str, float]) -> dict[str, Any]:
    """Every value comes from the size spec. A region whose drawn geometry was held wider than the spec is marked
    "clamped": girths drawn at the minimum-ease floor, and shoulders (with the sleeves) held at the base shirt's
    size, whose width is corrected by the held amount on both sides."""
    chest = (spec.chest_m - measured["body_chest_m"]) * 1000
    waist = (spec.chest_m - measured["body_waist_m"]) * 1000
    hips = (spec.chest_m - measured["body_hips_m"]) * 1000
    d_cw = max(0.0, (measured["body_chest_m"] - measured["body_waist_m"]) * 1000)
    d_ch = max(0.0, (measured["body_chest_m"] - measured["body_hips_m"]) * 1000)
    shoulders = (measured["garment_shoulder_width_m"] - 2 * holds["shoulder_m"] - measured["body_shoulder_width_m"]) * 1000
    length = ((body_m["hip_y"] - 0.03) - hem_y) * 1000
    held = {region: measured[f"garment_{region}_m"] - spec.chest_m > CLAMP_TOLERANCE_M for region in ("chest", "waist", "hips")}
    return {
        "chest": _region(chest, *SHIRT_CHEST_BAND, held["chest"]),
        "waist": _region(waist, SHIRT_CHEST_BAND[0], SHIRT_CHEST_BAND[1] + d_cw, held["waist"]),
        "hips": _region(hips, SHIRT_HIPS_LOW, SHIRT_CHEST_BAND[1] + d_ch, held["hips"]),
        "shoulders": _region(shoulders, *SHOULDER_BAND, holds["shoulder_m"] > 0 or holds["sleeve_m"] > 0),
        "length": _region(length, *LENGTH_BAND, False, "delta_mm"),
    }


def pants_regions(spec: PantsSpec, measured: dict[str, float], body_m: dict[str, Any], spec_hem_y: float) -> dict[str, Any]:
    waist = (spec.waist_m - measured["body_waist_m"]) * 1000
    hips = (spec.hips_m - measured["body_hips_m"]) * 1000
    length = ((body_m["ankle_y"] + 0.04) - spec_hem_y) * 1000
    return {
        "waist": _region(waist, *PANTS_WAIST_BAND, measured["garment_waist_m"] - spec.waist_m > CLAMP_TOLERANCE_M),
        "hips": _region(hips, *PANTS_HIPS_BAND, measured["garment_hips_m"] - spec.hips_m > CLAMP_TOLERANCE_M),
        "length": _region(length, *LENGTH_BAND, False, "delta_mm"),
    }


def recommend(regions_by_size: dict[str, dict[str, Any]], girth_regions: tuple[str, ...]) -> str:
    """§6: the smallest size with no tight girth region, else XL."""
    for size in SIZES:
        if all(regions_by_size[size][r]["status"] != "tight" for r in girth_regions):
            return size
    return SIZES[-1]


# ------------------------------------------------------------------------------------------------ per-vertex ease

def _smooth(values: np.ndarray, window: int = 5) -> np.ndarray:
    kernel = np.ones(window) / window
    padded = np.pad(values, window // 2, mode="edge")
    return np.convolve(padded, kernel, mode="valid")


def ease_map_mm(arrays: dict[str, Any], surface: Any, thickness: float, target_m: np.ndarray, smoothing_iterations: int = 30) -> np.ndarray:
    """§2: the spec target field plus each vertex's local detail.

    gap = signed distance of the inner surface to the body; ref = gap diffused over the garment (its smooth part); the
    value is target + (gap - ref). target_m is the spec-based radial ease, smooth in height (NaN = follow the measured
    gap, i.e. target = ref). The heatmap therefore keeps the folds and drape of the mesh but reads the size's spec, with
    no steps between bands.
    """
    import trimesh
    from tshirt import diffuse, mean_operator

    positions = np.asarray(arrays["position"], dtype=np.float64)
    signed, _, _ = surface.query(positions)
    inner = np.asarray(arrays["_inner"], dtype=bool)
    gap = np.where(inner, signed, signed - thickness)
    mesh = trimesh.Trimesh(positions, np.asarray(arrays["faces"]).reshape(-1, 3), process=False)
    ref = diffuse(gap[:, None], mean_operator(mesh), smoothing_iterations)[:, 0]
    target = np.where(np.isnan(target_m), ref, target_m)
    return (target + gap - ref) * 1000.0


def height_field(levels: np.ndarray, values: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Interpolate a (smoothed) per-height field at the vertices' heights."""
    return np.interp(y, levels, _smooth(values))


def _smoothstep(t: np.ndarray) -> np.ndarray:
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3 - 2 * t)


def shirt_target_m(positions: np.ndarray, region: np.ndarray, body: RestBody, body_m: dict[str, Any], spec: ShirtSpec, shoulder_side_m: float, sleeve_spec_m: float) -> np.ndarray:
    """Spec radial ease per shirt vertex (m), continuous everywhere:
    torso up to the chest: (C_spec - C_body(y)) / 2pi; at and above the shoulder joints: the shoulder region's ease per
    side; between them a smoothstep blend. Sleeves: the size's sleeve ease, blended into the shoulder value within
    6-12 cm of the upper-arm joint (the shoulder cap belongs to the shoulder region)."""
    from tshirt import REGION_TORSO

    torso_faces = label_faces(body, (TORSO,))
    lower_faces = label_faces(body, (TORSO, LEG))
    y = positions[:, 1]
    levels = np.arange(np.floor(y.min() * 100) / 100 - 0.01, body_m["chest_y"] + 0.011, 0.01)
    girths = np.array([girth(body.vertices, lower_faces if level <= body_m["hip_y"] + 0.06 else torso_faces, level) for level in levels])
    valid = girths > 0
    band = (spec.chest_m - np.interp(levels, levels[valid], girths[valid])) / (2 * np.pi)
    chest_value = float(height_field(levels, band, np.array([body_m["chest_y"]]))[0])
    torso_value = np.where(y <= body_m["chest_y"], height_field(levels, band, np.minimum(y, body_m["chest_y"])), chest_value)
    t = _smoothstep((y - body_m["chest_y"]) / max(1e-6, body_m["shoulder_y"] - body_m["chest_y"]))
    torso_value = (1 - t) * torso_value + t * shoulder_side_m
    target = torso_value.copy()
    sleeve = region != REGION_TORSO
    joints = np.array([body.joint("l_uparm"), body.joint("r_uparm")])
    distance = np.min(np.linalg.norm(positions[:, None, :] - joints[None], axis=2), axis=1)
    cap = _smoothstep((0.12 - distance) / 0.06)  # 1 within 6 cm of the joint, 0 beyond 12 cm
    target[sleeve] = cap[sleeve] * shoulder_side_m + (1 - cap[sleeve]) * sleeve_spec_m
    return target


def pants_target_m(positions: np.ndarray, body: RestBody, spec: PantsSpec, waist_y: float, hips_y: float, seam_y: float) -> np.ndarray:
    """Spec radial ease per pants vertex (m): from the crotch seam to the waistband (C_spec(y) - C_body(y)) / 2pi, with
    C_spec interpolated from the hips spec to the waistband spec; the legs follow the measured gap (NaN), blended over
    the 4 cm below the seam."""
    lower_faces = label_faces(body, (TORSO, LEG))
    y = positions[:, 1]
    levels = np.arange(seam_y - 0.05, waist_y + 0.011, 0.01)
    girths = np.array([girth(body.vertices, lower_faces, level) for level in levels])
    valid = girths > 0
    spec_girth = np.interp(levels, [hips_y, waist_y], [spec.hips_m, spec.waist_m])
    band = (spec_girth - np.interp(levels, levels[valid], girths[valid])) / (2 * np.pi)
    value = height_field(levels, band, np.clip(y, levels[0], levels[-1]))
    weight = _smoothstep((y - (seam_y - 0.04)) / 0.04)
    return np.where(weight > 0, value, np.nan), weight


def region_vertex_masks(positions: np.ndarray, region: np.ndarray, levels: dict[str, float], kind: str) -> dict[str, np.ndarray]:
    """Vertices that make up each fit region (for agreement checks of _EASE_MM with the fit.json values)."""
    y = positions[:, 1]
    if kind == "pants":
        return {"waist": np.abs(y - levels["waist_y"]) < 0.015, "hips": np.abs(y - levels["hips_y"]) < 0.015}
    from tshirt import REGION_TORSO

    torso = region == REGION_TORSO
    shoulder = (y >= levels["shoulder_y"] - 0.01) & (np.abs(positions[:, 0]) >= levels["shoulder_half_width_m"] - 0.03)
    return {
        "chest": torso & (np.abs(y - levels["chest_y"]) < 0.015),
        "waist": torso & (np.abs(y - levels["waist_y"]) < 0.015),
        "hips": torso & (np.abs(y - levels["hips_y"]) < 0.015),
        "shoulders": shoulder,
    }


class GarmentEnvelope:
    """Surface samples of other garments' outer layers (e.g. every pants size): a BodySurface-like query used to push
    a shirt's hem clear of the waistbands it is layered over."""

    def __init__(self, meshes: list[tuple[np.ndarray, np.ndarray]], samples_per_mesh: int = 120_000, seed: int = 7) -> None:
        import trimesh
        from scipy.spatial import cKDTree

        self.parts = []
        for vertices, faces in meshes:
            mesh = trimesh.Trimesh(vertices, faces, process=False)
            sampled, face_index = trimesh.sample.sample_surface(mesh, samples_per_mesh, seed=seed)
            sampled = np.asarray(sampled)
            self.parts.append((cKDTree(sampled), sampled, np.asarray(mesh.face_normals)[face_index]))

    def query(self, points: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Signed distance to the union of the garments (positive outside all of them) and the normal of the garment
        that decides it. Each garment is queried on its own: with one tree over nested garments (S inside XL), a point
        inside XL but just outside S took S's nearest sample and read as clear."""
        signed, normals = None, None
        for tree, samples, sample_normals in self.parts:
            _, index = tree.query(points, workers=-1)
            distance = np.einsum("ij,ij->i", points - samples[index], sample_normals[index])
            if signed is None:
                signed, normals = distance, sample_normals[index].copy()
            else:
                closer = distance < signed
                signed = np.where(closer, distance, signed)
                normals[closer] = sample_normals[index][closer]
        return signed, normals, np.zeros(len(points), dtype=np.int32)


def clamp_ease(value: float) -> float:
    return float(max(MIN_EASE_M, value))


def rules_with(rules: Any, **values: Any) -> Any:
    return replace(rules, **values)
