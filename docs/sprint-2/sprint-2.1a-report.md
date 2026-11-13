# Sprint 2.1A: pants v2, shirt v5.1, arm-down check

**Result: partial PASS.**
- **Fixed in pants v2:** crotch stretch (all poses ≤ 3.33), `step` penetration (0) and the ankle cuffs (gap to the leg 49 → 16 mm median).
- **Shirt v5.1:** the raised thigh no longer pokes through the hem at `step` (754 → 0 vertices beyond 3 mm).
- **Still failing:** the revised flip gate at `l-hip-60`, `squat` and `step`.
- **Arm-down check (not done):** a sleeve-underside corrective has not been built. The shirt is clean down to 15° below the A-pose and penetrates at 20°.

Nothing was pushed. All older assets regenerate byte-for-byte.

## Assets

| Asset | File | Notes |
| --- | --- | --- |
| Pants v2 | `outputs/garments/pants-basic-v2-mhr-neutral.glb` + `.correctives.json` | 84,950 vertices / 162,432 triangles, genus 2, validator PASS |
| Shirt v5.1 | `outputs/garments/experiments/tshirt-v5.1-mhr-neutral.glb` + `.correctives.json` | v5 plus `corr_L_hip90` / `corr_R_hip90` (morph targets 4–5), validator PASS |

Both use the corrective-morph contract unchanged; its per-garment target table now lists v5.1 and pants v2.

## What changed

**Pants v2** ([pants.py](../../services/garments/pants.py), [correctives.py](../../services/garments/correctives.py)). All new options default off, so v1 is untouched.
- **Twist fold.** Before the weights are cut to four influences, `*_twist*_proc` weights move onto their parent hip or knee joint. The twist joints are rigid children that no contract pose rotates, so this is exact. The crotch stretch came from the four-influence cut dropping a different joint on each side of the seam.
- **Diamond crotch gusset.** A panel (641 vertices, region `crotch_gusset`, its own UV island) centred on the seam saddle. It reaches 8 cm across and down each inseam and 11 cm front/back. Its rest triangles are relaxed, and its weights are the harmonic interpolation of the weights around it.
- **Turned-in cuffs.** Over the last 4 cm the tube narrows towards the ankle, per direction around the leg (ankle extent + 1.2 cm). The hem loop is then smoothed, because the narrowed jagged edge had made the rims cross.
- **Correctives.**
  - **Energy:** compressible (membrane) instead of ARAP, so creases compress instead of buckling.
  - **Collision:** against the body's triangles instead of the nearest vertex's normal, which picked the wrong side of the belly/thigh crease.
  - **Regions:** larger (hip 22–30 cm, knee 18–26 cm), anchor 0.3.
  - **Midline:** each hip corrective reaches 7 cm past the midline, covering the crotch vertices the other thigh now moves.

**Shirt v5.1** (`--rules v5.1`): hip-flexion correctives (ramp 20→90°, solved at 90° hip flexion with triangle collision). They lift the front hem over the raised thigh: hem front y 0.985 → 1.001 at `step`. v5.1 is identical to v5 at every arm pose (same 1.4A table and gates, rest byte-equal to v2).

## Flip gate (revised in this sprint)

The revised gate has two parts:
- (a) No flipped triangle may also self-intersect or have a corner inside the body.
- (b) Total flips ≤ 3 × the body skin's own flips at that pose.

v1 is rescored under the same rule.

## Pants: v1 vs v2

Each cell shows v1 → v2.

| Pose | Penetration > 3 mm (exact) | Flipped | Flipped and colliding (a) | Flip limit (b) | Max stretch (≤ 4.0) | Self-intersections above rest |
| --- | --- | --- | --- | --- | --- | --- |
| rest | 0 → 0 | 0 → 0 | 0 → 0 | 0 | 1.00 → 1.00 | 0 → 0 |
| walk | 0 → 0 | 24 → **0** | 18 → **0** | 0 | 5.02 → **2.23** | 70 → 0 |
| wide | 0 → 0 | 0 → 0 | 0 → 0 | 0 | 5.20 → **2.20** | 0 → 0 |
| l-hip-60 | 0 → 0 | 118 → 6 | 76 → **5** | 24 | 6.55 → **2.44** | 257 → 40 |
| step | **5 (6.5 mm) → 0** | 2,786 → 1,726 | 1,424 → **549** | 285 | 9.21 → **3.32** | 7,144 → 1,972 |
| squat | 0 → 0 | 459 → 110 | 117 → **60** | 0 | 2.66 → 2.35 | 359 → 122 |

Rest self-intersecting pairs are 19 (v1) and 21 (v2), all on the ankle hem rims.

## Gates (pants v2)

| Gate | Result |
| --- | --- |
| Penetration > 3 mm = 0, all poses | **PASS** (deepest 0.0 mm) |
| Flip gate (a): flipped and colliding = 0 | PASS at rest, walk and wide. **FAIL** at l-hip-60 (5), squat (60) and step (549). Every one is a self-intersection, none is inside the body: folds at the back of the thigh and knee and at the front hip, which overlap themselves. |
| Flip gate (b): flips ≤ 3 × body flips | PASS at rest, walk, wide and l-hip-60 (6 ≤ 24). **FAIL** at squat (110 > 0) and step (1,726 > 285). |
| Max stretch ≤ 4.0 (crotch: walk ≤ 4.0 first, then wide, l-hip-60, step) | **PASS** at all poses (worst 3.32 at step) |
| `step` waist-front penetration fixed without regressing other poses | **PASS** (5 → 0; every pose has fewer flips and less stretch than v1) |
| Cuffs: inside face hidden | Gap from the cuff edge to the leg: v1 median 48.6 / max 65.9 mm, v2 median 15.9 / max 20.5 mm (min 12.3 mm). The visual check is **NOT TESTED** (browser). |
| Waistband under the shirt hem at rest | **PASS** (9.05 cm overlap, no containment either way, no triangle intersections, layer order holds in 669/669 cells) |
| Validator (pants v2, shirt v5.1) | **PASS** |
| Reproducible: shirts v1–v5 and pants v1 regenerate byte-for-byte | **PASS** (GLB, report and sidecar SHA-256 identical) |
| Python tests (42) | **PASS** |

