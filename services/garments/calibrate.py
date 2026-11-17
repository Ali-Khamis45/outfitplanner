"""Calibrate a personal body to tape measurements (Sprint 3A).

Input: outputs/avatars/measurements.json (docs/contracts/fit-map.md, "Body measurements"):
    {"version": 1, "units": "cm", "height_cm": 178.0, "chest_cm": 102.0, "waist_cm": 88.0, "hips_cm": 100.0,
     "inseam_cm": 81.0, "measured_at": "2026-11-13"}
height_cm is required; any other value may be null and only the measurements present are calibrated.

Definitions (as the measurement form): chest = horizontal at the fullest part under the armpits; waist = narrowest point;
hips = fullest part of the buttocks; inseam = crotch to floor. measure.py takes them the same way.

The body's identity (shape) coefficients and the model's scale parameters (bone lengths and proportions; the identity
coefficients alone barely change height) are adjusted by non-linear least squares so that the body's own measurements,
taken exactly as in measure.py (convex-hull girths of horizontal sections; height; crotch height as inseam), match the
targets. The pose parameters of the variant are kept. Circumferences must end within 1 cm; the report gives the
before/after error of every measurement. A small regulariser keeps the shape near the reconstruction.

Girths that are not provided (null) are held at the reconstruction's own values, so calibrating, say, height alone does
not change the photo-estimated chest, waist and hips. A null inseam is left free: it follows the height.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
from scipy.optimize import least_squares

from body import RestBody, evaluate_body_from_parameters, rest_parameters
from measure import body_measurements

KEYS = {"chest_cm": "chest_m", "waist_cm": "waist_m", "hips_cm": "hips_m", "height_cm": "height_m", "inseam_cm": "inseam_m"}
GIRTHS = ("chest_cm", "waist_cm", "hips_cm")
TOLERANCE_CM = 1.0
JACOBIAN_STEP = 0.01


def _measure_cm(body: RestBody, keys: list[str]) -> np.ndarray:
    m = body_measurements(body)
    return np.array([m[KEYS[key]] * 100.0 for key in keys])


def parse_measurements(document: dict[str, Any]) -> dict[str, float]:
    """Validate the measurements.json schema; return the present (non-null) measurements in cm."""
    if document.get("version") != 1 or document.get("units") != "cm":
        raise ValueError('measurements.json must have "version": 1 and "units": "cm"')
    if not isinstance(document.get("height_cm"), (int, float)):
        raise ValueError("measurements.json: height_cm is required")
    present = {}
    for key in KEYS:
        value = document.get(key)
        if value is None:
            continue
        if not isinstance(value, (int, float)) or not np.isfinite(value) or value <= 0:
            raise ValueError(f"measurements.json: {key} must be a positive number or null")
        present[key] = float(value)
    return present


def calibrate_body(model: Any, variant: str, reconstruction: Path | None, document: dict[str, Any], components: int = 16, regulariser: float = 0.05, max_evaluations: int = 400, scale_regulariser: float = 0.5) -> tuple[RestBody, dict[str, Any]]:
    """Return the calibrated rest body and a report with before/after errors (cm) and which measurements were used."""
    targets = parse_measurements(document)
    provided = [key for key in KEYS if key in targets]
    held = [key for key in GIRTHS if key not in targets]  # kept at the reconstruction's own (photo-estimated) values
    keys = provided + held
    identity, parameters = rest_parameters(model, variant, reconstruction)
    floor = variant != "neutral"
    start = evaluate_body_from_parameters(model, variant, identity.copy(), parameters, floor_align=floor)
    targets = {**targets, **dict(zip(held, _measure_cm(start, held).tolist()))}
    goal = np.array([float(targets[key]) for key in keys])

    scale_index = np.flatnonzero(model.character_torch.parameter_transform.scaling_parameters[:204].numpy())

    def body_for(delta: np.ndarray) -> RestBody:
        shaped, scaled = identity.copy(), parameters.copy()
        shaped[:components] += delta[:components].astype(np.float32)
        scaled[scale_index] += delta[components:].astype(np.float32)
        return evaluate_body_from_parameters(model, variant, shaped, scaled, floor_align=floor)

    def residuals(delta: np.ndarray) -> np.ndarray:
        return np.concatenate([_measure_cm(body_for(delta), keys) - goal, regulariser * delta[:components], scale_regulariser * delta[components:]])

    def jacobian(delta: np.ndarray) -> np.ndarray:
        """Forward differences with an explicit 0.01 step. scipy's own step from a zero start is about 1e-8, which is
        lost when added to the model's non-zero float32 parameters (the Jacobian then reads as zero)."""
        base = residuals(delta)
        columns = []
        for k in range(len(delta)):
            stepped = delta.copy()
            stepped[k] += JACOBIAN_STEP
            columns.append((residuals(stepped) - base) / JACOBIAN_STEP)
        return np.stack(columns, axis=1)

    zero = np.zeros(components + len(scale_index))
    before = _measure_cm(body_for(zero), keys) - goal
    result = least_squares(residuals, zero, jac=jacobian, max_nfev=max_evaluations, xtol=1e-6, ftol=1e-6)
    body = body_for(result.x)
    after = _measure_cm(body, keys) - goal
    errors = {key: {"target_cm": float(targets[key]), "before_cm": round(float(b), 2), "after_cm": round(float(a), 2)} for key, b, a in zip(keys, before, after)}
    girths_ok = all(abs(errors[key]["after_cm"]) <= TOLERANCE_CM for key in keys if key in GIRTHS)
    return body, {"variant": variant, "measured_at": document.get("measured_at"), "calibrated": provided, "held_at_reconstruction": held, "not_provided": [key for key in KEYS if key not in provided], "components": components, "evaluations": int(result.nfev), "errors": errors,
                  "circumferences_within_1cm": girths_ok, "identity_delta_norm": float(np.linalg.norm(result.x[:components])),
                  "scale_parameters_changed": {int(i): round(float(d), 4) for i, d in zip(scale_index, result.x[components:]) if abs(d) > 1e-3}}
