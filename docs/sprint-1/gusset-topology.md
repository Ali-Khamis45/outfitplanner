# Sprint 1.3 — Underarm gusset: design and topology

The gusset is implemented in [`services/garments/gusset.py`](../../services/garments/gusset.py) and enabled by `--rules v4` (`V4_RULES` = v2 rules + `underarm_panel_radius_m = 0.04`, `underarm_panel_target_stretch = 4.0`). It is off by default: with the v1 and v2 rules the generator still reproduces the Sprint 1.0 and 1.1 GLBs byte-identically (`2d8076b8…`, `83d9d9c2…`).

## Phase 1 findings that shaped the design

All measurements are on the v2 outer surface: 30,493 welded vertices, 60,152 faces.

| Finding | Value |
| --- | --- |
| Body axilla, left / right | (±0.200, 1.303, −0.036) m |
| Armhole seam (torso/sleeve region boundary), left | 277 vertices, y 1.264–1.469 m |
| **Geodesic distance from the armpit corner to the sleeve opening** | **1.7 cm (left), 1.5 cm (right)** |
| Distance to the neck / hem / other sleeve opening | 25 / 42 / 45 cm |
| Skin at the corner (left) | `l_uparm_twist0` 0.33, `l_uparm_twist2` 0.28, `l_clavicle` 0.25, `c_spine2` 0.14 |
| v2 faces stretched above 4× at left +90 | 261 (137 outer, 106 inner, 18 rim), in a front-to-back band at x 0.18–0.23, y 1.26–1.35, z −0.11 to +0.07, **including the sleeve-hem rim** (rim face 121221 at 10.9×) |

**Consequence.** The short sleeve's underside barely exists in the A-pose: the cuff passes through the armpit, where the skin weights switch from torso to arm. The gusset therefore had to be a **sleeve-underseam gusset with its base on the cuff**, not a diamond floating between seams; a disk around the armpit corner larger than about 1.5 cm already reaches the opening.

## Construction (per side; mirrored)

1. **Anchor:** the sleeve-opening vertex nearest the body axilla (left v2 vertex 28318, right 3439).
2. **Removed region:** all outer faces whose three vertices lie within 4 cm geodesic distance of the anchor. On each side it is one connected patch, and its boundary is one loop (Euler 1, a disk). It touches the opening along **one contiguous arc A** and meets the rest of the garment along a **seam path B**.
3. **Seam:** B keeps its original vertices. The panel is stitched by sharing them, with no duplicate, gap or overlap. The panel's orientation is chosen so that it runs every seam edge opposite to the neighbouring garment face.
4. **New cuff edge C:** replaces arc A. A is resampled at 1.5× density and extended along the arm by H·sin(πt), so the underseam gains length. H is derived per side, not tuned:

   | Quantity | Left | Right |
   | --- | --- | --- |
   | Reach r (shoulder joint to anchor) | 15.6 cm | 15.7 cm |
   | Chord c = 2r·sin 45° at a 90° raise | 22.1 cm | 22.2 cm |
   | Required width W = c / (s − 1) for average stretch s = 4 | 7.4 cm | 7.4 cm |
   | **Cuff extension H = W − R** | **3.35 cm** | **3.39 cm** |

5. **Interior:** the boundary B + C is mapped to the unit circle by arc length. A sunflower set of interior points at the surrounding edge length (5.5 mm) is triangulated by Delaunay, and 3D positions are a harmonic (uniform Laplacian) interpolation of the boundary.
6. **Clearance:** the existing clearance rule runs on panel vertices only, with every other vertex fixed. No push was needed: minimum outer clearance 8.0 mm; panel rest clearance 21 mm (left) and 17 mm (right).
7. **Thickness, rims, normals:** these come from the existing `assemble`, so the panel gets the same 2 mm inner layer. The sleeve-opening rims follow the new cuff.
8. **UVs:** each panel has its own 0.016 × 0.016 island in the free atlas strip (u 0.982–0.998; v 0–0.016 left, 0.02–0.036 right). The atlas still spans u ≤ 0.998.
9. **Regions:** new `_REGION` values 3 (`left_gusset`) and 4 (`right_gusset`); the metadata lists five regions.

