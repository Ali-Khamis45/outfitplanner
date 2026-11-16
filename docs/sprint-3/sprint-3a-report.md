# Sprint 3A: sizes and fit maps

Branch `sprint-3-sizes` (from `main` 39d1bd2). Contracts: [fit-map.md](../contracts/fit-map.md) (sizes, fit maps, `_EASE_MM`, body measurements) and [garment-texture.md](../contracts/garment-texture.md) (UV layout v2). Everything under `outputs/` is local and git-ignored.

| Deliverable | Result |
| --- | --- |
| S–XL grading of T-shirt v5.2 and pants v2 by region, skeleton binding kept, correctives re-solved per size | PASS: 16 sizes (2 garments × 4 sizes × 2 bodies) |
| Fit maps (`_EASE_MM`, `.fit.json`) for neutral and the primary personal body, exactly one size recommended per garment and body | PASS |
| Calibration from `outputs/avatars/measurements.json` | SKIPPED: the file does not exist. The code path was run on synthetic targets (below) |
| Gates per size: validator, penetration > 3 mm = 0 at rest and at every supported pose | PASS: 16 of 16 sizes, 0 vertices deeper than 3 mm at rest and at every supported pose (worst depth 2.51 mm, tshirt-v5.2-M-personal-scaled.glb). Validator 22 of 22 |
| Layering: every shirt size over pants v2 and every pants size (no penetration, hem overlap ≥ 3 cm) | PASS: 40 of 40 pairs (minimum hem overlap 5.7 cm) |
| Fit-map fixes from the browser check: smooth heatmap (no horizontal step), vertex ease agrees with the region value | PASS: `test_vertex_ease_has_no_steps_along_the_torso`, `test_vertex_ease_agrees_in_sign_with_each_region` |
| UV layout v2 (seat patch, hem density, UV check, documented islands) | PASS, with known limitations (back chevron; folds on 4 shirts). GLB geometry is byte-identical except `TEXCOORD_0` |

## Sizes

A size is a fixed garment, the same on every body ([fit-map.md §7](../contracts/fit-map.md)). Chest, waist and hip specs are the men's chart midpoints of Simplicity / McCall's / Butterick / Vogue, plus the ease of a regular-fit T-shirt (116 mm) or straight pants (90 mm at the hip). Length grades 25.4 mm per size (Gildan 5000). Each region is graded on its own. The skeleton binding is the size's own body rig, and the corrective sidecar (contract v2) is re-solved for every size.

| Size | Shirt chest | Shirt length (HPS to hem) | Pants waistband | Pants hip | Pants inseam |
| --- | --- | --- | --- | --- | --- |
| S | 101.1 cm | 51.8 cm | 87.6 cm | 100.5 cm | 65.6 cm |
| M | 111.1 cm | 54.4 cm | 99.9 cm | 110.5 cm | 65.6 cm |
| L | 121.1 cm | 56.9 cm | 113.3 cm | 120.5 cm | 65.6 cm |
| XL | 131.1 cm | 59.5 cm | 129.6 cm | 130.5 cm | 65.6 cm |

`ease_mm` and `status` always come from the size spec against the body (§3). A region marked **(c)** (clamped) is drawn wider than the spec because the geometry cannot go tighter without penetrating:
- girths, at the minimum-ease floor, or, for shirt hips, by the layering push over the pants (this applies to every shirt size, because one shirt GLB clears the loosest waistband);
- shirt shoulders and sleeves, at the base shirt's size;
- pants seat, at the base pants' hip ease.

For clamped vertices, `_EASE_MM` also shows the spec, so a heatmap shows S shoulders as tight.

### neutral (MHR neutral body)

Body at rest: chest 108.7 cm, waist 92.7 cm, hips 109.5 cm, shoulder width 41.7 cm, height 172.7 cm, inseam 79.2 cm.

**T-shirt v5.2**: recommended **L**. Values are `ease_mm` (`delta_mm` for length) and status.

| Size | chest | waist | hips | shoulders | length |
| --- | --- | --- | --- | --- | --- |
| S | -76 tight (c) | +84 good (c) | -84 tight (c) | -12 tight (c) | -25 good |
| M | +24 tight (c) | +184 good (c) | +16 tight (c) | +19 good | +0 good |
| **L** ✓ | +124 good | +284 good | +116 good (c) | +38 good | +25 good |
| XL | +224 loose | +384 loose | +216 loose (c) | +36 good | +51 loose |

**Pants v2**: recommended **L**. Values are `ease_mm` (`delta_mm` for length) and status.

