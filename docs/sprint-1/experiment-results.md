# Sprint 1.0 — Experiment results

**Date:** 2026-10-31. **Budget:** $0 (local CPU; GPU used only for the pipeline regression run).

All figures come from runs in this sprint. **Deformation numbers come from Three.js skinning math run in Node**, using the same `bindGarment` and `applyPose` modules the viewer uses (`apps/web/tests/garment-binding.test.mjs`). They are **not** browser renders. Images are offline CPU z-buffer renders ([`render_views.py`](../../services/garments/render_views.py)) of that posed geometry, kept privately in `outputs/garment-tests/`.

## Generated assets (private, Git-ignored `outputs/`)

| Asset | Vertices / triangles | Size | SHA-256 |
| --- | --- | --- | --- |
| `garments/tshirt-mhr-neutral.glb` (served by `/api/demo-garment`) | 65,522 / 121,980 | 5.45 MB | `2d8076b8cf988cba…` |
| `garments/tshirt-…-rest-identity.glb` | 65,522 / 121,980 | 5.45 MB | `ca88d744245d811e…` |
| `garments/tshirt-…-rest-identity-scale.glb` | 65,522 / 121,980 | 5.45 MB | `e23994be71251be3…` |
| `avatars/…-rest-identity.glb` (personal body, rest pose) | 18,439 / 36,874 | 1.37 MB | `52f0b29e300d06f3…` |
| `avatars/…-rest-identity-scale.glb` | 18,439 / 36,874 | 1.37 MB | `df29b801dc9ca427…` |

All three garments are **watertight, consistently wound, outward-facing shells of genus 3** (Euler −4), volume about 0.0015–0.0016 m³ (about 0.8 m² of cloth at 2 mm). The neutral-only run took 16.6 s; the run with both personal retargets (which also re-runs the neutral design) took 19.6 s. Individual stages were not timed.

## Neutral avatar: rest fit

[`validate_garment.py`](../../services/garments/validate_garment.py) against `mhr-neutral.glb`:

- **Vertex data:** unit normals (error 6e-8); UVs in [−0.007, 0.971]; weight sums 1 ± 1.4e-7.
- **Skeleton:** names and order identical; inverse-bind Δ 1.2e-7; world × inverse bind = I within 6e-8; bind-pose drift 2.3e-7 m.
- **Rest clearance** (approximate: nearest of 400k surface samples, about ±2 mm): **0 penetrating vertices**. Minimum 5.9 mm; median 3.3 cm on the torso and 2.1 cm on the sleeves.
- **Bounds:** x ±0.309 m, y 0.876–1.492 m, z −0.173 to 0.209 m. Hem at 0.876 m (3 cm below the hips); neckline centroid 6.5 mm from the neck axis.

## Controlled poses: deformation and approximate intersection

