# Sprint 2.2A: signed corrective measure (contract v2) and arm-down corrective (shirt v5.2)

**Result: PASS.**
- **v5.2:** /try-on can lower the arms 20° towards the body, standing and with the 10° walk swing, with **0 shirt vertices beyond 3 mm** (v5.1: 49 standing, 82 walking).
- **Contract v2** (`signed_swing_deg`, two-way ramps) was committed first (`99415ac`).
- **New sidecars only:** v5.1 and pants v2 got contract-v2 sidecars; their GLBs are unchanged.

Nothing was pushed.

## Contract v2 ([corrective-morphs.md](../contracts/corrective-morphs.md))

- **`signed_swing_deg` (§3b).** The bone direction is projected onto the plane spanned by its rest direction and a sidecar `axis` (parent space). The result is `degrees(atan2(n·e, n·r))`: positive towards `axis`, negative away from it, with the 0.01° epsilon.
- **Producer convention.** `axis = ω × r_world`, in the parent's rest frame. The neutral-rig axes and sanity values are listed in the contract. With the abduction axis: raise 90° → +89.84, lower 20° → −19.97, lower 20° plus the 10° walk swing → −20.04, swing alone → +0.08.
- **Ramps (§4).** `weight = clamp((s − a)/(b − a), 0, 1)` with `a ≠ b` in either order, so [0, −20] means lowering.
- **Versions.** Version 2 sidecars may mix both measures. Version 1 sidecars (`swing_deg` only) stay valid: v5 and pants v1 keep theirs, byte-identical.
- **Reference implementation.** `posing.signed_swing_deg` / `corrective_weights`. The validator accepts versions 1 and 2, and checks signed axes and ramp direction.

## Sidecars switched to the signed measure (GLBs byte-identical)

| Asset | Targets | Change |
| --- | --- | --- |
| Shirt v5.1 | `corr_*_abd90`, `corr_*_abd120` | Signed abduction, ramps [0, 90] / [90, 120] as before. Lowering an arm no longer switches them on. |
| Shirt v5.1 | `corr_*_hip90` (hem) | Signed hip flexion, ramp [20, 90] |
| Pants v2 | `corr_*_hip90`, `corr_*_knee90` | Signed flexion, ramps unchanged ([20, 90] hips, [0, 90] knees) |

**Why the hips keep [20, 90].** With the sign handled, the 20° start is no longer a direction fix, only tuning. The hip target is solved at 90°. With a [0, 90] ramp it over-corrects at partial flexion: pants v2 `squat` flips went 110 → 824 and `l-hip-60` 6 → 53, measured. With [20, 90], every pants v2 number equals Sprint 2.1A.

**Effect of the shirt's signed sidecar on lowering.** v5.1 lowered 15° now has 215 self-intersections above rest (v5's swing sidecar: 927). These are exactly v2's numbers, because the abduction targets no longer fire. At the raise poses nothing changes beyond rounding: abd120 at +120° goes from 0.9907 to 0.9942, and every Sprint 1.4A gate is unchanged (both +90 max 8.571; both +120 19 flips, +18 self-intersections; 0 penetration).

## Shirt v5.2: arm-down corrective

`outputs/garments/experiments/tshirt-v5.2-mhr-neutral.glb` + `.correctives.json` is v5.1 plus `corr_L_add20` / `corr_R_add20` (morph targets 6–7).
- **Driven by:** signed abduction with ramp [0, −20].
- **Solved at:** the arm lowered 20°, using the same solver as the other correctives (DQS start, ARAP, triangle collision), in an 18–30 cm sphere around the shoulder joint on its own side.
- **Collision:** the solved shape must also clear the arm at the ±10° walk swing. Without that, the walk pose still had 75 vertices at 10 mm.
- **What it moves:** the shirt's torso side panel at elbow height, inwards into its ease (max delta 1.6–1.7 cm).

Shirt against the body (exact; `walk` = lowered plus the 10° swing, right arm forward, left back):

| Arms lowered | v5.1: vertices > 3 mm (max) | **v5.2: vertices > 3 mm (max)** | v5.2 self-intersections above rest | v5.2 max stretch |
| --- | --- | --- | --- | --- |
| 0° / 5° / 10° | 0 / 0 / 0 | **0 / 0 / 0** | 0 / 0 / 0 | 1.00 / 1.60 / 2.35 |
| 15° | 0 | **0** | 29 (v5.1: 215) | 3.15 |
| **20°** | 49 (8.45 mm) | **0** | 813 (v5.1: 779) | 3.96 |
| walk 15° | 0 | **0** | 286 (v5.1: 418) | 3.03 |
| **walk 20°** | 82 (10.93 mm) | **0** | 534 (v5.1: 821) | 3.85 |
| 25° (outside the ramp) | 595 (25.5 mm) | 483 (16.1 mm) | 883 | 3.96 |
| 30° | 1,196 (43.1 mm) | 1,133 (35.4 mm) | 1,148 | 3.96 |