| Size | waist | hips | length |
| --- | --- | --- | --- |
| S | -206 tight (c) | -90 tight (c) | -2 good |
| M | -83 tight (c) | +10 tight (c) | -2 good |
| **L** ✓ | +51 loose (c) | +110 good (c) | -2 good |
| XL | +214 loose | +210 loose (c) | -2 good |

### personal-scaled (the primary personal body)

The personal body's own measurements are personal data and are not recorded here. They are in the local, git-ignored `outputs/garment-tests/sizes-sprint-3a.json`.

**T-shirt v5.2**: recommended **M**. Values are `ease_mm` (`delta_mm` for length) and status.

| Size | chest | waist | hips | shoulders | length |
| --- | --- | --- | --- | --- | --- |
| S | +56 tight (c) | +224 good (c) | -14 tight (c) | +4 good (c) | -35 good |
| **M** ✓ | +156 good | +324 good | +69 good (c) | +37 good | -10 good |
| L | +256 loose | +424 loose | +160 good (c) | +40 loose | +16 good |
| XL | +356 loose | +524 loose | +260 loose (c) | +40 good | +41 loose |

**Pants v2**: recommended **M**. Values are `ease_mm` (`delta_mm` for length) and status.

| Size | waist | hips | length |
| --- | --- | --- | --- |
| S | -103 tight (c) | -46 tight (c) | +58 loose |
| **M** ✓ | +19 good (c) | +54 good (c) | +58 loose |
| L | +153 loose | +154 loose | +58 loose |
| XL | +316 loose | +254 loose | +58 loose |


### Clamped regions per size

| Body | Garment | Size | Clamped regions |
| --- | --- | --- | --- |
| neutral | T-shirt v5.2 | S | chest, waist, hips, shoulders |
| neutral | T-shirt v5.2 | M | chest, waist, hips |
| neutral | T-shirt v5.2 | L | hips |
| neutral | T-shirt v5.2 | XL | hips |
| neutral | Pants v2 | S | waist, hips |
| neutral | Pants v2 | M | waist, hips |
| neutral | Pants v2 | L | waist, hips |
| neutral | Pants v2 | XL | hips |
| personal-scaled | T-shirt v5.2 | S | chest, waist, hips, shoulders |
| personal-scaled | T-shirt v5.2 | M | hips |
| personal-scaled | T-shirt v5.2 | L | hips |
| personal-scaled | T-shirt v5.2 | XL | hips |
| personal-scaled | Pants v2 | S | waist, hips |
| personal-scaled | Pants v2 | M | waist, hips |
| personal-scaled | Pants v2 | L | none |
| personal-scaled | Pants v2 | XL | none |

## Calibration

`outputs/avatars/measurements.json` does not exist, so the personal body was sized uncalibrated, and its entry in the size report records `"calibration": {"skipped": true, "reason": "outputs/avatars/measurements.json not found"}`. The neutral body is never calibrated. With the file present, `generate_sizes.py` calibrates the personal body first. Only the non-null measurements are calibrated (`chest_cm`, `waist_cm`, `hips_cm`, `inseam_cm`, plus the required `height_cm`), and the report lists them along with the ones not provided.

The calibration code was exercised on synthetic targets on the neutral body: its own measurements with chest +3.0 cm, waist −2.0 cm and hips +1.5 cm, inseam not provided. The fit was least squares on 16 identity coefficients and took 29 evaluations:

| Measurement | Target (cm) | Error before (cm) | Error after (cm) |
| --- | --- | --- | --- |
| chest | 111.7 | −2.99 | 0.00 |
| waist | 90.7 | +1.98 | 0.00 |
| hips | 111.0 | −1.53 | 0.00 |
| height | 172.7 | −0.02 | +0.03 |
| inseam | not provided | — | — |

`circumferences_within_1cm: true`. `test_calibration_matches_circumferences_within_1_cm` covers the same path, with hips and inseam null.

## Gates

### Validator

`validate_garment.py` against each GLB's own avatar (neutral: `mhr-neutral.glb`; personal: the manifest body): all 16 sizes and the 6 base garments pass. It checks attributes, normals, UV range, weight normalisation, joint indices, the skeleton (names, inverse bind matrices, and world × inverse bind = I), a closed shell and rest clearance. Worst values: inverse-bind delta 1.2e-7 and bind-pose drift 2.4e-7 m. Every shell is watertight.

### Penetration at rest and supported poses

