# Contract: garment UV layout (texture islands)

**Status:** v3: UV layout v3 (pattern panels, `tshirt-v5.3` / `pants-v3`, the default since Sprint 3.5 was accepted) and UV layout v2 (Sprint 3A, `tshirt-v5.2` / `pants-v2`, kept for one sprint as `?gen=v5.2`). **Producer:** `services/garments` (`uv_layout.py`). **Consumers:** the web app (textures, fixtures), Sprint 4A (photo projection onto the islands). Any change bumps the version.

## Garments covered

UV layout v2 is used by:
- `tshirt-v5.2` (neutral, personal fits, every size);
- `pants-v2` (neutral, personal fits, every size).

Older revisions (T-shirt v1–v5.1, pants v1) keep their original cylindrical UVs and are unchanged.

## Islands

UVs are in glTF convention: `TEXCOORD_0`, origin at the top-left of the image, `v` growing downwards in image space. Values are in [0, 1]. Each island owns a fixed rectangle `[u0, v0] – [u1, v1]`; no UV of the island lies outside it. Its content is centred in the rectangle with at least 0.005 padding.

**T-shirt (`tshirt-v5.2`)**

| Island | Faces (`_REGION`) | Rectangle u0, v0 – u1, v1 | Seams |
| --- | --- | --- | --- |
| `torso` | torso (0) | 0.00, 0.00 – 1.00, 0.58 | Centre back (one vertical seam). Front and back are joined at the sides and over the shoulders. Armholes are interior holes. |
| `sleeve_left` | left sleeve (1) | 0.00, 0.60 – 0.49, 1.00 | Under-arm seam |
| `sleeve_right` | right sleeve (2) | 0.51, 0.60 – 1.00, 1.00 | Under-arm seam |

**Pants (`pants-v2`)**

| Island | Faces (`_REGION`) | Rectangle u0, v0 – u1, v1 | Seams |
| --- | --- | --- | --- |
| `seat` | seat (0), waistband (3), crotch gusset (4) | 0.00, 0.00 – 1.00, 0.36 | Centre back. The crotch gusset is a separate piece placed beside the seat panel inside this rectangle, at the same density. Its borders are existing UV seams. Joining it to the seat would close a loop around the hips, which cannot be flattened without folding. |
| `leg_left` | left leg (1) | 0.00, 0.38 – 0.49, 1.00 | Inseam |
| `leg_right` | right leg (2) | 0.51, 0.38 – 1.00, 1.00 | Inseam |

**Orientation:**
- Within each island, the body's up direction runs along +v of the UV parameter. In the image it therefore runs downwards, because glTF `v` grows downwards; treat the image as flipped vertically when composing. Concretely: higher on the body = larger `v`.
- The outer surface seen from outside is not mirrored.
- The inner layer of the 2 mm shell uses the same UVs as the outer layer, with reversed winding. The rims (cloth edges) take the UV of their outer-edge vertex and are degenerate in UV.

**Texel density** is fixed per garment type: **0.45 UV units per metre** for both garments, on every size and body. A texture of N pixels per UV unit therefore gives 0.45·N pixels per metre of cloth on every island and garment (2048 px → about 9.2 px/cm). The islands are flattened near-isometrically, so the density is the same in both directions and stripes keep their spacing and aspect. Each connected piece is flattened with as-rigid-as-possible (ARAP, 150 iterations), starting from the previous cylindrical UVs. Those UVs are overlap-free; a free LSCM start folds the seat and sleeves over themselves.

**Pieces:** an island can consist of several pieces, cut by the garment's existing UV seams (for example, the pants gusset). They are packed side by side inside the rectangle and never overlap. A few one-to-four-triangle pieces touch a larger piece at a single vertex. Each is attached at that vertex, because a vertex has only one UV.