Penetration is a nearest-body-vertex signed distance along the posed body's vertex normal. It is **approximate**: it can miss thin interpenetration between vertices and errs by roughly the body's edge length. Columns: penetrating / beyond 3 mm vertices, maximum displacement, 95th-percentile follow error (garment displacement minus its rest-nearest body vertex's displacement), edge strain (posed / rest length) and neckline clearance.

### Neutral body

| Pose | Torso / L / R penetrating | Max displacement T / L / R | Follow error p95 T / L / R | Edge strain p1–p99 (min, max) | Neck clearance |
| --- | --- | --- | --- | --- | --- |
| Rest (A-pose) | 0 / 0 / 0 | 0 / 0 / 0 | 0 | 1.000–1.000 | 6.6 mm |
| Left arm out (+45°) | 0 / 0 / 0 | 5.7 / 10.8 / **0.0** cm | 1.6 / 16.9 / 0 mm | 0.84–1.32 (0.21, **9.78**) | 5.4 mm |
| Right arm out (−45°) | 0 / 0 / 0 | 5.6 / **0.0** / 10.9 cm | 1.6 / 0 / 17.0 mm | 0.84–1.32 (0.37, 6.55) | 5.5 mm |
| Both arms raised (±80°) | 0 / 0 / 0 | 9.5 / 18.1 / 18.2 cm | 5.7 / 28.5 / 28.5 mm | **0.64–2.16** (0.22, **16.0**) | 2.8 mm |
| Torso rotation (3 × 7° about Y) | 0 / 0 / 0 | 8.8 / 11.3 / 11.2 cm | 10.3 / 8.7 / 8.6 mm | 0.85–1.18 (0.09, 3.23) | 6.6 mm |

### Personal body shape, rest pose

| Variant / pose | Penetrating (all regions) | Max displacement T / L / R | Edge strain p1–p99 (max) | Neck clearance |
| --- | --- | --- | --- | --- |
| Identity · rest | 0 | 0 | 1.000–1.000 | 6.6 mm |
| Identity · left arm | 0 | 5.3 / 10.3 / 0.0 cm | 0.84–1.31 (9.37) | 5.4 mm |
| Identity · arms raised | 0 | 8.9 / 17.3 / 17.5 cm | 0.63–2.06 (15.3) | 2.9 mm |
| Identity · torso rotation | 0 | 8.6 / 11.1 / 11.0 cm | 0.87–1.16 (3.07) | 6.6 mm |
| Identity + scale · rest | 0 | 0 | 1.000–1.000 | 6.6 mm |
| Identity + scale · arms raised | 0 | 9.0 / 17.8 / 18.0 cm | 0.62–2.08 (15.7) | 2.8 mm |

The right-arm rows match the left within 0.1 cm (all values in `outputs/garment-tests/deformation-summary.json`).

### Findings

- **The garment deforms with the skeleton.** Each sleeve follows its arm (10–18 cm); the opposite sleeve moves **exactly 0** in single-arm poses; the torso follows the spine rotation (8.5–8.8 cm). The test asserts these.
- **No penetration detected** in any of the 15 body × pose combinations under the approximate metric. Garment weights are derived from the body's, so both deform together. This is evidence of consistent skinning, **not** of physically plausible cloth.
- **Underarm artifacts (FAIL for "consistent shape" in raised-arm poses).** With both arms raised, 1% of edges stretch beyond 2.16×, up to 16× near the armpits. Renders show small "fins" at the sides below the armpits and boxy, flared sleeves. The cause is linear blend skinning of the armpit webbing created by the 2-voxel closing (torso-weighted and arm-weighted vertices pull apart). Single-arm poses peak at 9.8×, also at the underarm.
- **Follow error of 1.7–2.9 cm on the sleeves** is mostly geometric: points offset 2 cm from the arm surface sweep a larger arc than the surface when the arm rotates 45–80°. It is not a binding defect (bind drift 1.2e-7 m).
- **Neckline** stays within 6.7 mm of the neck axis horizontally in every pose, with at least 2.8 mm body clearance.

## Personal body shape: comparison

| | Neutral identity, rest | Personal identity, rest | Personal identity + scale, rest |
| --- | --- | --- | --- |
| Evaluated from | zeros | SAM `shape_params` (pose 0) | `shape_params` + SAM scales (pose 0) |
| Skeleton vs neutral | — | identical (inverse-bind Δ 0) | differs (inverse-bind Δ 0.082) |
| Stature (vertex y-range) | 1.727 m | 1.737 m | 1.715 m (feet at +0.052 m) |
| Garment retarget displacement (max / mean) | — | 3.66 / 1.73 cm | 3.90 / 2.01 cm |
| Clearance before rule (min outer) | — | 7.5 mm (70 vertices < 8 mm) | 7.6 mm (78 vertices < 8 mm) |
| Clearance rule push (max) | 1.6 cm (166 vertices, neckline) | 0.54 mm | 0.43 mm |
| Rest penetration (validator) | 0 | 0 | 0 |
| Garment volume | 0.00159 m³ | 0.00149 m³ | 0.00150 m³ |

The personal rest-pose bodies stand **upright**, without the forward lean of the SAM-posed GLB, as expected from evaluating pose 0. The same T-shirt retargets with sub-millimetre corrections. Visible issues: slight surface **speckle** from the nearest-neighbour displacement transfer, and the identity-plus-scale body floats 5.2 cm above the ground.

## Recorded geometry and collision issues

1. Underarm fins and extreme local stretch (up to 16×) in raised-arm poses (LBS of the closed armpit webbing).
2. The neckline needed up to a 1.6 cm push-out (120 of 166 pushed vertices are on the collar edge); the back neckline edge is slightly wavy.
3. Faint residual extraction terracing on large flat areas (6 mm grid), visible only at grazing light.
4. Retargeted garments show high-frequency speckle from the 8-NN displacement transfer.
5. The garment is dense (65k vertices, 3.5× the body); not decimated.
6. Sleeve UV islands are cylindrical and stretched; fine for a solid colour, not for textures.
7. Intersection checks are approximate (nearest vertex/sample) and miss thin interpenetration between samples.
8. The identity-plus-scale body is not ground-aligned (+5.2 cm).

## Reconstruction pipeline regression

- **Scripts unchanged:** `reconstruct.py`, `sam3d_mhr_adapter.py` and `validate_glb.py` have the same SHA-256 as at the end of Sprint 0.5.
- **Still operational:** a fresh run on the authorized JPEG (`outputs/sam3d-person-front-sprint10-regression`) succeeded. Inference 12.6 s; peak allocation 6,462,980,096 B (the same spill behaviour as before); vertices within 8.3e-7 m of the protected baseline; identical bbox; 19 Python reconstruction tests pass.