`evaluate_sizes.py --skip-layering`: exact collisions (`tools/collision`) against the size's own body, with morph weights from the size's sidecar. Shirts are checked at 14 poses: rest; arms raised 45° and 90°, left, right and both; arms lowered 20° standing and with the walk swing; and the 5 leg poses of `leg-poses.md`. Pants are checked at rest and the leg poses (6).

| GLB | Poses | Vertices > 3 mm | Worst depth (mm) | Worst pose | Result |
| --- | --- | --- | --- | --- | --- |
| `pants-v2-L-neutral.glb` | 6 | 0 | 0.0 | — | PASS |
| `pants-v2-L-personal-scaled.glb` | 6 | 0 | 0.0 | — | PASS |
| `pants-v2-M-neutral.glb` | 6 | 0 | 0.0 | — | PASS |
| `pants-v2-M-personal-scaled.glb` | 6 | 0 | 0.0 | — | PASS |
| `pants-v2-S-neutral.glb` | 6 | 0 | 0.0 | — | PASS |
| `pants-v2-S-personal-scaled.glb` | 6 | 0 | 0.68 | leg_walk | PASS |
| `pants-v2-XL-neutral.glb` | 6 | 0 | 0.0 | — | PASS |
| `pants-v2-XL-personal-scaled.glb` | 6 | 0 | 0.0 | — | PASS |
| `tshirt-v5.2-L-neutral.glb` | 14 | 0 | 0.0 | — | PASS |
| `tshirt-v5.2-L-personal-scaled.glb` | 14 | 0 | 0.47 | leg_step | PASS |
| `tshirt-v5.2-M-neutral.glb` | 14 | 0 | 2.23 | down_20 | PASS |
| `tshirt-v5.2-M-personal-scaled.glb` | 14 | 0 | 2.51 | walk_20 | PASS |
| `tshirt-v5.2-S-neutral.glb` | 14 | 0 | 1.97 | down_20 | PASS |
| `tshirt-v5.2-S-personal-scaled.glb` | 14 | 0 | 0.0 | — | PASS |
| `tshirt-v5.2-XL-neutral.glb` | 14 | 0 | 2.42 | walk_20 | PASS |
| `tshirt-v5.2-XL-personal-scaled.glb` | 14 | 0 | 0.82 | walk_20 | PASS |

### Layering (rest)

Every shirt size over pants v2 and over every pants size of the same body (5 pants × 8 shirts = 40 pairs). Pass means all of: no shirt or pants vertex inside the other's shell (exact parity), no shirt/pants triangle intersections, no shirt vertex of the overlap band under the pants' outer surface (local signed distance), and hem overlap ≥ 3 cm. The gate was run as four parallel workers over disjoint shirt sets, with the same metric and pass rule as `evaluate_sizes.layering`; the results are merged in `outputs/garment-tests/sizes-gates-layering-sprint-3a.json`.

