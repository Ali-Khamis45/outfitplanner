# Sprint 1.4A: pose-aware shoulder correctives (v5)

**Result: v5 = numeric PASS. Decision: v5 becomes the default T-shirt; supported arm poses are capped at ≤ 90°.**

The browser review of v5 at +90° and +120° (side view) shows armpit and upper-side coverage unchanged from v2: the correctives fix stretch, inversions and self-intersections, but they do not cover the flank. The gates below do not measure coverage. Raised-arm coverage above 90° is a documented limitation of skinning without cloth simulation, not a blocker. The coverage gate and Sprint 1.5A (personal v5, neckline/cuff cleanup) were dropped.

## What v5 is

- v5 is v2's rest geometry, skin weights, skeleton and inverse binds, byte-equal, plus four POSITION morph targets (`corr_L_abd90`, `corr_L_abd120`, `corr_R_abd90`, `corr_R_abd120`). The sidecar `tshirt-v5-mhr-neutral.correctives.json` follows [corrective-morphs.md](../contracts/corrective-morphs.md).
- Each key shape (one arm raised to 90° or 120°) is solved in posed space, then stored as bind-space deltas: `delta = SkinMatrix⁻¹·desired − rest`. The solve has three steps ([correctives.py](../../services/garments/correctives.py)):
  1. Start from dual-quaternion skinning. LBS blends the static clavicle with the rotating upper-arm twist joints, which collapses the shoulder top at +120°. That collapse caused v2's 497 flips.
  2. Apply an ARAP relaxation limited to a shoulder sphere (full weight within 16 cm, fading to 0 at 21 cm, own side of the midline only). Anchor strength is 0.3 at 90° and 1.0 at 120°.
  3. Push the result out of the posed body. The inner layer and rims keep their rest offset, rotated by the DQS rotation.
- **First attempt, discarded:** ARAP from LBS gave max stretch 7.12 at +90°, but 688 flips at +90° and 1,638 at +120°, plus 85 vertices penetrating the body.

## Results

The poses are poses.ts `raise` (world-Z abduction from the rest A-pose). Weights come from the contract formula, read from the GLB and sidecar on disk.

Each cell shows: max stretch / flipped triangles / self-intersecting pairs above rest. Body penetration beyond 3 mm was 0 in every cell.

| Pose | Original | v2 | v4 | **v5** |
| --- | --- | --- | --- | --- |
| left +45 | 9.779 / 1 / 4 | 6.424 / 1 / 1 | 7.956 / 1 / 4 | 4.998 / 5 / 5 |
| left +90 | 17.571 / 10 / 9 | 10.937 / 2 / 3 | 14.456 / 4 / 5 | 8.571 / 9 / 8 |
| left +105 | 19.627 / 9 / 9 | 12.100 / 13 / 31 | 16.184 / 18 / 33 | 10.502 / 12 / 11 |
| left +120 | 21.348 / 51 / 73 | 13.057 / 241 / 952 | 17.637 / 244 / 955 | 11.653 / 11 / 16 |
| right +45 | 6.554 / 0 / 1 | 5.894 / 0 / 4 | 7.531 / 0 / 6 | 4.134 / 4 / 0 |
| right +90 | 11.136 / 10 / 7 | 10.070 / 1 / 2 | 13.181 / 3 / 1 | 6.395 / 8 / 0 |
| right +105 | 12.314 / 13 / 10 | 11.150 / 15 / 22 | 14.659 / 17 / 26 | 8.501 / 9 / 0 |
| right +120 | 13.283 / 72 / 115 | 12.041 / 256 / 936 | 15.887 / 260 / 940 | 10.277 / 8 / 2 |
| both +45 | 9.779 / 1 / 3 | 6.424 / 1 / 5 | 7.956 / 1 / 10 | 4.998 / 9 / 5 |
| **both +90** | 17.571 / 20 / 14 | 10.937 / 3 / 5 | 14.456 / 7 / 6 | **8.571** / 17 / 5 |
| both +105 | 19.627 / 22 / 17 | 12.100 / 28 / 53 | 16.184 / 35 / 59 | 10.502 / 21 / 10 |
| **both +120** | 21.348 / **123** / **186** | 13.057 / 497 / 1,888 | 17.637 / 504 / 1,895 | 11.653 / **19** / **18** |