## Shirt v5 vs v5.1 at the leg poses (shirt against the body, exact)

| Pose | v5: penetration > 3 mm (max) | v5.1: penetration > 3 mm (max) | v5 / v5.1 flips |
| --- | --- | --- | --- |
| walk | 0 | 0 | 2 / 0 |
| l-hip-60 | 0 | 0 | 813 / 795 |
| **step** | **754 (28.2 mm)** | **0** | 1,647 / 1,921 |
| squat | 0 | 0 | 562 / 479 |
| wide | 0 | 0 | 0 / 0 |

With pants v2 at `step`, 100 pants vertices graze inside the 2 mm shirt shell (at most 0.9 mm deep; v5: 154). This is reported only; it is not gated.

## Arm-down check for /try-on (Stand and Walk)

Both arms were lowered towards the body from the A-pose (the opposite of `raise`). "walk" adds a 10° swing (right arm forward, left back). Penetration is the shirt against the body, exact.

| Arms down | 0° | 5° | 10° | **15°** | 20° | 25° | 30° | walk 15° | walk 20° |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v2, v5, v5.1: vertices > 3 mm (max) | 0 | 0 | 0 | **0** | 49 (8.5 mm) | 595 (25.5 mm) | 1,196 (43 mm) | 0 | 82 (10.9 mm) |
| v2 self-intersections above rest | 0 | 1 | 14 | 215 | 779 | 1,158 | 1,314 | 418 | 821 |
| v5 self-intersections above rest | 0 | 1 | 377 | 927 | 1,147 | 1,319 | 1,414 | 866 | 1,041 |

- **Largest arm-down angle with no penetration > 3 mm: 15°**, standing and with the walk swing. At 20° the arm presses the shirt's torso side panel 8.5 mm (walk: 10.9 mm) into the body.
- **v5 makes self-intersections worse when the arm is lowered.** `swing_deg` has no direction, so lowering the arm 15° switches `corr_*_abd90` on at 0.17 with an abduction-shaped correction. That quadruples self-intersections at 15° (927 vs 215) without adding penetration. Starting the abd90 ramp at 25° instead of 0° removes this exactly (the numbers become v2's) and leaves weight ~1 at +90°. The change was not applied to v5.
- **NOT DONE:** the sleeve-underside / side-panel corrective for 20°. Next: an adduction-driven target that moves the shirt's side panel into its 6 mm body clearance, with the abd90 ramp starting at 25°. Both need the direction problem solved: either the 25° ramp start or a signed measure in the contract.

## Commands (repository root)

```powershell
external/mhr-venv/Scripts/python.exe services/garments/generate_pants.py --version v2
external/mhr-venv/Scripts/python.exe services/garments/generate_tshirt.py --rules v5.1 --out-dir outputs/garments/experiments
external/mhr-venv/Scripts/python.exe services/garments/validate_garment.py outputs/garments/pants-basic-v2-mhr-neutral.glb outputs/avatars/mhr-neutral.glb
external/mhr-venv/Scripts/python.exe services/garments/validate_garment.py outputs/garments/experiments/tshirt-v5.1-mhr-neutral.glb outputs/avatars/mhr-neutral.glb
tools/collision/.venv/Scripts/python.exe services/garments/evaluate_pants.py --pants outputs/garments/pants-basic-v2-mhr-neutral.glb --out outputs/garment-tests/pants-v2-sprint-2.1a.json
tools/collision/.venv/Scripts/python.exe services/garments/evaluate_pants.py --skip-shirt --out outputs/garment-tests/pants-v1-sprint-2.1a.json
tools/collision/.venv/Scripts/python.exe services/garments/evaluate_pants.py --pants outputs/garments/experiments/tshirt-v5.1-mhr-neutral.glb --skip-shirt --out outputs/garment-tests/tshirt-v5.1-leg-poses.json
external/mhr-venv/Scripts/python.exe services/garments/evaluate_correctives.py --garment v5=outputs/garments/experiments/tshirt-v5-mhr-neutral.glb --garment v5.1=outputs/garments/experiments/tshirt-v5.1-mhr-neutral.glb --out outputs/garment-tests/correctives-v5.1-sprint-2.1a.json
tools/collision/.venv/Scripts/python.exe services/garments/evaluate_arm_down.py --garment v5=outputs/garments/experiments/tshirt-v5-mhr-neutral.glb --garment v2=outputs/garments/tshirt-v2-mhr-neutral.glb --abd90-ramp-start 25
cd services/garments; ../../external/mhr-venv/Scripts/python.exe -m unittest discover -s tests
# reproducibility: regenerate into an empty folder and compare SHA-256 (shirts v1|v2|v4|v5 and v3-close1 as in sprint-1.4a; pants --version v1)
```
