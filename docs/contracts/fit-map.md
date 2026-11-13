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

The shirt mesh's primitive carries a per-vertex `FLOAT SCALAR` attribute `_EASE_MM` (glTF custom attributes start with `_`). It is the signed gap between the garment and the body at rest, in millimetres, as the size's pattern makes it:

- **Measured gap** (`> 0`): where the garment hangs free. This is the signed distance from the garment's **inner** surface to the body surface. Outer-layer and rim vertices take the value of their inner-layer point.
- **Pattern deficit** (`< 0` = compressed against the body): where the size's pattern circumference at the vertex's height is smaller than the body's. The value is `(C_garment − C_body) / (2π)` at that height. The fabric is then drawn onto the body: the mesh sits at the minimum clearance and never penetrates. This applies to torso vertices of the shirt (chest to hem) and to the seat and waistband of the pants. Sleeves and leg tubes always use the measured gap.

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
| length (shirt) | Hem height; target = hip-joint height − 30 mm (a regular T-shirt hem just below the belt line) | — |
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

On each body the garment is shaped to the body's surface, with these girths and lengths. Where a spec is smaller than the body, the garment is drawn onto the body at the minimum clearance (the pattern deficit is in `_EASE_MM` and `ease_mm`).

## Sources

- Men's body measurements: Simplicity / McCall's / Butterick / Vogue (IG Design Group Americas, 2023), "choose your ideal pattern size", https://simplicity.com/content/downloads/Sizing.pdf
- Ease allowances by fit category (Vogue / Butterick / McCall's), as reproduced at https://jaycotts.co.uk/pages/fit_vogue-butterick-mccall
- Regular-fit T-shirt body-length grade: Gildan 5000 spec sheet, https://www.blankstyle.com/files/specs/20774/SpecSheetMeasurements_5000.pdf
