# Sprint 1.1 — Underarm deformation analysis

**Result:** the improved T-shirt (v2) removes the visible underarm **fins** and improves every averaged deformation metric up to +90° arm raises. It does **not** meet the provisional maximum-stretch target, keeps a visible underarm opening in side view at large raises, and is **worse than v1 at +120°**. Underarm phase status: **FAIL** (substantial, measured improvement, but not resolved).

Numbers come from [`apps/web/tests/garment-quality.test.mjs`](../../apps/web/tests/garment-quality.test.mjs). That script runs Three.js skinning in Node through the viewer's own [`binding.ts`](../../apps/web/lib/garment/binding.ts), [`poses.ts`](../../apps/web/lib/garment/poses.ts) and [`diagnostics.ts`](../../apps/web/lib/garment/diagnostics.ts) modules. The JSON evidence is in `outputs/garment-tests/` (Git-ignored). Browser evidence is in [browser-verification.md](browser-verification.md).

## Diagnostics

Each pose is measured on the garment's own triangles, plus the avatar's skin as a reference:

| Measure | Definition |
| --- | --- |
| Stretch | Largest posed/rest edge-length ratio per triangle (p95, p99, maximum). |
| Area | Posed/rest area ratio. |
| Flipped | Posed normal opposite the rest normal carried by the triangle's own blended skin matrices (that is, inverted relative to its joints). |
| Degenerate | Area below 0.1% of rest area. |
| Normal deviation | Angle between the posed normal and that predicted normal; more than 60° is counted. |
| Self-intersection | Exact triangle–triangle intersection over a 1 cm grid, skipping pairs that share a welded vertex. Reported as total pairs and pairs above the rest-pose count. |
| Body penetration | Approximate: signed distance of garment vertices to the nearest posed body vertex along its normal; counted beyond 3 mm. |
| Transition band | Triangles mixing torso and upper-arm influence. |
| Worst faces | Face IDs, rest position, vertex IDs and their averaged joint influences. |

## Pose suite

"Raised N°" is abduction about the body's forward axis **from the MHR rest A-pose**, where the upper arm hangs about 48° below horizontal. So +90° puts the arm about 42° above horizontal, and +120° about 72° above. Poses: rest; left +30/+60/+90; right +90; both +90; both +120; torso twist 21° (spine1–3); combined (left +45, right +30, twist 15°). Joint rotations are rigid, with no animation or cloth simulation. The MHR rig has no joint-limit enforcement in the GLB, so +120° is mechanically applicable but anatomically extreme; it is reported and not gated.

## Original failure (Sprint 1.0 garment, neutral body)

| Pose | Stretch p99 / max | Flipped | Self-intersecting pairs above rest | Body skin p99 / max |
| --- | --- | --- | --- | --- |
| left +30 | 1.38 / 6.80 | 0 | 2 | 1.03 / 2.59 |
| left +60 | 1.74 / 12.60 | 4 | 5 | 1.06 / 4.08 |
| left +90 | 2.04 / **17.57** | 10 | 9 | 1.10 / 5.31 |
| both +90 | 3.03 / **17.57** | 20 | 14 | 1.38 / 5.31 |
| both +120 | 3.41 / 21.35 | 123 | 186 | 1.45 / 6.18 |
| torso twist | 1.25 / 3.23 | **23** | 17 | 1.08 / 1.26 |

At rest the garment already has **174 self-intersecting triangle pairs**, 160 of them at the neckline.

**Root causes**, traced to code in [`tshirt.py`](../../services/garments/tshirt.py):