- **Supported range:** v5.2 holds no penetration over 3 mm up to 20° lowered, standing and walking. Beyond 20° the target is at full weight and the arm meets the torso; that is out of scope.
- **Cost:** the side panel's max edge stretch rises to 3.96 at 20°, from 1.70; it is compressed and pulled in. Self-intersections at 20° standing are about v5.1's.
- **Other poses unchanged:** at the raise poses v5.2 equals v5/v5.1 (add20 weights are 0). At the leg poses v5.2 equals v5.1, including 0 hem penetration at `step`.

## Known limitation (accepted): pants `step` / `squat` folds

As decided, pants v2's remaining flips at `step` (1,725) and `squat` (110) are self-overlapping folds at the back of the thigh and knee and the front of the hip. None is inside the body: flipped-and-penetrating is 0 at every pose. They are a **known limitation, visual review only**, and get no further work. `walk`, `wide` and `l-hip-60` pass the flip gate.

## Gates and checks

| Item | Result |
| --- | --- |
| Contract v2 written and committed first | **PASS** (`99415ac`) |
| v5.1 and pants v2 GLBs unchanged; only sidecars re-issued | **PASS** (GLB and report SHA-256 identical; sidecars now version 2) |
| v5.2 at 20° lowered, standing and walking: penetration > 3 mm = 0 | **PASS** (0 and 0) |
| v5.2: Sprint 1.4A arm-raise gates | **PASS** (identical to v5) |
| v5.2 / v5.1 at the leg poses: penetration > 3 mm = 0 | **PASS** at every pose |
| Pants v2 with the signed sidecar | Unchanged from 2.1A: penetration 0 at every pose, max stretch ≤ 3.32, waistband layering PASS |
| Validator (v5.1, v5.2, pants v2) | **PASS** |
| Reproducibility: shirts v1–v5, v5.1, v5.2 and pants v1, v2 (GLB, report, sidecar) | **PASS** (all SHA-256 identical on regeneration) |
| Python tests (48) | **PASS** |
| Browser: signed driver and the v5.2 arm-down look | **NOT TESTED** (Codex implements contract v2 in the web driver) |

## Commands (repository root)

```powershell
external/mhr-venv/Scripts/python.exe services/garments/generate_tshirt.py --rules v5.2 --out-dir outputs/garments/experiments
external/mhr-venv/Scripts/python.exe services/garments/generate_tshirt.py --rules v5.1 --out-dir <empty dir>   # sidecar regeneration (GLB identical)
external/mhr-venv/Scripts/python.exe services/garments/generate_pants.py --version v2 --out-dir <empty dir>    # sidecar regeneration (GLB identical)
external/mhr-venv/Scripts/python.exe services/garments/validate_garment.py outputs/garments/experiments/tshirt-v5.2-mhr-neutral.glb outputs/avatars/mhr-neutral.glb
tools/collision/.venv/Scripts/python.exe services/garments/evaluate_arm_down.py --garment v5=outputs/garments/experiments/tshirt-v5-mhr-neutral.glb --garment v5.1=outputs/garments/experiments/tshirt-v5.1-mhr-neutral.glb --garment v5.2=outputs/garments/experiments/tshirt-v5.2-mhr-neutral.glb --out outputs/garment-tests/tshirt-arm-down-sprint-2.2a.json
tools/collision/.venv/Scripts/python.exe services/garments/evaluate_pants.py --pants outputs/garments/experiments/tshirt-v5.2-mhr-neutral.glb --skip-shirt --out outputs/garment-tests/tshirt-v5.2-leg-poses-sprint-2.2a.json
tools/collision/.venv/Scripts/python.exe services/garments/evaluate_pants.py --pants outputs/garments/pants-basic-v2-mhr-neutral.glb --shirt outputs/garments/experiments/tshirt-v5.2-mhr-neutral.glb --out outputs/garment-tests/pants-v2-sprint-2.2a.json
external/mhr-venv/Scripts/python.exe services/garments/evaluate_correctives.py --garment v5=outputs/garments/experiments/tshirt-v5-mhr-neutral.glb --garment v5.1=outputs/garments/experiments/tshirt-v5.1-mhr-neutral.glb --garment v5.2=outputs/garments/experiments/tshirt-v5.2-mhr-neutral.glb --out outputs/garment-tests/correctives-sprint-2.2a.json
cd services/garments; ../../external/mhr-venv/Scripts/python.exe -m unittest discover -s tests
```

## Files for Codex

- Shirt v5.2: `outputs/garments/experiments/tshirt-v5.2-mhr-neutral.glb` + `tshirt-v5.2-mhr-neutral.correctives.json` (version 2)
- Shirt v5.1 sidecar (re-issued, version 2): `outputs/garments/experiments/tshirt-v5.1-mhr-neutral.correctives.json`
- Pants v2 sidecar (re-issued, version 2): `outputs/garments/pants-basic-v2-mhr-neutral.correctives.json`