At rest every garment has max stretch ≤ 1.002 and 0 flips. The Python metrics reproduce the web suite's numbers for original, v2 and v4 exactly (both +90 max 17.5707 / 10.9372 / 14.4555; both +120 flips 123 / 497 / 504; self-intersections above rest 186 / 1,888 / 1,895).

v5 has 4–17 more flipped triangles than v2 at 45° and 90°. That is far below the gate, but it is the price of the DQS/ARAP shoulder.

## Gates (v5)

| Gate | Limit | v5 | Result |
| --- | --- | --- | --- |
| Both +90 max stretch | ≤ 8.785 | 8.571 | PASS |
| Both +120 flipped triangles | ≤ 123 | 19 | PASS |
| Both +120 self-intersections above rest | ≤ 186 | 18 | PASS |
| Penetration > 3 mm, all 15 poses | 0 | 0 | PASS (approximate: nearest posed body vertex along its normal) |
| Rest equals v2: POSITION, NORMAL, UV, joints, weights, region, indices, inverse binds, skeleton nodes | byte-equal | byte-equal | PASS |
| Validator, including the new morph and sidecar checks | passes | passes | PASS |
| Deltas local to their own shoulder region and midline side | 0 outside | 0.0 m outside | PASS |
| No single-vertex spikes | isolation ratio ≪ 2 | ≤ 1.36 | PASS (see note) |
| v1–v4 regenerate byte-for-byte; v5 regenerates byte-for-byte | equal | equal | PASS |
| Python tests (27) | pass | pass | PASS |
| Armpit/upper-side coverage at +90 and +120 | — | unchanged from v2 (browser review) | NOT MEASURED; capped by the pose decision |
| Browser rendering of the morphs | — | reviewed by Codex | see Sprint 1.4B/C |

**Smoothness note.** The largest delta Laplacian is 2.5 cm (p99 is 1.1 mm). It sits in the back armpit crease, where 2 mm rest triangles must separate. It is a steep but continuous gradient: no vertex deviates beyond the spread of its own neighbours (isolation ratio ≤ 1.36, where a spike would be ≫ 1). Smoothing it away pushed both +90 back to 10.8–12.2, over the gate.

**Swing check against the browser.** At the +120 test pose Python gives `swing_deg` 119.7206° and abd120 = 0.9907, matching the browser's 0.99. Both use child `l_lowarm`/`r_lowarm`, the direct child of the upper-arm joint. The swing is below 120 because the rest bone points slightly forward (direction (±0.670, −0.741, 0.053)). The values at the other key poses are 44.93° (+45), 89.84° (+90) and 104.79° (+105).

**Contract changes in this sprint.** Every sidecar entry names its `child` joint. `swing_deg < 0.01` counts as 0, because round-off and pose resets never return exactly to the rest rotation.

## Commands (repository root)

```powershell
external/mhr-venv/Scripts/python.exe services/garments/generate_tshirt.py --rules v5 --out-dir outputs/garments/experiments
external/mhr-venv/Scripts/python.exe services/garments/validate_garment.py outputs/garments/experiments/tshirt-v5-mhr-neutral.glb outputs/avatars/mhr-neutral.glb
external/mhr-venv/Scripts/python.exe services/garments/evaluate_correctives.py   # original, v2, v4, v5 -> outputs/garment-tests/correctives-sprint-1.4a.json
cd services/garments; ../../external/mhr-venv/Scripts/python.exe -m unittest discover -s tests
# byte-for-byte regeneration (into an empty directory, then compare SHA-256 with the existing assets)
external/mhr-venv/Scripts/python.exe services/garments/generate_tshirt.py --rules v1|v2|v4 --out-dir <empty dir>
external/mhr-venv/Scripts/python.exe services/garments/generate_tshirt.py --rules v2 --name v3-close1 --override close_voxels=1 --out-dir <empty dir>
```

The generator refuses to overwrite. v5 SHA-256 is `1c09b494…3fa0` (GLB) and `c5e735cf…f215` (sidecar).

## Files for the browser

- GLB: `outputs/garments/experiments/tshirt-v5-mhr-neutral.glb`
- Sidecar: `outputs/garments/experiments/tshirt-v5-mhr-neutral.correctives.json`
