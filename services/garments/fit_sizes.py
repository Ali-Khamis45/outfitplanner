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


def push_over(garment: Any, envelope: Any, top_y: float, rules: Any) -> dict[str, Any]:
    """Push the shirt's torso clear of the pants envelope below top_y (smoothed, as the body clearance pass)."""
    import trimesh
    from tshirt import REGION_TORSO, enforce_clearance

    mesh = trimesh.Trimesh(garment.vertices, garment.faces, process=False)
    fixed = (garment.region != REGION_TORSO) | (garment.vertices[:, 1] > top_y)
    report = enforce_clearance(mesh, envelope, replace(rules, min_clearance_m=LAYER_CLEARANCE_M, clearance_passes=8), fixed)
    garment.vertices = np.array(mesh.vertices)
    # enforce_clearance's summary covers every vertex, including the fixed ones far above the pants (meaningless signed
    # distances there); report the pushed band itself
    signed, _, _ = envelope.query(garment.vertices[~fixed])
    report.update({"min_outer_clearance_m": float(signed.min()) if len(signed) else None,
                   "inner_violations": int((signed - rules.thickness_m < LAYER_CLEARANCE_M - 1e-4).sum()), "band_vertices": int((~fixed).sum())})
    return report


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


def fit_shirt(body: RestBody, spec: ShirtSpec, base_rules: Any, iterations: int = 3, envelope: Any = None, envelope_top_y: float = 0.0) -> tuple[Any, Any, dict[str, Any]]:
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
        layering = push_over(garment, envelope, envelope_top_y + 0.02, rules)
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
