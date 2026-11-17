"""Design one garment size on one body so its measured girths match the size spec (Sprint 3A).

design -> measure the garment's girths -> correct the region eases by (target - measured) / 2pi -> repeat. Eases are
clamped at the minimum clearance; a region whose target cannot be reached that way is tight on this body.
"""
from __future__ import annotations

from dataclasses import replace
from typing import Any

import numpy as np

from body import RestBody
from measure import body_measurements
from sizes import MIN_EASE_M, PantsSpec, ShirtSpec, clamp_ease, measure_pants, measure_shirt

TOLERANCE_M = 0.005  # girth error accepted (5 mm)
# Sleeve and shoulder geometry never go below the base v5.2 eases: below them, at 20 deg arm-down the armhole wedges
# between the arm and the torso (whose skins are ~4 mm apart) and the cloth penetrates. Smaller sizes are reported
# tight from their spec (fit-map contract, geometric limits); larger sizes grade up as specified.
# The pants' geometric hip ease never goes below the base pants v2 value: at 90 deg hip flexion the MHR body's own skin
# folds the belly into the thigh, and a tighter seat ends up inside that fold (penetration the cloth cannot avoid).
# The fit report still uses the size spec, so a tight size is reported tight.
PANTS_MIN_HIP_EASE_M = 0.02


LAYER_CLEARANCE_M = 0.003  # shirt inner surface over the outer surface of the pants it layers over (rest)
LAYER_SLOPE = 0.5  # largest change of the layering push per metre along the cloth (vertically and around): no folds
LAYER_REACH_M = 0.15  # torso vertices up to this far above the push band may take part of the push (the slope fades it)
LAYER_ROUNDS = 4
LAYER_SMOOTH_ROUNDS = 6  # the blur can leave small deficits, which further rounds clear
_ANGLE_BINS, _HEIGHT_BIN_M = 144, 0.005


def _lipschitz(values: np.ndarray, step_m: float, slope: float, circular: bool) -> np.ndarray:
    """Smallest field >= values whose change between neighbouring bins is at most slope * step (max-plus envelope)."""
    out = values.copy()
    for _ in range(2 if circular else 1):  # two sweeps each way close a circular axis
        for i in range(1, len(out)):
            out[i] = np.maximum(out[i], out[i - 1] - slope * step_m)
        for i in range(len(out) - 2, -1, -1):
            out[i] = np.maximum(out[i], out[i + 1] - slope * step_m)
        if circular:
            out[0] = np.maximum(out[0], out[-1] - slope * step_m)
            out[-1] = np.maximum(out[-1], out[0] - slope * step_m)
    return out


LAYER_FALLOFF_M = 0.05  # Sprint 3.5: smooth (smoothstep) falloff of the push, at least this tall
LAYER_SMOOTH_SIGMA_M = 0.015  # Sprint 3.5: vertical Gaussian blur of the push field (removes the kinks of the bump envelope)
LAYER_SMOOTH_REACH_M = 0.20  # the smooth falloff of a ~60 mm push needs 18 cm; the reach must not cut it short


def _smooth_envelope(values: np.ndarray, step_m: float, falloff_m: float) -> np.ndarray:
    """Smallest smooth bump envelope >= values along one axis: each bin's value spreads to its neighbours as
    value * (1 - smoothstep(distance / L)), L = max(falloff_m, 3 * value). The profile starts with zero slope (no ledge)
    and its steepest slope is 1.5 * value / L <= 0.5, the 3A bound."""
    out = values.copy()
    positions = np.arange(len(values)) * step_m
    for j in np.flatnonzero(values > 1e-6):
        reach = max(falloff_m, 3.0 * float(values[j]))
        t = np.clip(np.abs(positions - positions[j]) / reach, 0.0, 1.0)
        out = np.maximum(out, values[j] * (1.0 - t * t * (3.0 - 2.0 * t)))
    return out