**Capacity:** the density is set by the widest island, a pants leg, which is flattened around its thigh. The leg rectangle (0.48 UV wide after padding) holds a leg whose flattened width is up to 1.07 m. The largest case so far is pants XL on the personal body, at 0.90 m. A higher density (0.6) did not fit it. A garment that does not fit its rectangles fails to generate, rather than overlapping a neighbour.

## Quality bounds (checked by `services/garments/tests/test_uv.py`)

Per island, over the outer-layer triangles. The outer layer is found from the vertex layout (outer vertices, then an inner copy repeating their UVs, then rims), not from the sign of the UV area, so a flipped outer triangle is seen as folded.

| Check | STRICT: neutral base garments | FIT_3A: personal fits and Sprint 3A sizes |
| --- | --- | --- |
| Density: `sqrt(UV area / 3D area)` within ±15% of the island median | ≥ 99% of triangles | ≥ 98.5% of triangles |
| Anisotropy: 99th percentile of the UV map's singular-value ratio | ≤ 1.35 | ≤ 1.45 |
| Rectangle: UV corners outside the island's rectangle | 0 | 0 |
| Folded (flipped) triangles | ≤ 0.02% and ≤ 20 cm² of cloth | ≤ 0.02% and ≤ 20 cm² of cloth |
| Overlap: island UV area covered twice, folded triangles excluded, rasterised at 2048² | < 0.5% (edge pixels) | < 0.5% (edge pixels) |

The bounds are in `uv_layout.STRICT` and `uv_layout.FIT_3A`. FIT_3A is the measured worst case of the 3A fits, with margin. Sprint 3.5 restores STRICT for every garment. The shirts listed in `test_uv.KNOWN_FOLDS` are expected to fail the fold and overlap rows; see Known limitations. The test fails if a listed file passes, so the list cannot go stale.

**Why not 100% within ±15%:** the remaining triangles (neutral: 0.82% of the T-shirt torso, 0.94% of the right leg, at most 0.5% elsewhere) lie where the cloth curves in two directions: the shoulder caps, the armhole ring and the crotch. Without extra seams these cannot be flattened without some stretch. The seams are fixed, because UV layout v2 changes only UV values (the GLB geometry is byte-identical to the earlier layout). Adding a shoulder seam and a crotch seam would bring every triangle within tolerance, but it splits vertices and changes the geometry; it would come with a new garment revision.

## Known limitations (UV layout v2; fixed by Sprint 3.5)

Both limitations come from the seams. Each panel is a tube with a single cut (centre back, inseam), and UV layout v2 may not add seams. Sprint 3.5 introduces `tshirt-v5.3` and `pants-v3`, with side, shoulder and outer-leg seams like real pattern pieces. Each panel is then nearly developable, and both limitations go away.

1. **Stripes are not upright on tapered panels (back chevron).** A tapered tube (the torso, a leg) flattened at constant texel density opens into a fan, so lines that are horizontal on the body tilt in UV, increasingly towards the cut. On the shirt back, the two edges of the fan meet at the centre back as a V (chevron), and the V coordinate also jumps across the seam. Measured on the neutral base garments as the area-weighted angle between the mapped garment up (world +Y projected onto the cloth) and the v axis. The angle is taken between lines (0–90°), and triangles where the cloth is within 30° of horizontal are excluded:

   | Island | Mean angle | 95th percentile | V jump across its seam |
   | --- | --- | --- | --- |
   | T-shirt torso | 12.4° | 31.4° | up to 4.3 mm |
   | Pants seat | 7.1° | 20.7° | up to 128 mm |
   | Left leg / right leg | 10.3° / 6.3° | 28.3° / 20.0° | up to 53 / 51 mm |

   Sleeves are oriented by world +Y, which on an angled arm makes their stripes run diagonally around the arm. Photo projection (Sprint 4A) is not affected, because it maps onto the islands, not stripes. Tiled fabrics (stripes, checks) are not on the roadmap yet. Making the stripes upright with the current seams is possible, but on tapered panels it moves the error into the horizontal texel density (2–16% of triangles outside ±15%), so it was not shipped.