1. **Topology: armpit webbing** (`garment_fields`, `clean_garment_solid`). In the A-pose the eased sleeve and torso volumes overlap below the axilla, and the 2-voxel closing fuses them. The worst faces (for example 59415 and 121223 at (0.207, 1.272, −0.079), just below the measured axilla at (0.200, 1.303, −0.036)) span from sleeve underside to torso side. Their rest edges are 1.8–3.3 mm and grow to 28–32 mm at left +90.
2. **Weights: nearest-vertex transfer across that web** (`transfer_weights`, "nearest" mode). Those faces mix about 67% `l_uparm_twist*`, 21% `l_clavicle` and 8% `c_spine2`. Adjacent vertices get unrelated influence mixes, so one corner follows the arm and the others stay with the torso. In the browser this showed as fins below both armpits (your report; capture `01-v1-both90-front.png`).
3. **Clearance: per-vertex push-outs** (`enforce_clearance`). Up to 1.6 cm pushes on single collar vertices crinkled the neckline. That produced the rest-pose self-intersections and the torso-twist flips at the front neckline (faces 12789 and 54057 at (0.043, 1.418, 0.093)).

Inverse bind matrices, bone frames and the bind pose were checked and are **not** causes: inverse-bind Δ 1.2e-7, bind drift 1.2e-7 m, and the opposite sleeve moves exactly 0 in single-arm poses.

## Experiments (one change at a time, neutral body)

All rows below are measured at left +90; the extra columns give both +90 and torso twist where they matter.

| Variant | What changed | p99 | Max | Flipped | Self pairs (rest) | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| v1 (baseline) | — | 2.04 | 17.6 | 10 | 174 | — |
| `v2-separation-only` | Carve a 1.4 cm gap between sleeve and torso below the axilla | 2.50 | 15.1 (57.9 at right +90) | 50 | 471 | **Rejected.** Thin facing walls crinkle; worse everywhere. |
| `v2-weights-only` ("region") | Torso/arm-restricted transfer with a geodesic armhole blend | 2.11 | 12.4 | 12 | 174 | Rejected: small gain, worse right side (17.7). |
| v2 first attempt | Separation + region weights | 2.57 | 10.9 | 33 | 223 | Rejected: p99 and flips worse. |
| `proj-s0` | Exact closest-point projection weights, smooth clearance | **1.67** | 86.2 | 3 | **115** | Best p99, but projection discontinuities spike. |
| `proj-s2` | + 2 global smoothing passes | 1.71 | 26.6 | 3 | 115 | Smoothing trades p99 for max. |
| `proj-s2-sep` | + separation | 2.10 | 29.6 | 62 | 223 | Rejected (separation harmful again). |
| `proj-dc3` | Projection + smoothing only around projection discontinuities (graph, 4 cm) | 1.97 | 12.2 | 3 | 115 | Good; twist flips 23 → 7. |
| `proj-dc2-r6` | Wider band (6 cm, ratio 2) | 1.93 | 14.8 | 3 | 115 | No better. |
| `proj-dc3-g4` / `g7` | + local armpit gusset closing | 1.97 / 1.97 | 12.2 / 19.8 | 3 / 4 | 115 | **Rejected:** no effect or worse. |
| **`proj-dc3-sp015` → v2** | + 3D Gaussian weight averaging (1.5 cm) inside the band | 1.98 | **10.9** | **2** | **115** | **Adopted.** Twist flips 0, combined flips 1. |
| `proj-dc3-sp025` | 2.5 cm 3D averaging | 2.01 | 11.3 | 2 | 115 | Slightly worse. |

**Topology or weights?** On their own, neither geometric change helped. The underarm separation made things worse, and the gusset had no effect. The improvement comes from **weights**: exact projection onto the skin directly beneath each garment vertex, plus smoothing restricted to where neighbouring vertices project onto different body surfaces. The smoothing works along the surface and in 3D, because across a fold, vertices a few millimetres apart in space can be far apart along the surface. The smoothed clearance field is a separate fix for the neckline.

## Final v2 rules

From [`tshirt.py`](../../services/garments/tshirt.py) `V2_RULES`: projection transfer, no global weight smoothing, discontinuity ratio 3 (radius 4 cm, 30 iterations, 1.5 cm 3D averaging), clearance push-outs diffused over 10 iterations (8 passes), and retarget displacement diffused over 20 iterations. Topology, cuts and UVs are unchanged from v1 (same 65,522 vertices). With the v1 rules, the generator reproduces the Sprint 1.0 GLB **byte-identically** (SHA-256 `2d8076b8…` before and after the refactor).

