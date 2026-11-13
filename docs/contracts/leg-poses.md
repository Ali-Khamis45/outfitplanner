# Contract: leg test poses (Sprint 2.0A)

**Status:** v1. **Users:** the garment generator and gates in `services/garments` (Python) and the web lab (Three.js `poses.ts`). Both sides must use exactly this table; any change bumps the version.

## Convention

This is the same convention as `apps/web/lib/garment/poses.ts` `JointRotation`:

- Each entry is `(joint, axis, degrees)`, a rotation about the joint's own pivot.
- `axis` is in the MHR rest frame: +X is the subject's left, +Y up, +Z forward.
- Every pose starts from the rest pose (bind rotations). Entries are applied in the listed order, hips before knees. Each entry sets `local' = parentWorld⁻¹ · R(axis, degrees) · parentWorld · local`, using the parent's current world rotation.
- Positive angles follow the right-hand rule. **Hip flexion** (thigh forward) is **negative** about +X. **Hip extension** (thigh back) is **positive** about +X. **Knee flexion** (heel toward buttock) is **positive** about +X. **Abduction** (leg outward) is +Z for the left leg and −Z for the right.
- Joints, which are exact MHR glTF node names: hip = `l_upleg` / `r_upleg`, knee = `l_lowleg` / `r_lowleg`. The `*_twist*_proc` joints are children and follow along. They are never rotated directly.

## Poses

| Name | Description | Rotations, in order |
| --- | --- | --- |
| `rest` | bind pose | none |
| `walk` | L hip flex 30°, R hip extension 15°, both knees flex 20° | `l_upleg` [1,0,0] −30; `r_upleg` [1,0,0] +15; `l_lowleg` [1,0,0] +20; `r_lowleg` [1,0,0] +20 |
| `l-hip-60` | L hip flex 60°, knee straight | `l_upleg` [1,0,0] −60 |
| `step` | L hip flex 90°, L knee flex 90° | `l_upleg` [1,0,0] −90; `l_lowleg` [1,0,0] +90 |
| `squat` | both hips flex 45°, both knees flex 60° | `l_upleg` [1,0,0] −45; `r_upleg` [1,0,0] −45; `l_lowleg` [1,0,0] +60; `r_lowleg` [1,0,0] +60 |
| `wide` | both hips abduct 20° | `l_upleg` [0,0,1] +20; `r_upleg` [0,0,1] −20 |

## Sanity values (neutral MHR avatar, unit bone directions)

These are for checking an implementation. "Thigh" is `l_upleg`→`l_lowleg`; "shank" is `l_lowleg`→`l_foot`.

| Pose | Left thigh | Left shank |
| --- | --- | --- |
| `rest` | (0.119, −0.991, −0.058) | (0.114, −0.988, −0.102) |
| `l-hip-60` | (0.119, −0.546, 0.830) | (0.114, −0.583, 0.805) |
| `step` | (0.119, −0.058, 0.991) | (0.114, −0.988, −0.102) |
| `squat` | (0.119, −0.742, 0.660) | (0.114, −0.928, −0.355) |
| `wide` | (0.451, −0.891, −0.058) | (0.445, −0.890, −0.102) |

The reference implementation is `services/garments/posing.py` `pose_local` with `services/garments/leg_poses.py` `LEG_POSES`.
