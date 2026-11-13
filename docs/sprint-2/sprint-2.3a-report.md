# Sprint 2.3A: personal fit (shirt v5.2 + pants v2 on the personal body)

**Result: PASS on the primary personal body.**
- **Shirt:** passes the body's own shoulder gates (+90 max stretch 8.11 ≤ 8.61; +120 28 flips ≤ 255, 90 self-intersections ≤ 896) with 0 penetration.
- **Arm-down:** 0 vertices beyond 3 mm at 20°, standing and walking.
- **Leg poses:** 0 penetration for shirt and pants at every pose.
- **Layering:** the shirt-over-pants check passes.
- **Known limitation (as on neutral):** the pants `step`/`squat` folds.

The identity-only body (secondary) passes the same gates. Personal data stays local: the files are under git-ignored `outputs/`, and this report contains measurements only.

Also in this sprint, the merge of `sprint-2.0-web` up to `afa733d` ("Use v5.2 and restore desktop framing") into `sprint-2.0-pants`: commit `5c60282`. There were no conflicts; `docs/contracts/` is the producer version and `apps/web/` is Codex's. All Python tests and the web typecheck, lint, build and npm test passed. Nothing was pushed.

## Bodies

| Role | Manifest id | Body GLB (unchanged, read only) |
| --- | --- | --- |
| **Primary** | `personal-scaled` | `outputs/avatars/sam3d-person-front-sprint03-run2-rest-identity-scale-floor.glb` (identity + scales, ground-aligned) |
| Secondary | `personal-identity` | `outputs/avatars/sam3d-person-front-sprint03-run2-rest-identity.glb` (identity only) |

Both avatar GLBs were reused after an identity check (vertex error 5.7e-8 m), never rewritten. They are read-only files from 31 Oct.

## Pipeline (same as the earlier personal shirt fit, plus three Sprint 2.3A steps)

1. **Retarget.** The neutral garment (shirt v5.2 / pants v2 design) is retargeted to the personal rest body by the body's own displacement field, then pushed clear of it (smoothed clearance pass).
2. **Degenerate clean-up (new, [personal_fit.py](../../services/garments/personal_fit.py)).**
   - Collapses rest edges < 1 mm, and an edge (shortest first, ≤ 3 mm) of every triangle < 1 mm².
   - Skips collapses that would make the surface non-manifold.
   - Flips the long edge of a remaining "cap" triangle where that is valid.
   - Merged vertices are re-weighted (average of the two weight sets); every other vertex keeps its exact weights.
   - The shell stays closed (watertight, consistent winding, same genus).
3. **Per-body shoulder correctives (new).** The body's gates come from its original (v1) shirt, exactly as the neutral gates did (8.785 = ½ × 17.57, 123 flips, 186 self-intersections from the neutral original):
   - both +90 max stretch ≤ ½ × the original's;
   - both +120 flips ≤ the original's;
   - both +120 self-intersections above rest ≤ the original's;
   - 0 penetration.

   The generator solves the four shoulder targets with a fixed, ordered list of settings: the neutral ones first, then weaker 90° anchors and more iterations. It keeps the first setting that passes this body's gates (or the best one), so the result is deterministic.
4. **Hip, arm-down and leg correctives.** Re-solved on the body with the same specs as neutral. Sidecars use contract v2, with the axes computed from the personal skeleton.

| Clean-up | Shirt (each body) | Pants (each body) |
| --- | --- | --- |
| Collapses / outer triangles removed | 48 / 56 | 26 / 26 |
| Vertices re-weighted | 33 | 21 (primary), 22 (identity) |
| Edges < 1 mm remaining | 0 | 0 |
| Triangles < 1 mm² remaining | **1** (0.91 mm², edges 1.1 / 5.3 / 6.4 mm, front neckline; no valid collapse or flip) | 0 |

The GLB contains both layers and the rims, so each removed outer triangle removes about two triangles from the GLB: shirt 121,980 → 121,788, pants 162,432 → 162,328.

## Shoulder gates (per body, contract weights)

| Body | Gates (from its original v1 shirt) | Settings chosen | Both +90 max stretch | Both +120 flips | Both +120 self-intersections above rest | Penetration > 3 mm (15 poses) |
| --- | --- | --- | --- | --- | --- | --- |
| **Primary** | ≤ 8.612 / ≤ 255 / ≤ 896 (original 17.22 / 255 / 896) | 90° anchor 0.1 (candidate 2) | **8.111 PASS** | **28 PASS** | **90 PASS** | **0 PASS** |
| Identity | ≤ 8.401 / ≤ 118 / ≤ 190 (original 16.80 / 118 / 190) | 90° anchor 0.2 (candidate 1) | **8.032 PASS** | **16 PASS** | **9 PASS** | **0 PASS** |