| Shirt | Pants | Hem overlap (cm) | Under pants | Min clearance (mm) | Intersecting tris | Inside shells | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `tshirt-v5.2-L-neutral` | `pants-basic-v2-mhr-neutral` | 11.7 | 0 | 6.14 | 0 | 0 | PASS |
| `tshirt-v5.2-L-neutral` | `pants-v2-L-neutral` | 11.8 | 0 | 12.0 | 0 | 0 | PASS |
| `tshirt-v5.2-L-neutral` | `pants-v2-M-neutral` | 11.8 | 0 | 2.32 | 0 | 0 | PASS |
| `tshirt-v5.2-L-neutral` | `pants-v2-S-neutral` | 11.8 | 0 | 15.25 | 0 | 0 | PASS |
| `tshirt-v5.2-L-neutral` | `pants-v2-XL-neutral` | 11.7 | 0 | 2.88 | 0 | 0 | PASS |
| `tshirt-v5.2-L-personal-scaled` | `pants-basic-v2-rest-identity-scale-floor` | 11.2 | 0 | 20.39 | 0 | 0 | PASS |
| `tshirt-v5.2-L-personal-scaled` | `pants-v2-L-personal-scaled` | 10.7 | 0 | 16.62 | 0 | 0 | PASS |
| `tshirt-v5.2-L-personal-scaled` | `pants-v2-M-personal-scaled` | 10.9 | 0 | 19.81 | 0 | 0 | PASS |
| `tshirt-v5.2-L-personal-scaled` | `pants-v2-S-personal-scaled` | 10.9 | 0 | 22.43 | 0 | 0 | PASS |
| `tshirt-v5.2-L-personal-scaled` | `pants-v2-XL-personal-scaled` | 10.7 | 0 | 2.92 | 0 | 0 | PASS |
| `tshirt-v5.2-M-neutral` | `pants-basic-v2-mhr-neutral` | 9.2 | 0 | 13.64 | 0 | 0 | PASS |
| `tshirt-v5.2-M-neutral` | `pants-v2-L-neutral` | 9.2 | 0 | 13.04 | 0 | 0 | PASS |
| `tshirt-v5.2-M-neutral` | `pants-v2-M-neutral` | 9.3 | 0 | 4.01 | 0 | 0 | PASS |
| `tshirt-v5.2-M-neutral` | `pants-v2-S-neutral` | 9.2 | 0 | 15.27 | 0 | 0 | PASS |
| `tshirt-v5.2-M-neutral` | `pants-v2-XL-neutral` | 9.1 | 0 | 2.35 | 0 | 0 | PASS |
| `tshirt-v5.2-M-personal-scaled` | `pants-basic-v2-rest-identity-scale-floor` | 8.7 | 0 | 22.38 | 0 | 0 | PASS |
| `tshirt-v5.2-M-personal-scaled` | `pants-v2-L-personal-scaled` | 8.2 | 0 | 18.81 | 0 | 0 | PASS |
| `tshirt-v5.2-M-personal-scaled` | `pants-v2-M-personal-scaled` | 8.4 | 0 | 21.47 | 0 | 0 | PASS |
| `tshirt-v5.2-M-personal-scaled` | `pants-v2-S-personal-scaled` | 8.4 | 0 | 22.96 | 0 | 0 | PASS |
| `tshirt-v5.2-M-personal-scaled` | `pants-v2-XL-personal-scaled` | 8.2 | 0 | 2.97 | 0 | 0 | PASS |
| `tshirt-v5.2-S-neutral` | `pants-basic-v2-mhr-neutral` | 6.6 | 0 | 4.92 | 0 | 0 | PASS |
| `tshirt-v5.2-S-neutral` | `pants-v2-L-neutral` | 6.7 | 0 | 14.93 | 0 | 0 | PASS |
| `tshirt-v5.2-S-neutral` | `pants-v2-M-neutral` | 6.7 | 0 | 2.95 | 0 | 0 | PASS |
| `tshirt-v5.2-S-neutral` | `pants-v2-S-neutral` | 6.7 | 0 | 15.22 | 0 | 0 | PASS |
| `tshirt-v5.2-S-neutral` | `pants-v2-XL-neutral` | 6.5 | 0 | 2.29 | 0 | 0 | PASS |
| `tshirt-v5.2-S-personal-scaled` | `pants-basic-v2-rest-identity-scale-floor` | 6.2 | 0 | 24.88 | 0 | 0 | PASS |
| `tshirt-v5.2-S-personal-scaled` | `pants-v2-L-personal-scaled` | 5.7 | 0 | 21.68 | 0 | 0 | PASS |
| `tshirt-v5.2-S-personal-scaled` | `pants-v2-M-personal-scaled` | 5.9 | 0 | 24.63 | 0 | 0 | PASS |
| `tshirt-v5.2-S-personal-scaled` | `pants-v2-S-personal-scaled` | 5.9 | 0 | 24.82 | 0 | 0 | PASS |
| `tshirt-v5.2-S-personal-scaled` | `pants-v2-XL-personal-scaled` | 5.7 | 0 | 2.78 | 0 | 0 | PASS |
| `tshirt-v5.2-XL-neutral` | `pants-basic-v2-mhr-neutral` | 14.2 | 0 | 13.41 | 0 | 0 | PASS |
| `tshirt-v5.2-XL-neutral` | `pants-v2-L-neutral` | 14.3 | 0 | 11.3 | 0 | 0 | PASS |
| `tshirt-v5.2-XL-neutral` | `pants-v2-M-neutral` | 14.3 | 0 | 0.63 | 0 | 0 | PASS |
| `tshirt-v5.2-XL-neutral` | `pants-v2-S-neutral` | 14.3 | 0 | 15.28 | 0 | 0 | PASS |
| `tshirt-v5.2-XL-neutral` | `pants-v2-XL-neutral` | 14.1 | 0 | 2.87 | 0 | 0 | PASS |
| `tshirt-v5.2-XL-personal-scaled` | `pants-basic-v2-rest-identity-scale-floor` | 13.6 | 0 | 18.98 | 0 | 0 | PASS |
| `tshirt-v5.2-XL-personal-scaled` | `pants-v2-L-personal-scaled` | 13.2 | 0 | 14.8 | 0 | 0 | PASS |
| `tshirt-v5.2-XL-personal-scaled` | `pants-v2-M-personal-scaled` | 13.3 | 0 | 19.0 | 0 | 0 | PASS |
| `tshirt-v5.2-XL-personal-scaled` | `pants-v2-S-personal-scaled` | 13.4 | 0 | 22.29 | 0 | 0 | PASS |
| `tshirt-v5.2-XL-personal-scaled` | `pants-v2-XL-personal-scaled` | 13.2 | 0 | 2.89 | 0 | 0 | PASS |