def push_over(garment: Any, envelope: Any, top_y: float, rules: Any, falloff_m: float | None = None) -> dict[str, Any]:
    """Push the shirt's torso clear of the pants envelope below top_y, without folding it.

    The push is horizontal (radial from the band's axis) and its magnitude is a field over (angle, height): every bin
    takes the largest push its vertices need, and the field is then raised to its LAYER_SLOPE envelope around and
    along the body, so the cloth tilts by at most atan(LAYER_SLOPE) and above the band it fades out over
    push / LAYER_SLOPE. Moving each vertex along its own nearest pants normal instead (the body clearance pass) pleated
    the cloth just under the waistband rim, where those normals turn from radial to upwards within millimetres; ARAP then
    flipped the pleat's triangles in UV. Repeated LAYER_ROUNDS times, since the envelope's normals are not radial."""
    from tshirt import REGION_TORSO

    vertices = np.array(garment.vertices, dtype=np.float64)
    reach_m = LAYER_REACH_M if falloff_m is None else LAYER_SMOOTH_REACH_M
    torso = garment.region == REGION_TORSO
    band = torso & (vertices[:, 1] <= top_y)
    reach = torso & (vertices[:, 1] <= top_y + reach_m)
    required = LAYER_CLEARANCE_M + rules.thickness_m
    centre = vertices[band].mean(axis=0)
    radius = float(np.median(np.hypot(vertices[band, 0] - centre[0], vertices[band, 2] - centre[2]))) if band.any() else 0.2
    low = float(vertices[reach, 1].min()) if reach.any() else 0.0
    heights = int(np.ceil((top_y + reach_m - low) / _HEIGHT_BIN_M)) + 1
    total = np.zeros(len(vertices))
    rounds = []
    for _ in range(LAYER_ROUNDS if falloff_m is None else LAYER_SMOOTH_ROUNDS):
        rel = vertices[reach] - centre
        direction = np.column_stack([rel[:, 0], np.zeros(len(rel)), rel[:, 2]])
        direction /= np.maximum(np.linalg.norm(direction, axis=1), 1e-9)[:, None]
        angle = np.floor((np.arctan2(rel[:, 0], rel[:, 2]) + np.pi) / (2 * np.pi) * _ANGLE_BINS).astype(int) % _ANGLE_BINS
        height = np.clip(np.floor((vertices[reach, 1] - low) / _HEIGHT_BIN_M).astype(int), 0, heights - 1)
        signed, normals, _ = envelope.query(vertices[reach])
        in_band = vertices[reach, 1] <= top_y
        # horizontal push that clears the deficit along the envelope normal (normals near-vertical count at most 3x)
        along = np.maximum(np.einsum("ij,ij->i", normals, direction), 1 / 3)
        need = np.where(in_band, np.clip(required - signed, 0.0, None) / along, 0.0)
        rounds.append({"vertices_short": int((need > 1e-5).sum()), "max_need_m": float(need.max()) if len(need) else 0.0})
        if not (need > 1e-5).any():
            break
        field = np.zeros((_ANGLE_BINS, heights))
        np.maximum.at(field, (angle, height), need)
        for row in range(heights):
            field[:, row] = _lipschitz(field[:, row], 2 * np.pi * radius / _ANGLE_BINS, LAYER_SLOPE, circular=True)
        for column in range(_ANGLE_BINS):
            if falloff_m is None:  # Sprint 3A: linear (slope-limited) rise, with a kink where the push starts
                field[column] = _lipschitz(field[column], _HEIGHT_BIN_M, LAYER_SLOPE, circular=False)
            else:  # Sprint 3.5: smooth falloff, no kink (the hem ledge); the blur smooths where the bumps cross, and the
                # next round re-pushes any spot the blur left short of clearance (with its own smooth bump)
                from scipy.ndimage import gaussian_filter1d

                field[column] = gaussian_filter1d(_smooth_envelope(field[column], _HEIGHT_BIN_M, falloff_m), LAYER_SMOOTH_SIGMA_M / _HEIGHT_BIN_M, mode="nearest")
        push = field[angle, height]
        vertices[reach] += direction * push[:, None]
        total[np.flatnonzero(reach)] += push
    garment.vertices = vertices
    signed, _, _ = envelope.query(vertices[band])
    return {"vertices_pushed": int((total > 1e-6).sum()), "max_push_m": float(total.max()), "band_vertices": int(band.sum()),
            "reach_vertices": int(reach.sum()), "min_outer_clearance_m": float(signed.min()) if band.any() else None,
            "inner_violations": int((signed - rules.thickness_m < LAYER_CLEARANCE_M - 1e-4).sum()), "rounds": rounds}


ARM_FADE_START_M = 0.03  # below the armpit, the torso panel's upper-arm weight share fades out between these depths
ARM_FADE_END_M = 0.06


def fade_torso_arm_weights(garment: Any, body: RestBody, axilla_y: float) -> int:
    """Torso-panel vertices well below the armpit follow the torso, as a side seam does: their upper-arm (and child)
    weight share is scaled by a smoothstep from 1 at 3 cm to 0 at 6 cm below the axilla, the rest renormalised. Wide
    sizes otherwise project part of the back panel onto the hanging arm, and the arm swing drags it into the back."""
    from body import LEFT_ARM, RIGHT_ARM, joint_groups
    from tshirt import REGION_TORSO

    groups = joint_groups(tuple(body.joint_names), np.asarray(body.joint_parents))
    arm = np.isin(groups, (LEFT_ARM, RIGHT_ARM))[garment.joints]
    depth = axilla_y - garment.vertices[:, 1]
    t = np.clip((depth - ARM_FADE_START_M) / (ARM_FADE_END_M - ARM_FADE_START_M), 0.0, 1.0)
    keep = 1.0 - t * t * (3 - 2 * t)
    torso = (garment.region == REGION_TORSO) & (keep < 1.0) & arm.any(axis=1)
    weights = np.array(garment.weights, dtype=np.float64)
    scaled = np.where(arm, weights * keep[:, None], weights)
    total = scaled.sum(axis=1)
    usable = torso & (total > 1e-6)  # a vertex weighted only to the arm keeps its weights (nothing else to follow)
    weights[usable] = scaled[usable] / total[usable, None]
    garment.weights = weights
    return int(usable.sum())