**Search log, primary body:**

| Candidate | 90° anchor | +90 max stretch | Result |
| --- | --- | --- | --- |
| 0 (neutral settings) | 0.3 | 9.606 | FAIL |
| 1 | 0.2 | 9.147 | FAIL |
| 2 | 0.1 | 8.111 | PASS |

**Search log, identity body:**

| Candidate | 90° anchor | +90 max stretch | Result |
| --- | --- | --- | --- |
| 0 (neutral settings) | 0.3 | 8.436 | FAIL |
| 1 | 0.2 | 8.032 | PASS |

Before the clean-up and the per-body search, the identity body's +90 max was 9.34, all from a 0.3 mm sliver on the right armpit rim.

For comparison, the personal v2 shirts on the same bodies give both +90 max stretch 10.62 / 10.15 and +120 flips 658 / 517.

**Rest equality.** The shipped v5.2 rest data is **not** byte-equal to the earlier personal v2 shirt, because the clean-up changed the topology. Skeleton nodes and inverse binds are byte-equal. All morph weights are exactly 0 at rest, so the rest shape is the cleaned fit itself.

## Arm-down (shirt against the body, exact; /try-on Stand and Walk)

| Pose | Primary v2 | **Primary v5.2** | Identity v2 | Identity v5.2 |
| --- | --- | --- | --- | --- |
| lowered 15° | 0 | **0** | 0 | 0 |
| lowered 20° | 0 (deepest 2.0 mm) | **0** | 0 | 0 |
| walk 15° | 0 | **0** | 0 | 0 |
| walk 20° | 15 (8.6 mm) | **0** | 1 (4.6 mm) | 0 |
| lowered 25° (outside the ramp) | 274 (18.3 mm) | 264 (12.3 mm) | 142 (14.1 mm) | 178 (10.9 mm) |

## Leg poses: shirt and pants on the personal body

Shirt v5.2, vertices beyond 3 mm (exact): **0 at rest, walk, l-hip-60, step, squat and wide, on both bodies.** The hip hem correctives keep the thigh out of the hem at `step`.

Pants v2 on the primary body (identity-only body in brackets):

| Pose | Penetration > 3 mm | Flipped | Flipped and colliding | Flip limit (3 × body flips) | Max stretch (≤ 4.0) |
| --- | --- | --- | --- | --- | --- |
| rest | 0 (0) | 0 (0) | 0 (0) | 0 | 1.00 (1.00) |
| walk | 0 (0) | 0 (0) | 0 (0) | 0 | 2.27 (2.19) |
| wide | 0 (0) | 0 (0) | 0 (0) | 0 | 2.24 (2.21) |
| l-hip-60 | 0 (0) | 4 (3) | 2 (3) | 21 (15) | 2.58 (2.37) |
| step | 0 (0) | 1,675 (1,483) | 499 (450) | 255 (228) | 3.53 (3.34) |
| squat | 0 (0) | 122 (85) | 62 (45) | 0 | 2.37 (2.37) |

- **Pass:** `walk`, `wide` and `l-hip-60`, matching the neutral decision.
- **Known limitation, visual review only:** `step` and `squat` show the self-overlapping crease folds already accepted on neutral. None of their flipped triangles is inside the body (flipped-and-penetrating = 0 at every pose).
- **Rest self-intersections:** 0 on both bodies (neutral pants v2: 21, on the cuff rims).

**Layering at rest:**

| Body | Overlap | Containment | Triangle intersections | Layer order |
| --- | --- | --- | --- | --- |
| Primary | 11.1 cm (hem 0.809 m, waistband 0.919 m) | 0 / 0 | 0 | shirt outside in 719/719 cells |
| Identity | 11.2 cm | 0 / 0 | 0 | 725/725 cells |

## Gates summary (primary body)