40 of 40 pairs pass.

## Fit-map fixes from the browser check

1. **Layering** (shirt L/S over pants v2: the pants poked out at the hem corners). Each shirt is pushed clear of the outer surfaces of pants v2 and of every pants size of its body, with a 3 mm clearance. The full 40-pair gate then exposed a second bug: the envelope used one k-d tree over all the pants. Pants sizes are nested (S inside XL), so a shirt vertex inside XL but just outside S picked up S's nearest sample, read as clear, and was never pushed. Shirt L neutral over pants XL had 228 vertices under the pants, down to −20.5 mm. The envelope is now the union: each pants mesh is queried on its own, and the smallest signed distance wins.

The union fix cleared the layering but exposed two more problems:
- **The push pleated the cloth.** Each vertex moved along its own nearest pants normal, and just under the waistband rim those normals turn from radial to upward within millimetres. Up to 47 outer triangles per shirt faced inward, and ARAP flipped them in UV: 10–16 UV folds on S/M/L neutral.
- **Lower waistbands over-pushed the shirt.** A lower waistband judged shirt points above its own rim as deep inside it (−85 mm), pushing the shirt up to 89 mm out.

The push is now horizontal, with its magnitude a slope-limited field over angle and height. The cloth tilts by at most 27° and cannot fold, and the push fades out above the band. Each pants mesh also judges only points below its own top. On shirt L neutral this leaves no inward-facing triangles, 5 UV folds (0.9 cm²) and a largest push of 53 mm. The shirts were regenerated with both fixes; the pants were unchanged. One shirt GLB has to clear every pants size, so its hem follows the loosest waistband (XL) and stands off over smaller pants.

   **Known limitation, deferred to Sprint 3.5: a ledge where the push starts.** The final browser check (side corners clean on every size) shows a visible horizontal ledge on both bodies, where the flare clear of the pants begins. Measured on shirt L neutral, as push versus height (median over angle):

   | Height | Push (median) | Push (largest around the body) |
   | --- | --- | --- |
   | 0.952 m (pants top − 1.5 cm) | 37.1 mm | 47.6 mm |
   | 0.972 m | 27.1 mm | 37.6 mm |
   | 0.992 m | 16.3 mm | 27.6 mm |
   | 1.012 m | 7.1 mm | 17.6 mm |
   | 1.032 m | 0.0 mm | 11.2 mm |
   | 1.052 m and above | 0 | 0 |

   The push rises from zero at about 1.04 m (7 cm above the pants top at 0.967 m) at a constant slope of 0.5. The cloth therefore turns by about 27° along one horizontal line, which reads as a ledge in the shading. The fix is a smooth falloff: a smoothstep about 5 cm high, so the push profile has no kink, with the slope limit kept below. It is a few lines in `fit_sizes.push_over`. It was not done in 3A because it means regenerating all 8 shirts and rerunning every gate (poses, 40 layering pairs, UV, validator), about 2 hours, possibly changing the fold list. Sprint 3.5 regenerates every size anyway.
2. **Hard horizontal edge in the S heatmap.** `_EASE_MM = target + (gap − smooth(gap))`. The target is the size's spec ease, continuous in height: the girth band up to the chest, a smoothstep to the shoulder value, and a sleeve-cap blend. The heatmap keeps the mesh's local folds but reads the spec without steps. The largest jump between 1 cm torso slices is checked to be under 8 mm.
3. **S shoulders and sleeves green while the card said tight.** Clamped regions now write the spec-based ease. For every region with `|ease_mm| ≥ 5`, the median `_EASE_MM` of its vertices has the same sign as `ease_mm`.

Two pose fixes were needed for the larger sizes:
- **Arm-down correctives** are solved with the first body clearance among 3, 4, 2, 5 and 6 mm whose screened depth stays within 2.5 mm.
- **Torso vertices more than 6 cm below the axilla carry no upper-arm weight** (smoothstep from 3 to 6 cm, remaining weights renormalised). Before this, personal XL at walk 20° dragged the back panel with the arm.