def fit_shirt(body: RestBody, spec: ShirtSpec, base_rules: Any, iterations: int = 3, envelope: Any = None, envelope_top_y: float = 0.0, falloff_m: float | None = None) -> tuple[Any, Any, dict[str, Any]]:
    from tshirt import design_tshirt

    m = body_measurements(body)
    hem_y = m["shoulder_y"] - spec.length_m
    spec_shoulder = base_rules.ease_shoulder_m + spec.chest_grade_m  # the size's own (graded) eases
    spec_sleeve = base_rules.ease_sleeve_m + spec.chest_grade_m / 2
    holds = {"shoulder_m": max(0.0, base_rules.ease_shoulder_m - spec_shoulder), "sleeve_m": max(0.0, base_rules.ease_sleeve_m - spec_sleeve), "spec_shoulder_ease_m": spec_shoulder}
    rules = replace(base_rules, hem_below_hip_m=m["hip_y"] - hem_y, ease_shoulder_m=max(base_rules.ease_shoulder_m, spec_shoulder), ease_sleeve_m=max(base_rules.ease_sleeve_m, spec_sleeve),
                    ease_chest_m=clamp_ease((spec.chest_m - m["chest_m"]) / (2 * 3.141592653589793)), ease_waist_m=clamp_ease((spec.chest_m - m["waist_m"]) / (2 * 3.141592653589793)) * 0.5,
                    ease_hem_m=clamp_ease((spec.chest_m - m["hips_m"]) / (2 * 3.141592653589793)))
    history = []
    for step in range(iterations):
        garment, _ = design_tshirt(body, rules)
        measured = measure_shirt(garment, body, m, hem_y)
        errors = {region: spec.chest_m - measured[f"garment_{region}_m"] for region in ("chest", "waist", "hips")}
        history.append({"step": step, "eases": {"chest": rules.ease_chest_m, "waist": rules.ease_waist_m, "hem": rules.ease_hem_m}, "errors_m": errors})
        fields = {"chest": "ease_chest_m", "waist": "ease_waist_m", "hips": "ease_hem_m"}
        updates = {}
        for region, error in errors.items():
            current = getattr(rules, fields[region])
            if abs(error) > TOLERANCE_M and not (current <= MIN_EASE_M and error < 0):
                updates[fields[region]] = clamp_ease(current + error / (2 * 3.141592653589793))
        if not updates or step == iterations - 1:
            break
        rules = replace(rules, **updates)
    arm_fade = fade_torso_arm_weights(garment, body, m["axilla_y"])
    layering = None
    if envelope is not None:  # clear every pants waistband the shirt may be worn over, then re-measure the drawn girths
        layering = push_over(garment, envelope, envelope_top_y + 0.02, rules, falloff_m)
        measured = measure_shirt(garment, body, m, hem_y)
    return garment, rules, {"measurements": measured, "history": history, "hem_y": hem_y, "body": m, "holds": holds, "layering_push": layering, "torso_arm_weights_faded": arm_fade}


def fit_pants(body: RestBody, spec: PantsSpec, base_rules: Any, iterations: int = 3) -> tuple[Any, Any, dict[str, Any]]:
    from pants import design_pants, pants_landmarks

    m = body_measurements(body)
    marks = pants_landmarks(body, base_rules)
    spec_hem_y = marks["seam_y"] - spec.inseam_m
    hem_above_ankle = max(0.01, spec_hem_y - m["ankle_y"])  # never into the foot; any excess length is reported
    two_pi = 2 * 3.141592653589793
    rules = replace(base_rules, hem_above_ankle_m=hem_above_ankle, ease_thigh_m=clamp_ease(base_rules.ease_thigh_m + spec.hip_grade_m / 2), ease_leg_m=clamp_ease(base_rules.ease_leg_m + spec.hip_grade_m / 2),
                    ease_waist_m=clamp_ease(base_rules.ease_waist_m), ease_hip_m=max(PANTS_MIN_HIP_EASE_M, clamp_ease(base_rules.ease_hip_m + spec.hip_grade_m)))
    history = []
    for step in range(iterations):
        garment, design_marks = design_pants(body, rules)
        measured = measure_pants(garment, body, m, design_marks["waist_y"])
        errors = {"waist": spec.waist_m - measured["garment_waist_m"], "hips": spec.hips_m - measured["garment_hips_m"]}
        history.append({"step": step, "eases": {"waist": rules.ease_waist_m, "hip": rules.ease_hip_m}, "errors_m": errors})
        fields = {"waist": "ease_waist_m", "hips": "ease_hip_m"}
        updates = {}
        for region, error in errors.items():
            current = getattr(rules, fields[region])
            floor = PANTS_MIN_HIP_EASE_M if region == "hips" else MIN_EASE_M
            if abs(error) > TOLERANCE_M and not (current <= floor and error < 0):
                updates[fields[region]] = max(floor, clamp_ease(current + error / two_pi))
        if not updates or step == iterations - 1:
            break
        rules = replace(rules, **updates)
    return garment, rules, {"measurements": measured, "history": history, "spec_hem_y": spec_hem_y, "geometric_hem_y": m["ankle_y"] + hem_above_ankle, "body": m, "marks": design_marks}