2. **Folds.** ARAP flips a few long sliver triangles at the underarm of the larger shirts (about 6 × 0.6 cm), and on two fits (S and M on the personal body) it folds the back of the shoulder tops over the neckline. Those areas map the texture twice or squashed. The flipped slivers cover at most 15 cm² of cloth per shirt, inside the armpit; the shoulder-top folds map about 42–48 cm² of cloth twice, at the back neckline. The affected files are listed below, with their measurements.

| File | Where | Folded triangles (cm² of cloth) | Overlap, folds excluded (worst island) |
| --- | --- | --- | --- |
| `tshirt-v5.2-L-personal-scaled.glb` | underarm slivers | 5 (4.0) | 2.067% (torso) |
| `tshirt-v5.2-M-personal-scaled.glb` | back of the shoulder tops over the neckline | 0 (0.0) | 0.595% (torso) |
| `tshirt-v5.2-S-personal-scaled.glb` | back of the shoulder tops over the neckline | 1 (0.1) | 0.731% (torso) |
| `tshirt-v5.2-XL-neutral.glb` | underarm slivers | 9 (9.1) | 1.856% (torso) |
| `tshirt-v5.2-XL-personal-scaled.glb` | underarm slivers | 12 (14.6) | 1.024% (sleeve_left) |

## UV layout v3: pattern panels (`tshirt-v5.3`, `pants-v3`, `pants-v3.1`; the default)

UV layout v3 is used by `tshirt-v5.3`, `pants-v3` and `pants-v3.1` (the default bottom since 2026-11-20: pants-v3 without the knee step; same panels and seams, so a texture painted for the `pants-v3` template fits it): the neutral base garments and every size in `outputs/garments/sizes/`. It is the default generation; layout v2 above stays with `tshirt-v5.2` / `pants-v2` (`outputs/garments/sizes-v5.2/`) for one sprint. A texture is painted in one layout: the web app shows a wardrobe item's texture only on the mesh of its template's generation (`tshirt-v5.3` / `pants-v3` → layout v3; `tshirt-v5.2` / `pants-v2` / `pants-basic-v2` → layout v2) and its colour otherwise. Sprint 4A produces layout v3 textures.

**Panels and seams.** Each garment is cut into the pieces of a real pattern (`services/garments/panels.py`). Seams run along mesh edges, as shortest paths between landmarks found on the garment, each held to its intended line:

- **T-shirt:** front, back, left sleeve, right sleeve.
  - Side seams run from the armpit (the lowest point of the armhole) to the hem's raw edge, along the side.
  - Shoulder seams run from the neckline to the shoulder point (the highest point of the armhole).
  - Armholes separate each sleeve from the torso.
  - Underarm seams run from the armpit to the cuff. A sleeve is a tube, so one cut makes it a flat piece.
