# Contract: garment UV layout (texture islands)

**Status:** v1 (UV layout v2 of the garments), Sprint 3A follow-up. **Producer:** `services/garments` (`uv_layout.py`). **Consumers:** the web app (textures, fixtures), Sprint 4A (photo projection onto the islands). Any change bumps the version.

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

## For photo projection (Sprint 4A)

- Project each photo region onto its island's rectangle. Every island has the same metric scale (0.45 UV/m), so a photo can be scaled once per garment, not per island.
- The front of the T-shirt torso is the middle of its island; the centre back is at its left and right edges. Likewise for the pants seat island.
- The rectangles are fixed for every size and body. The content inside them differs in extent (larger sizes fill more of the rectangle), but its position on the body, and its scale, do not.
