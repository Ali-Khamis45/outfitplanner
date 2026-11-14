# Contract: garment sizes and fit maps (Sprint 3A)

**Status:** v1. **Producer:** `services/garments` (Python). **Consumer:** the web app. Both sides implement exactly this; any change bumps `version`.

## 1. Files

For each garment, size and body:

```
outputs/garments/sizes/<garment>-<size>-<bodyId>.glb
outputs/garments/sizes/<garment>-<size>-<bodyId>.correctives.json   (corrective-morphs contract, re-solved per size)
outputs/garments/sizes/<garment>-<size>-<bodyId>.fit.json           (§3)
```

- `<garment>`: `tshirt-v5.2` or `pants-v2`.
- `<size>`: `S`, `M`, `L` or `XL`.
- `<bodyId>`: `neutral` (`outputs/avatars/mhr-neutral.glb`), or a personal manifest id such as `personal-scaled`, whose body GLB is listed in `outputs/garments/personal/manifest.json`.

Every GLB is bound to its body's MHR skeleton, as all garments are. Personal sizes are local and git-ignored, like every file under `outputs/`.

## 2. GLB attribute `_EASE_MM`

Every size GLB (shirt and pants) carries, on its mesh primitive, a per-vertex `FLOAT SCALAR` attribute `_EASE_MM` (glTF custom attributes start with `_`). It is the signed ease between the garment and the body at rest, in millimetres, **as the size's spec makes it** (`< 0` = compressed against the body). The mesh itself never penetrates: where the spec is smaller than the body, or where a region is clamped (§3), the geometry is held wider than the spec. The value therefore comes from the spec, not from the drawn gap:

`_EASE_MM = target + (gap − smooth(gap))`

- **`gap`:** the signed distance from the garment's **inner** surface to the body surface. Outer-layer and rim vertices take the value of their inner-layer point.
- **`smooth(gap)`:** `gap` diffused over the garment mesh (30 iterations of neighbour averaging), i.e. its smooth part. `gap − smooth(gap)` keeps the local detail of the mesh (folds, drape, the hem) without its overall level.
- **`target`:** the size's spec ease per vertex, continuous everywhere (no steps between bands):
  - **shirt torso, hem to chest level:** `(C_spec − C_body(y)) / (2π)` at the vertex height `y`, with the body girth `C_body(y)` sampled every 10 mm and smoothed;
  - **shirt torso, chest level to the upper-arm joints:** a smoothstep blend from the chest value to the shoulder value. The shoulder value is the `shoulders` region's spec ease per side, `shoulders.ease_mm / 2`;
  - **sleeves:** the size's spec sleeve ease. It blends into the shoulder value in the sleeve cap (smoothstep from 12 cm to 6 cm from the upper-arm joint), because the cap belongs to the shoulder region;
  - **pants, crotch seam to waistband:** `(C_spec(y) − C_body(y)) / (2π)`, with `C_spec` interpolated from the hip spec to the waistband spec;
  - **pants legs:** no spec band. `target = smooth(gap)`, so the value is the measured gap. The legs blend into the seat band over the 4 cm below the crotch seam.

A heatmap therefore shows the size as specified (for example S shoulders tight), even where the mesh was kept wider for clearance. **Agreement:** for every region of §3 with `|ease_mm| ≥ 5`, the median `_EASE_MM` of the region's vertices has the same sign as the region's `ease_mm` (checked by `services/garments/tests/test_sizes.py`).

## 3. `<…>.fit.json`

```json
{"version": 1, "garment": "tshirt-v5.2", "size": "M", "body": "neutral",
 "regions": {"chest": {"ease_mm": 62, "status": "good"}, "waist": {"ease_mm": 140, "status": "good"},
             "hips": {"ease_mm": 90, "status": "good"}, "shoulders": {"ease_mm": 18, "status": "good"},
             "length": {"delta_mm": -15, "status": "good"}},
 "recommended": true}
```

