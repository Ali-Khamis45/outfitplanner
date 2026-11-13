"""Leg test poses, exactly as docs/contracts/leg-poses.md (Sprint 2.0A). Rotations follow posing.Rotation."""
from __future__ import annotations

from posing import Rotation

X = (1.0, 0.0, 0.0)
Z = (0.0, 0.0, 1.0)

LEG_POSES: dict[str, list[Rotation]] = {
    "rest": [],
    "walk": [("l_upleg", X, -30.0), ("r_upleg", X, 15.0), ("l_lowleg", X, 20.0), ("r_lowleg", X, 20.0)],
    "l-hip-60": [("l_upleg", X, -60.0)],
    "step": [("l_upleg", X, -90.0), ("l_lowleg", X, 90.0)],
    "squat": [("l_upleg", X, -45.0), ("r_upleg", X, -45.0), ("l_lowleg", X, 60.0), ("r_lowleg", X, 60.0)],
    "wide": [("l_upleg", Z, 20.0), ("r_upleg", Z, -20.0)],
}