## Original vs improved, neutral body

| Pose | p99 v1 → v2 | Max v1 → v2 | Flipped v1 → v2 | Self above rest v1 → v2 | Penetration > 3 mm |
| --- | --- | --- | --- | --- | --- |
| rest | 1.00 → 1.00 | 1.00 → 1.00 | 0 → 0 | rest pairs **174 → 115** | 0 → 0 |
| left +30 | 1.38 → 1.36 | 6.80 → 4.67 | 0 → 0 | 2 → 0 | 0 → 0 |
| left +60 | 1.74 → 1.72 | 12.60 → 8.07 | 4 → 1 | 5 → 2 | 0 → 0 |
| left +90 | 2.04 → 1.98 | 17.57 → 10.94 | 10 → 2 | 9 → 3 | 0 → 0 |
| right +90 | 2.07 → 1.97 | 11.14 → 10.07 | 10 → 1 | 7 → 2 | 0 → 0 |
| both +90 | 3.03 → 2.71 | 17.57 → 10.94 | 20 → 3 | 14 → 5 | 0 → 0 |
| both +120 (not gated) | 3.41 → 3.01 | 21.35 → 13.06 | **123 → 497** | **186 → 1,888** | 0 → 0 |
| torso twist | 1.25 → 1.27 | 3.23 → 2.06 | **23 → 0** | 17 → 14 | 0 → 0 |
| combined | 1.92 → 1.79 | 9.59 → 6.80 | 9 → 1 | 5 → 11 | 0 → 0 |

The personal bodies show the same pattern. Identity v1 → v2 at left +90: max 16.8 → 10.1, flips 10 → 1. Identity+scale (floor-aligned) at left +90: max 17.2 → 10.6, flips 9 → 2. Full tables are in `outputs/garment-tests/quality-v1-neutral+…json`.

**Regression at +120°:** the avatar's own skin has 0 flipped triangles there, but v2 has 497 flips and 1,888 self-intersecting pairs, against 123 and 186 for v1. Projection weights make the shirt follow the compressing armpit skin, and its 2 mm double layer folds through itself. v2 should not be used beyond about +90°.

## Provisional targets and gate

The targets are set from the baseline and applied pose by pose against each asset's own v1 counterpart:

- max stretch ≤ 50% of baseline;
- p99 ≤ baseline × 1.02;
- flipped ≤ 25% of baseline;
- self-intersections above rest ≤ baseline;
- 0 penetration beyond 3 mm;
- 0 degenerate triangles.

v2 neutral passes **p99, flips, penetration and degeneracy in all 8 gated poses** and self-intersection in 7 of 8 (combined: 11 vs 5). It **fails max stretch in 7 of 8 poses**: the reduction is 30–40%, against the 50% target. The gate runs as `npm run test:garment-quality`, which exits with an error while it fails. Passing these numbers would not prove visual quality on its own.

## Underarm artifact status

- **Fins:** **resolved** in the browser at both +90 front and back (captures `02`/`04` vs `01`).
- **Underarm coverage:** **not resolved.** From the side at both +90, the underarm cloth pulls away and exposes the armpit, with a crumpled rim (capture `03`, also visible in the offline renders of v1 and v2).
- **Thin streaks:** stretched streaks remain along the underarm band (offline close-up `outputs/garment-tests/renders/dc3-both-90-armpit.png`).
- **Collar edge:** visibly ragged (pre-existing from extraction; unchanged).

Next step, for Sprint 1.2: real underarm material. Either author the garment in a raised-arm rest pose (or with an explicit gusset panel and seam), or add a pose-driven corrective blend shape for arm abduction, evaluated with the same suite plus the browser.