- **Regions:**
  - shirt: `chest`, `waist`, `hips`, `shoulders`, `length`;
  - pants: `waist`, `hips`, `length`.
- **`ease_mm`** (integer) is pattern ease, `garment − body`:
  - for girths, `C_garment − C_body` (circumference);
  - for `shoulders`, garment shoulder width minus body shoulder width.
- **`length.delta_mm`** (integer) is `hem_target_y − hem_y`. Positive means the garment is longer than the body's target, negative means shorter.
- **`status`** is `tight`, `good` or `loose`, per §5. For `length`, `tight` means too short and `loose` means too long.
- **`clamped`** (optional, only ever `true`) marks a region whose **drawn geometry was held wider than the size spec**:
  - a girth region whose drawn girth exceeds the spec by more than 5 mm (the fitting tolerance), i.e. held at the minimum-ease floor;
  - `shoulders`, when the size's shoulder or sleeve ease was held at the base shirt's size (the sleeves have no region of their own, so their clamp is reported here).

  The region's `ease_mm` and `status` are **always computed from the size spec**, never from the clamped mesh. `shoulders` subtracts the held width (2 × the shoulder hold). An absent field means the mesh follows the spec.
- **`recommended`** is true for exactly one size per garment and body (§6).

## 4. Measurements

All measurements are taken at rest. A **girth** is the perimeter of the 2-D convex hull of the vertices within ±5 mm of a horizontal level: a tape measure on a body. Body girths use body vertices; garment girths use the garment's **outer** surface vertices of the torso panel (shirt) or of the whole pants above the crotch (pants), never sleeves.