- **Pants:** left front, left back, right front, right back, crotch gusset.
  - Centre front and centre back run from the waistband's middle to the gusset.
  - Outseams run from the waistband's side to the hem, along the outer side of the leg.
  - Inseams run from the gusset's side tip to the hem, along the inner side of the leg.
  - The gusset is its base under the crotch. Its front and back tips, above the crease where it turns up into the crotch curve (`gusset_crease_y`, from the cloth's own curvature), belong to the panels they are sewn to.

The garment's shape, triangles, skinning and correctives are those of v5.2 / pants-v2. Only the vertex split pattern (the seams) and the UVs differ. Each GLB vertex carries its panel index in the custom attribute `_PANEL` (`FLOAT`, the index in the panel lists below).

**Islands** (glTF UVs, origin top-left; one island per panel; rectangle u0, v0 – u1, v1):

| T-shirt panel (`_PANEL`) | Rectangle | Pants panel (`_PANEL`) | Rectangle |
| --- | --- | --- | --- |
| `front` (0) | 0.00, 0.00 – 0.49, 0.49 | `left_front` (0) | 0.000, 0.00 – 0.245, 0.48 |
| `back` (1) | 0.51, 0.00 – 1.00, 0.49 | `left_back` (1) | 0.255, 0.00 – 0.500, 0.48 |
| `sleeve_left` (2) | 0.00, 0.51 – 0.49, 1.00 | `right_front` (2) | 0.500, 0.00 – 0.745, 0.48 |
| `sleeve_right` (3) | 0.51, 0.51 – 1.00, 1.00 | `right_back` (3) | 0.755, 0.00 – 1.000, 0.48 |
| | | `gusset` (4) | 0.000, 0.50 – 0.200, 0.70 |

**Flattening.** Each panel is flattened isometrically: an LSCM start, then 150 ARAP iterations, at the fixed 0.45 UV/m, so texel density and stripe spacing are the same everywhere. The outside is not mirrored. The panel is then rotated to its best upright angle, the axial mean of garment up mapped into UV, so garment up runs along +v. Triangles of near-zero area, with an edge shorter than 0.5 mm, get one UV; any local fold left is re-solved in its neighbourhood. The panel is centred in its rectangle; a panel that does not fit stops generation.

**Garment up.** This is world +Y for the torso and pants panels. For sleeves it is the sleeve axis towards the shoulder; world +Y has no direction on the top and underside of a sleeve. For the gusset it is its length, front to back.

**Quality bounds** (`services/garments/tests/test_uv_v3.py`), STRICT on every panel of every v5.3 / pants-v3 / pants-v3.1 GLB:
- density within ±15% of the panel median for at least 99% of triangles;
- anisotropy p99 ≤ 1.35;
- **no folded triangles**;
- overlap < 0.5% (rasterisation edge pixels);
- no UV outside the panel's rectangle;
- median density 0.45 ± 0.03 UV/m.

**Up angle.** The up angle is the area-weighted angle between garment up mapped into UV and the v axis. It is measured as a line angle (0–90°), over the triangles where garment up lies within 60° of the cloth. Each panel's limit is the largest value measured over all candidate GLBs when layout v3 was introduced, plus 0.5° (`UP_ANGLE_LIMIT_DEG` in the test). It is a regression guard, not a target.

UP_ANGLE_TABLE

**Why the angles are not all under 3°.** A real flat pattern piece behaves the same way. On a panel cut flat, the stripes run straight along the grain. Sewn onto a tapered body (the thigh, the chest towards the armholes, the sleeve cap), lines that are horizontal on the body fan out across the piece. Flattened isometrically, the panels reproduce that. Making them upright everywhere would mean stretching the texture, and every stretch that was tried either folded the UVs or broke the density and anisotropy bounds. The 3A back chevron is gone: the back is now one panel at about 2.4°, instead of the two halves of a tube meeting at the centre back with opposite tilts (12.4°).

**Gusset: no up-angle limit.** The gusset lies under the crotch, between the legs. There, world +Y is nearly perpendicular to the cloth or reverses along it, so garment up has no consistent direction on the piece; its grain runs along its length, front to back. Its other bounds (density, anisotropy, folds, rectangle) apply as for every panel.

**For photo projection (Sprint 4A).** The front panel's island holds the whole front of the T-shirt: a front photo projects onto one island, upright, at 0.45 UV/m. The back panel does the same for a back photo. Colour differences between the two photos fall on the side and shoulder seams, where a real garment has its seams too.

## For photo projection (Sprint 4A)

- Project each photo region onto its island's rectangle. Every island has the same metric scale (0.45 UV/m), so a photo can be scaled once per garment, not per island.
- The front of the T-shirt torso is the middle of its island; the centre back is at its left and right edges. Likewise for the pants seat island.
- The rectangles are fixed for every size and body. The content inside them differs in extent (larger sizes fill more of the rectangle), but its position on the body, and its scale, do not.