## UV layout v2

The browser check with Codex's striped texture fixture found two problems:
- a white patch on the pants seat: the crotch gusset's UVs landed on an empty area;
- compressed stripes in the shirt's hem band.

UV layout v2 ([garment-texture.md](../contracts/garment-texture.md)) re-parametrises `tshirt-v5.2` and `pants-v2` per island. Each piece is flattened with ARAP, starting from the previous cylindrical UVs, at a fixed 0.45 UV/m, and placed in a fixed, documented island rectangle. The gusset is its own piece inside the seat island, at the same density. In the browser check after the change, the seat patch was gone, hem density was uniform and the front logo was upright.

The density was lowered from 0.6 to 0.45 UV/m because at 0.6 the left leg of pants XL on the personal body (0.90 m around the thigh) did not fit its 0.48-wide rectangle. That generation failed instead of overlapping.

**Geometry is byte-identical except UVs.** Each regenerated v5.2 / pants-v2 base garment was compared byte for byte with its file from before the UV change:

| GLB | JSON chunk | Bytes differing outside `TEXCOORD_0` | Bytes differing inside `TEXCOORD_0` | Corrective sidecar |
| --- | --- | --- | --- | --- |
| `tshirt-v5.2-mhr-neutral.glb` | identical | 0 | 396,678 | identical |
| `pants-basic-v2-mhr-neutral.glb` | identical | 0 | 514,498 | identical |
| `pants-basic-v2-rest-identity-scale-floor.glb` | identical | 0 | 602,606 | identical |
| `pants-basic-v2-rest-identity.glb` | identical | 0 | 602,778 | identical |
| `tshirt-v5.2-rest-identity-scale-floor.glb` | identical | 0 | 460,308 | identical |
| `tshirt-v5.2-rest-identity.glb` | identical | 0 | 460,364 | identical |

Earlier revisions are unchanged: v1, v2, v4, v5, v5.1 and pants v1 were regenerated from this branch into a scratch folder and are byte-identical to the files on disk (sidecars too, where present).

| Revision | Byte-identical | SHA-256 (first 16) |
| --- | --- | --- |
| `tshirt-mhr-neutral.glb` | yes | `2d8076b8cf988cba` |
| `tshirt-v2-mhr-neutral.glb` | yes | `83d9d9c214227853` |
| `tshirt-v4-mhr-neutral.glb` | yes | `867ba931882b91bf` |
| `tshirt-v5-mhr-neutral.glb` | yes (sidecar too) | `1c09b4944ae6af9c` |
| `tshirt-v5.1-mhr-neutral.glb` | yes (sidecar too) | `d39b0212fe2f73e3` |
| `pants-basic-v1-mhr-neutral.glb` | yes (sidecar too) | `9b9f08f6b52b5e46` |

### UV checks (worst island per file)