| Region | Level (from the body's own rig and mesh) | Body vertices used |
| --- | --- | --- |
| chest | The level of maximum torso girth between 100 mm and 20 mm below the axilla (lowest torso/arm skin-boundary vertex) | torso skin group |
| waist (shirt) | The level of minimum torso girth between 60 mm above the hip joints and 100 mm below the axilla (natural waist) | torso skin group |
| hips | The level of maximum girth between 20 mm above the crotch and 60 mm above the hip joints (seat) | torso and both legs |
| waist (pants) | The pants waistband level, where the pants actually sit | torso and both legs |
| shoulders | Width at the upper-arm joint height (x extent) | torso skin group (body); shirt torso panel (garment) |
| length (shirt) | Hem height; target = hip-joint height − 30 mm (a regular T-shirt hem just below the belt line). Garment length is measured from the upper-arm joint height (the high shoulder point's level on the rig) to the hem | — |
| length (pants) | Hem height; target = ankle-joint height + 40 mm (cropped straight leg) | — |

## 5. Status thresholds

Girth thresholds come from the **Vogue / Butterick / McCall's ease allowances** for fit categories, which those patterns state are "built into the pattern". Values in inches, converted to mm:

| Garment | Fitted | Semi-fitted | Loose fitting | Very loose fitting |
| --- | --- | --- | --- | --- |
| Tops (bust/chest) | 3–4″ | 4⅛–5″ | 5⅛–8″ | > 8″ |
| Pants (hip) | 2–3″ | 3⅛–4″ | 4⅛–6″ | > 6″ |

- **Regular-fit T-shirt:** "good" spans fitted to loose fitting.
- **Straight pants:** the same span on the hip scale.
- **tight:** below "fitted", i.e. under the minimum wearing ease.
- **loose:** "very loose".

| Region | tight | good | loose | Source |
| --- | --- | --- | --- | --- |
| shirt chest | < 76 | 76 – 203 | > 203 | V/B/M tops: fitted (3″) to loose (8″) |
| shirt waist | < 76 | 76 – (203 + D_cw) | > 203 + D_cw | Same tops band. A straight-cut T-shirt has a straight side seam, so the upper limit grows by the body's own chest − waist girth difference `D_cw = max(0, C_chest − C_waist)` |
| shirt hips | < 51 | 51 – (203 + D_ch) | > 203 + D_ch | Lower limit from the V/B/M pants "fitted" minimum (2″): the hem must clear the seat. Upper limit = tops band + `D_ch = max(0, C_chest − C_hips)` |
| shirt shoulders (width) | < 0 | 0 – 40 | > 40 | **Project rule (no published band):** the shoulder seam should sit on the shoulder point or up to 40 mm beyond it; inside it, the sleeve pulls |
| shirt length (delta) | < −40 | −40 – 40 | > 40 | **Project rule:** within ±40 mm (about one size grade, §7) of the target hem |
| pants hips | < 51 | 51 – 152 | > 152 | V/B/M pants: fitted (2″) to loose (6″) |
| pants waist | < 0 | 0 – 50 | > 50 | **Project rule:** a waistband is drafted to the body with a small allowance. The chart gives pants ease at the hip only |
| pants length (delta) | < −40 | −40 – 40 | > 40 | **Project rule** (as for the shirt) |

Values are in mm; bounds belong to "good".

## 6. Recommended size

For each garment and body, take the sizes in order S, M, L, XL. Recommend the **smallest size with no `tight` girth region**. Shirt girth regions are chest, waist and hips; pants girth regions are waist and hips. Shoulders and length are reported but do not decide the size. If every size has a tight girth region, recommend XL. Exactly one size per garment and body has `"recommended": true`.

## 7. Size specifications (grading)

**Body chart: men's body measurements of Simplicity, McCall's, Butterick and Vogue patterns (2023).** For men of average build, about 177 cm. Each letter size spans two numeric sizes; this contract uses the midpoint, in cm:

| Size (numeric) | Chest | Waist | Hip (seat) |
| --- | --- | --- | --- |
| S (34–36) | 87–92 → 89.5 | 71–76 → 73.5 | 89–94 → 91.5 |
| M (38–40) | 97–102 → 99.5 | 81–87 → 84.0 | 99–104 → 101.5 |
| L (42–44) | 107–112 → 109.5 | 92–99 → 95.5 | 109–114 → 111.5 |
| XL (46–48) | 117–122 → 119.5 | 107–112 → 109.5 | 119–124 → 121.5 |

**Garment specifications.** A size is a fixed garment, the same on every body. Each region is graded on its own; there is no uniform scale.

- **T-shirt (regular fit, straight cut):**
  - chest girth = chart chest + **116 mm** (V/B/M semi-fitted midpoint, 4⁹⁄₁₆″);
  - waist and hip girths = the chest girth (straight side seam);
  - sleeve girth grows with half the chest grade (project rule);
  - shoulder width grows with the chest radius grade (project rule);
  - length (high shoulder point to hem): M = the base design's length on the neutral body, ± **25.4 mm per size**. This is the 1″ body-length grade of a standard regular-fit T-shirt (Gildan 5000: body length 28 / 29 / 30 / 31″ for S / M / L / XL).
- **Straight pants:**
  - hip girth = chart hip + **90 mm** (V/B/M pants semi-fitted midpoint, 3⁹⁄₁₆″);
  - waistband girth = chart waist × (base body's girth at the waistband ÷ its natural-waist girth) + **20 mm** (project rule). This transfers the chart's natural waist to the pants' lower waistband line;
  - inseam (crotch seam to hem) is the same for all letter sizes, as for regular-length trousers: the base design's inseam on the neutral body.

**Geometric limits:**

- **Girth floor:** the procedural surface cannot be closer to the body than its minimum ease (6 mm clearance + 2 mm cloth), plus the bulk of the field smoothing and underarm. A spec below that floor is drawn at the floor. `ease_mm`, `status` and the recommendation always use the spec against the body, never the drawn geometry.
- **Pants hem:** the geometric hem never goes below the ankle joint + 10 mm (into the foot). If the spec is longer, `length.delta_mm` reports the excess.
- **Shirt shoulders and sleeves:** the drawn shoulder and sleeve eases never go below the base shirt's (v5.2). Below them, at 20° arm-down, the armhole wedges between the arm and the torso, whose skins are about 4 mm apart, and the cloth penetrates. Smaller sizes therefore keep the base armhole; `shoulders` is `clamped` and reported from the spec.
- **Pants seat:** the drawn hip ease never goes below the base pants' (v2). A tighter seat ends up inside the belly/thigh skin fold at 90° hip flexion. `hips` is `clamped` and reported from the spec.
- **Shirt over pants (layering):** every shirt size is drawn over the outer surface of pants v2 and of every pants size of the same body, all at once. A point counts as clear only when it is outside all of them, and each pants mesh only judges points below its own top edge. Shirt torso vertices up to 20 mm above the highest pants top are pushed **horizontally** (radially) until their inner surface is at least **3 mm** outside. The push magnitude is a field over angle and height, raised to a slope of at most 0.5 around and along the body, so the cloth tilts by at most 27° and never folds. Above the band, the push fades out over push / 0.5 (at most 15 cm). One shirt GLB therefore clears the loosest waistband (XL), and over smaller pants its hem stands off (largest push 53 mm, shirt L neutral over pants XL's seat). Gate, for every shirt × pants pair: no shirt vertex under the pants' outer surface, no shirt/pants interpenetration, and the shirt hem overlaps the waistband by at least 30 mm.
- **Torso arm weights:** shirt torso vertices more than 6 cm below the axilla carry no upper-arm skin weight. Their arm-joint weight share is scaled by a smoothstep from 1 at 3 cm to 0 at 6 cm below the axilla, and the remaining weights are renormalised. Larger sizes on wider bodies otherwise drag the side seam with the arm (personal XL at walk 20°).
- **Arm-down correctives:** each size's arm-down corrective is solved with the first body clearance from 3, 4, 2, 5, 6 mm whose screened penetration stays within 2.5 mm.

On each body the garment is shaped to the body's surface, with these girths and lengths. Where a spec is smaller than the body, the garment is drawn onto the body at the minimum clearance (the pattern deficit is in `_EASE_MM` and `ease_mm`).

## Body measurements (`outputs/avatars/measurements.json`)

The web form writes exactly this schema. The producer reads it to calibrate the personal body before sizing it:

```json
{"version": 1, "units": "cm", "height_cm": 178.0, "chest_cm": 102.0, "waist_cm": 88.0, "hips_cm": 100.0, "inseam_cm": 81.0, "measured_at": "2026-11-13"}
```

- `version` must be 1 and `units` must be `"cm"`. `height_cm` is required.
- Any other measurement may be `null`. Only the measurements present are calibrated, and the calibration report lists which were used and which were not provided.
- Definitions, identical on the form and on the body mesh (`services/garments/measure.py`):
  - **chest:** horizontal, at the fullest part under the armpits;
  - **waist:** the narrowest point (or the navel);
  - **hips:** the fullest part of the buttocks;
  - **inseam:** crotch to floor;
  - **height:** floor to the top of the head.
- **Calibration** (`services/garments/calibrate.py`): least squares on the body's identity (shape) coefficients. Pose and scale parameters are kept. Circumferences must end within 1 cm of the targets; the report gives each measurement's error before and after. If the file is missing, calibration is skipped and the report says so.

## Sources

- Men's body measurements: Simplicity / McCall's / Butterick / Vogue (IG Design Group Americas, 2023), "choose your ideal pattern size", https://simplicity.com/content/downloads/Sizing.pdf
- Ease allowances by fit category (Vogue / Butterick / McCall's), as reproduced at https://jaycotts.co.uk/pages/fit_vogue-butterick-mccall
- Regular-fit T-shirt body-length grade: Gildan 5000 spec sheet, https://www.blankstyle.com/files/specs/20774/SpecSheetMeasurements_5000.pdf