## Skin weights (panel only; all other vertices keep their v2 weights)

| Panel part | Weights |
| --- | --- |
| Seam B | Unchanged v2 weights (shared vertices). |
| Cuff C | Blend from the weights at its two original endpoints to pure upper-arm weights at its middle, by s(t) = sin(πt). The upper-arm weights are copied from the nearest sleeve vertex whose upper-arm mass exceeds 0.98. |
| Interior | Harmonic interpolation of the 127-joint weight vectors from B and C, then top-4 and normalized. The torso → shoulder → upper-arm transition spreads across the whole panel with no jump at either seam. |

The skeleton is unchanged. Validator results: inverse-bind Δ 1.2e-7 against the neutral avatar, bind drift 2.4e-7 m, weight-sum error 1.4e-7, indices < 127. Left and right are consistent: 325 vs 315 triangles, extension 3.35 vs 3.39 cm.

**Build 1 (kept as evidence, superseded).** The first build gave the cuff pure upper-arm weights all the way to its endpoints. The shared endpoints keep their v2 mix (about 27% `c_spine2`), so the cuff ends had a weight jump, a seam discontinuity the design forbids. That produced tiny triangles stretched to 80.9× at the back cuff end (faces 60021–60022 at (0.196, 1.257, −0.087)). It was corrected by the sin(πt) cuff blend above; this is an implementation fix, not a new experiment. File: `outputs/garments/experiments/tshirt-v4-build1-seam-discontinuity-mhr-neutral.glb` (SHA-256 `2d9cd4b6…`).

## Exact topology change (final v4, SHA-256 `867ba931…`)

| | v2 | v4 | Change |
| --- | --- | --- | --- |
| Outer surface vertices / faces | 30,493 / 60,152 | 30,678 / 60,504 | +185 / +352 |
| Removed faces (left / right) | — | 146 / 142 | v2 outer face IDs recorded in `tshirt-v4-mhr-neutral.json` (`fit_report.gusset.sides.*.removed_faces`) |
| Removed interior vertices (left / right) | — | 71 / 69 | listed per side |
| Replaced cuff vertices (arc A) | — | 21 / 20 | listed per side |
| Seam vertices (B, shared) | — | 25 / 24 | listed per side |
| New vertices (cuff + interior) | — | 165 / 160 | v4 IDs 30353–30517 (left), 30518–30677 (right) |
| New panel faces | — | 325 / 315 | v4 outer face IDs 59864–60503 |
| Panel area vs removed area | — | 28.0 vs 17.2 cm² (left), 26.4 vs 16.8 cm² (right) | +63% / +57% fabric |
| Sleeve opening rim vertices (left / right) | 153 / 158 | 162 /167 | the new cuff edge |
| Final GLB vertices / triangles | 65,522 / 121,980 | 66,018 / 122,720 | |
| Welded shell | watertight, genus 3, 4 openings | watertight, consistently wound, genus 3 (Euler −4), 4 openings | |

## Automated topology test (Gate A)

`GussetTopologyTests` in [`services/garments/tests/test_garment.py`](../../services/garments/tests/test_garment.py) reads the v4 GLB and proves:

1. Regions 3 and 4 are named `left_gusset` and `right_gusset`.
2. Each panel has more than 200 faces in at most three connected pieces (outer layer, inner layer and rim strip).
3. Each panel shares edges with both torso faces and its own sleeve's faces, so it is stitched to both.
4. The shell is still watertight and consistently wound, with Euler −4 and exactly the four named openings.
5. The face count differs from v2.
6. The left and right panels match within 10% in triangle count and within 2 mm in cuff extension.
7. The panel area exceeds the removed area on both sides.

All three gusset tests pass.

## Behaviour when the arms are lowered

The suite starts at the rest A-pose and raises from there. Lowering the arm below rest would compress the panel and the extended cuff toward the torso. This was **not tested**, and with linear blend skinning it would be expected to fold rather than gather.