| GLB | Bounds | Density outside ±15% | Anisotropy p99 | Overlap, folds excluded | Folded triangles (cm²) | Expected fold failure |
| --- | --- | --- | --- | --- | --- | --- |
| `tshirt-v5.2-mhr-neutral.glb` | STRICT | 0.82% | 1.327 | 0.120% | 6 (0.1) |  |
| `pants-basic-v2-mhr-neutral.glb` | STRICT | 0.94% | 1.313 | 0.006% | 0 (0.0) |  |
| `tshirt-v5.2-rest-identity-scale-floor.glb` | FIT_3A | 0.94% | 1.355 | 0.293% | 0 (0.0) |  |
| `tshirt-v5.2-rest-identity.glb` | FIT_3A | 0.98% | 1.371 | 0.386% | 1 (0.1) |  |
| `pants-basic-v2-rest-identity-scale-floor.glb` | FIT_3A | 1.01% | 1.332 | 0.007% | 0 (0.0) |  |
| `pants-basic-v2-rest-identity.glb` | FIT_3A | 0.99% | 1.327 | 0.005% | 0 (0.0) |  |
| `tshirt-v5.2-L-neutral.glb` | FIT_3A | 0.83% | 1.356 | 0.249% | 5 (0.9) |  |
| `tshirt-v5.2-L-personal-scaled.glb` | FIT_3A | 0.78% | 1.349 | 2.067% | 5 (4.0) | yes |
| `tshirt-v5.2-M-neutral.glb` | FIT_3A | 0.97% | 1.371 | 0.347% | 3 (0.1) |  |
| `tshirt-v5.2-M-personal-scaled.glb` | FIT_3A | 0.95% | 1.392 | 0.595% | 0 (0.0) | yes |
| `tshirt-v5.2-S-neutral.glb` | FIT_3A | 0.99% | 1.395 | 0.498% | 0 (0.0) |  |
| `tshirt-v5.2-S-personal-scaled.glb` | FIT_3A | 1.20% | 1.430 | 0.731% | 1 (0.1) | yes |
| `tshirt-v5.2-XL-neutral.glb` | FIT_3A | 0.60% | 1.308 | 1.856% | 9 (9.1) | yes |
| `tshirt-v5.2-XL-personal-scaled.glb` | FIT_3A | 0.57% | 1.296 | 1.024% | 12 (14.6) | yes |
| `pants-v2-L-neutral.glb` | FIT_3A | 1.21% | 1.362 | 0.002% | 3 (0.0) |  |
| `pants-v2-L-personal-scaled.glb` | FIT_3A | 0.94% | 1.344 | 0.007% | 0 (0.0) |  |
| `pants-v2-M-neutral.glb` | FIT_3A | 0.93% | 1.311 | 0.005% | 0 (0.0) |  |
| `pants-v2-M-personal-scaled.glb` | FIT_3A | 0.84% | 1.309 | 0.014% | 0 (0.0) |  |
| `pants-v2-S-neutral.glb` | FIT_3A | 0.76% | 1.282 | 0.005% | 0 (0.0) |  |
| `pants-v2-S-personal-scaled.glb` | FIT_3A | 0.84% | 1.301 | 0.009% | 0 (0.0) |  |
| `pants-v2-XL-neutral.glb` | FIT_3A | 1.44% | 1.401 | 0.000% | 0 (0.0) |  |
| `pants-v2-XL-personal-scaled.glb` | FIT_3A | 1.04% | 1.376 | 0.000% | 0 (0.0) |  |

**Known limitations** (details in garment-texture.md; Sprint 3.5 fixes both with side, shoulder and outer-leg seams as `tshirt-v5.3` / `pants-v3`):
1. **Back chevron.** Each panel is one tube with a single cut, and a tapered tube flattened at constant density opens into a fan. Lines that are horizontal on the body tilt in UV: 12.4° area-weighted on the torso (p95 31°), 7.1° on the seat, and 10.3° / 6.3° on the legs (neutral). On the shirt back they meet the centre-back seam as a V. Photo projection (4A) is not affected, and tiled fabrics are not on the roadmap. An upright solve with the current seams was tried and not shipped: it moves the error into the texel density (2–16% of triangles outside ±15%).
2. **Folds.** ARAP flips a few long underarm slivers on the larger shirts, and on one fit it folds the back of the shoulder tops over the neckline. Those files fail the overlap and fold bounds and are listed in `test_uv.KNOWN_FOLDS` (the test fails if a listed file passes):

   - `tshirt-v5.2-L-personal-scaled.glb`: underarm slivers flipped (5, 4.0 cm2); torso overlap 2.07% with them excluded (Sprint 3.5)
   - `tshirt-v5.2-M-personal-scaled.glb`: back of the shoulder tops folded over the neckline (about 42 cm2); torso overlap 0.60% (Sprint 3.5)
   - `tshirt-v5.2-S-personal-scaled.glb`: back of the shoulder tops folded over the neckline (about 48 cm2); torso overlap 0.73% (Sprint 3.5)
   - `tshirt-v5.2-XL-neutral.glb`: underarm slivers flipped (9, 9.1 cm2); torso overlap 1.86%, right sleeve 1.15% (Sprint 3.5)
   - `tshirt-v5.2-XL-personal-scaled.glb`: underarm slivers flipped (12, 14.6 cm2, 0.0204% of the torso); torso overlap 0.64%, sleeves 0.88-1.02% (Sprint 3.5)

Personal fits and sizes are checked against the documented FIT_3A envelope (density ≥ 98.5% within ±15%, anisotropy p99 ≤ 1.45). The neutral base garments are held to STRICT (≥ 99%, ≤ 1.35).

## Tests

| Suite | Result |
| --- | --- |
| Garment tests: `test_sizes`, `test_uv`, `test_correctives`, `test_pants`, `test_personal_fit`, `test_garment` | 67 passed. `test_uv` includes the 5 expected fold failures, checked to still fail |
| Reconstruction tests (`services/reconstruction/tests`) | 19 passed |
| Collision tool tests (`tools/collision`) | 3 passed |
| Garment validator (`validate_garment.py`) on all 16 sizes and 6 base garments, against their avatars | 22 of 22 passed: shell watertight, inverse-bind delta ≤ 1.2e-7, bind-pose drift ≤ 2.4e-7 m |
| Earlier revisions byte-identical after regeneration (v1, v2, v4, v5, v5.1, pants v1) | 6 of 6 |