| Gate | Result |
| --- | --- |
| Shoulder gates (body's own) | **PASS** |
| Penetration > 3 mm, 15 arm poses | **PASS** (0) |
| Arm-down 20°, standing and walking | **PASS** (0) |
| Shirt and pants penetration > 3 mm at all leg poses | **PASS** (0) |
| Pants max stretch ≤ 4.0 | **PASS** (≤ 3.53) |
| Pants flip gate | walk, wide, l-hip-60 **PASS**; step, squat **known limitation (visual review only)** |
| Shirt over pants at rest | **PASS** |
| Validator (shirt, pants) | **PASS** (shirt genus 3 with 8 targets; pants genus 2 with 4 targets; weight-sum error ≤ 1.4e-7; 0 rest penetrations) |
| Degenerate clean-up: edges < 1 mm | **PASS** (0 remaining) |
| Degenerate clean-up: triangles < 1 mm² | shirt: **1** cap triangle (0.91 mm², min edge 1.1 mm) cannot be collapsed or flipped validly; pants: 0 |
| Manifest schema, files present, sidecar targets present in their GLBs | **PASS** (Python test) |
| Personal fits regenerate byte-for-byte | **PASS** (all 12 files: GLB, sidecar and report for shirt and pants on both bodies; SHA-256 identical) |
| Neutral assets (shirts v1–v5.2, pants v1/v2) regenerate byte-for-byte | **PASS** (all 23 files, with the Sprint 2.3A generator changes) |
| Browser view of the personal fit | **NOT TESTED** (Codex reads the manifest) |

## Manifest

`outputs/garments/personal/manifest.json` (git-ignored), written by [personal_manifest.py](../../services/garments/personal_manifest.py) in the schema the web app uses:
- `version`, `fit_date`;
- `primary` and `secondary[]`, each with `id`, `label`, `body`, `top{glb, sidecar}` and `bottom{glb, sidecar}`.

All paths are repository-relative with forward slashes, inside `outputs/`. [test_personal_fit.py](../../services/garments/tests/test_personal_fit.py) checks the exact schema, that every listed file exists, and that every sidecar target exists in its GLB and the other way round.

## Commands (repository root)

```powershell
external/mhr-venv/Scripts/python.exe services/garments/generate_tshirt.py --rules v5.2 --reconstruction outputs/sam3d-person-front-sprint03-run2/reconstruction.npz --personal-only --out-dir outputs/garments/personal
external/mhr-venv/Scripts/python.exe services/garments/generate_pants.py --version v2 --reconstruction outputs/sam3d-person-front-sprint03-run2/reconstruction.npz --personal-only --out-dir outputs/garments/personal
external/mhr-venv/Scripts/python.exe services/garments/personal_manifest.py
# gates, per body V in {rest-identity-scale-floor, rest-identity}; A = outputs/avatars/sam3d-person-front-sprint03-run2-$V.glb; P = outputs/garments/personal
external/mhr-venv/Scripts/python.exe services/garments/validate_garment.py $P/tshirt-v5.2-sam3d-person-front-sprint03-run2-$V.glb $A
external/mhr-venv/Scripts/python.exe services/garments/validate_garment.py $P/pants-basic-v2-sam3d-person-front-sprint03-run2-$V.glb $A
external/mhr-venv/Scripts/python.exe services/garments/evaluate_correctives.py --garment v2=outputs/garments/tshirt-v2-sam3d-person-front-sprint03-run2-$V.glb --garment v5.2=$P/tshirt-v5.2-sam3d-person-front-sprint03-run2-$V.glb --base outputs/garments/tshirt-v2-sam3d-person-front-sprint03-run2-$V.glb --avatar $A --out outputs/garment-tests/personal-arms-$V.json
tools/collision/.venv/Scripts/python.exe services/garments/evaluate_arm_down.py --garment v2=outputs/garments/tshirt-v2-sam3d-person-front-sprint03-run2-$V.glb --garment v5.2=$P/tshirt-v5.2-sam3d-person-front-sprint03-run2-$V.glb --avatar $A --out outputs/garment-tests/personal-armdown-$V.json
tools/collision/.venv/Scripts/python.exe services/garments/evaluate_pants.py --pants $P/tshirt-v5.2-sam3d-person-front-sprint03-run2-$V.glb --skip-shirt --avatar $A --out outputs/garment-tests/personal-shirt-legs-$V.json
tools/collision/.venv/Scripts/python.exe services/garments/evaluate_pants.py --pants $P/pants-basic-v2-sam3d-person-front-sprint03-run2-$V.glb --shirt $P/tshirt-v5.2-sam3d-person-front-sprint03-run2-$V.glb --avatar $A --out outputs/garment-tests/personal-pants-$V.json
cd services/garments; ../../external/mhr-venv/Scripts/python.exe -m unittest discover -s tests
```