`test_correctives` now expects v5.2's TEXCOORD_0 to differ from v2's, because of UV layout v2. It still checks every other rest attribute byte for byte.

## Running long jobs

The first full size run died without a trace when the agent session switched model. Its two generator processes were children of the session. They used about 2.3 GB each out of 20 GB, so memory was not the cause. Since then:
- long runs are launched detached with `tools/launch_detached.ps1`, and logs go to `outputs/logs/`;
- `generate_sizes.py` writes each size as soon as it is built and skips sizes whose outputs already exist and validate, so a killed run resumes;
- it records each stage with peak memory, plus a faulthandler traceback, in `outputs/garment-tests/sizes-crash.log`.

The runs used for this report peaked at 2.2 GB working set per process.

## Commands

From the repository root (Windows PowerShell; `external/mhr-venv` for generation, `tools/collision/.venv` for the gates):

```powershell
# base garments with UV layout v2 (neutral, then the personal fits)
cd services/garments
..\..\external\mhr-venv\Scripts\python.exe generate_tshirt.py --rules v5.2 --out-dir ../../outputs/garments/experiments
..\..\external\mhr-venv\Scripts\python.exe generate_tshirt.py --rules v5.2 --reconstruction ../../outputs/sam3d-person-front-sprint03-run2/reconstruction.npz --personal-only --out-dir ../../outputs/garments/personal
..\..\external\mhr-venv\Scripts\python.exe generate_pants.py --version v2
..\..\external\mhr-venv\Scripts\python.exe generate_pants.py --version v2 --reconstruction ../../outputs/sam3d-person-front-sprint03-run2/reconstruction.npz --personal-only --out-dir ../../outputs/garments/personal
cd ../..

# sizes, one detached job per body (pants first, then shirts over them); resumable
powershell -NoProfile -ExecutionPolicy Bypass -File tools\launch_detached.ps1 -Name sizes-neutral -Arguments "generate_sizes.py --bodies neutral --report ../../outputs/garment-tests/sizes-sprint-3a-neutral.json"
powershell -NoProfile -ExecutionPolicy Bypass -File tools\launch_detached.ps1 -Name sizes-personal -Arguments "generate_sizes.py --bodies personal-scaled --report ../../outputs/garment-tests/sizes-sprint-3a-personal.json"

# gates (collision environment)
tools\collision\.venv\Scripts\python.exe services/garments/evaluate_sizes.py --skip-layering --out outputs/garment-tests/sizes-gates-poses-sprint-3a.json
tools\collision\.venv\Scripts\python.exe services/garments/evaluate_sizes.py --skip-poses --out outputs/garment-tests/sizes-gates-layering-sprint-3a.json

# tests
cd services/garments
..\..\external\mhr-venv\Scripts\python.exe -m unittest tests.test_sizes tests.test_uv tests.test_correctives tests.test_pants tests.test_personal_fit tests.test_garment
cd ../..
external\mhr-venv\Scripts\python.exe -m unittest discover -s services/reconstruction/tests
cd tools/collision; .venv\Scripts\python.exe -m unittest test_collision
```

For this report, the shirts were regenerated alone after the envelope fix (`--garments tshirt`, reports `sizes-sprint-3a-<body>-shirts.json`), and the pants sizes from the first run were kept. `outputs/garment-tests/sizes-sprint-3a.json` merges the two.

## Carried to Sprint 3.5

- `tshirt-v5.3` / `pants-v3`: side, shoulder and outer-leg seams, like real pattern pieces, with separate front and back panels. This removes the back chevron and the UV folds. STRICT UV bounds then apply to every garment, and `test_uv.KNOWN_FOLDS` is emptied.
- A smooth falloff (about 5 cm) where the layering push starts, which removes the shirt ledge above the waistband.
- Regenerate every size and personal fit once, with all of the above.

## Not tested

- Visual check of the 0.45 UV layout on the sizes with a striped texture. The final browser check covered the shirts' layering (side corners clean on every size; the ledge above is the one cosmetic issue found).
- Calibration against a real `measurements.json` (the file does not exist).
- Personal fits other than the primary body (`personal-identity`, the secondary manifest entry): no sizes were generated for it.
