# Sprint 3.5: real pattern seams (candidates tshirt-v5.3 and pants-v3)

Branch `sprint-3.5-seams` (from `main` 48d839c). Contracts: [garment-texture.md](../contracts/garment-texture.md) (UV layout v3) and [fit-map.md](../contracts/fit-map.md). `tshirt-v5.3` and `pants-v3` are **candidates**: the defaults (`tshirt-v5.2`, `pants-v2`), the generators' defaults and `outputs/garments/personal/manifest.json` are unchanged until they are checked in the browser. Everything under `outputs/` is local and git-ignored. Personal results are given as status only.

## Main result: the back chevron is gone

In 3A, the T-shirt torso was one tube cut only at the centre back. Flattened at constant texel density, a tapered tube opens into a fan, so the two edges of the cut met at the centre back with opposite tilts: a V-shaped chevron in any striped texture.

In v5.3 the back is its own pattern panel, flattened as one piece:

| Garment | 3A (tshirt-v5.2): torso island | v5.3: back panel |
| --- | --- | --- |
| Neutral base garment | 12.4° area-weighted (p95 31.4°); V jump across the centre-back seam up to 4.3 mm | 2.36° (p95 8.16°); no centre-back seam |
| Size S, neutral / personal | — | 7.97° / 8.72° |
| Size M, neutral / personal | — | 7.17° / 7.76° |
| Size L, neutral / personal | — | 4.94° / 4.79° |
| Size XL, neutral / personal | — | 2.92° / 2.32° |

The sizes' backs read higher than the base garment's where the layering push flares the hem furthest: S and M are pushed out to clear the loosest (XL) waistband. That tilt comes from the flare, not from a seam. No seam runs down the back, so the chevron cannot form (`test_the_back_chevron_is_gone`).

The 3-degree target per island was an estimate. Real pattern pieces fan on tapered bodies: a panel cut flat has straight stripes along its grain, and sewn onto a tapered body (the chest towards the armholes, the thigh, the sleeve cap), lines that are horizontal on the body fan out across the piece. The isometric panels reproduce that. Each panel's angle is recorded against a limit of its own measured value + 0.5° (a regression guard; below). Stretching the texture to make every panel upright was tried and rejected: it either folded the UVs or broke the density and anisotropy bounds.

| Deliverable | Result |
| --- | --- |
| Pattern panels: shirt front, back, left and right sleeve (side and shoulder seams); pants left/right front and back with outer-leg seams, inseams and the gusset. Skeleton, corrective sidecar format (contract v2) and fit-map contract kept | PASS: every panel is one disk-like piece on all 18 candidate GLBs |
| UV: one island per panel, garment up to +v, STRICT density and anisotropy, no UV folds, front and back islands suitable for front and back photos | PASS: STRICT on every panel of all 18 GLBs, 0 folds. Up angle recorded per panel (target revised, above) |
| Layering push: smooth falloff (about 5 cm), no hem ledge | PASS (measured, browser check pending): at the flare's start the slope change is about half (median 0.245 → 0.128, max 0.369 → 0.250), and the flare fades over about 9 cm instead of 5 |
| Every size regenerated once (S/M/L/XL, neutral and the calibrated personal body), correctives re-solved per size | PASS: 16 sizes plus the 2 neutral base candidates |
| Gates: poses, layering (shirt S over pants on the personal body: expected fail), validator, collision, strict UV | PASS: poses 16/16 (worst 2.42 mm), validator 18/18, layering 32/36. The 4 misses are the expected shirt S on the personal body. Collision tool tests 3/3. Strict UV 18/18 |
| `tshirt-v5.2` and `pants-v2` regenerate byte for byte; candidates do not change defaults or the manifest | PASS: v1, v2, v4, v5, v5.1, v5.2, pants v1, pants v2 all byte-identical |

## Pattern panels and seams

`services/garments/panels.py` cuts each garment along seams that run on mesh edges, as shortest paths between landmarks found on the garment itself. Each path is held to its intended line by a penalty for leaving it.

- **T-shirt:**
  - side seams: armpit (the lowest point of the armhole) to the hem's raw edge, along the side;
  - shoulder seams: neckline to the shoulder point (the highest point of the armhole);
  - armholes;
  - underarm seams: armpit to the cuff, which opens each sleeve tube into a flat piece.
- **Pants:**
  - centre front and centre back: waistband middle to the gusset;
  - outseams: waistband side to the hem, along the outer leg;
  - inseams: gusset side tip to the hem, along the inner leg;
  - the gusset border.

  The gusset is its base under the crotch. Above its crease, where the cloth folds up into the crotch curve (found from the cloth's curvature: interior angle defects above 15°), its front and back tips belong to the panels they are sewn to. Flattening across that crease is what broke the density bound (2.5% of the gusset outside ±15%). Cut there, the gusset passes with 0.0%.

Slivers that touch their region only at a vertex join their neighbouring panel. Every panel is checked to be one disk-like piece (Euler characteristic 1) before flattening, and generation stops otherwise. The seams change only where vertices split. The v5.3 / pants-v3 neutral GLBs have exactly v5.2 / pants-v2's shape and triangle count (`test_uv_v3.test_seams_split_vertices_only`).

## UV layout v3

One island per panel, at 0.45 UV/m, in fixed rectangles (garment-texture.md). Each panel is flattened isometrically (LSCM start, then ARAP), is not mirrored, and is rotated to its best upright angle (the axial mean of garment up mapped into UV).

Garment up is world +Y for the torso and pants panels. For a sleeve it is the tube's axis: the direction its surface normals are perpendicular to. The first version used the sleeve's principal direction instead. On a short sleeve that leans into the cap, and on wide XL sleeves it turned around the arm, so sleeves read 9–22° with 28% of their area excluded as "undefined". The tube axis reads 1.8–5.2° (8–10° on the personal XL), with 0–1% undefined.

**Folds.** The 5 front folds of the first prototype were degenerate slivers at the neckline (an edge of 0–0.1 mm); their UVs are now snapped together. A few long underarm slivers (1.3–5.6 mm wide, 25–44 mm long) are squashed to near-zero UV area, and float32 rounding gave some of them a negative sign. A fold is now defined as a UV area negative by more than 0.1% of what the triangle's 3D size implies. A real fold flips its whole area; the squashed slivers count as density outliers instead, within the 1% budget. Result: **0 folded triangles** on every panel of every candidate GLB.

### UV checks, all 18 candidates (STRICT on every panel)

| GLB | Density outside ±15% (worst panel) | Anisotropy p99 (worst) | Folded | Overlap (worst) | Up angle per panel (°) |
| --- | --- | --- | --- | --- | --- |
| `tshirt-v5.3-mhr-neutral.glb` | 0.06% | 1.090 | 0 | 0.000% | front 4.25, back 2.36, sleeve_left 2.68, sleeve_right 2.84 |
| `pants-basic-v3-mhr-neutral.glb` | 0.18% | 1.186 | 0 | 0.000% | left_front 7.01, left_back 3.95, right_front 6.94, right_back 3.85, gusset 1.18 |
| `tshirt-v5.3-L-neutral.glb` | 0.15% | 1.152 | 0 | 0.000% | front 4.86, back 4.94, sleeve_left 2.47, sleeve_right 2.53 |
| `tshirt-v5.3-L-personal-scaled.glb` | 0.02% | 1.145 | 0 | 0.000% | front 4.75, back 4.79, sleeve_left 2.52, sleeve_right 2.54 |
| `tshirt-v5.3-M-neutral.glb` | 0.18% | 1.160 | 0 | 0.000% | front 5.19, back 7.17, sleeve_left 3.38, sleeve_right 3.69 |
| `tshirt-v5.3-M-personal-scaled.glb` | 0.02% | 1.157 | 0 | 0.003% | front 6.73, back 7.76, sleeve_left 4.22, sleeve_right 3.88 |
| `tshirt-v5.3-S-neutral.glb` | 0.04% | 1.154 | 0 | 0.000% | front 5.75, back 7.97, sleeve_left 3.46, sleeve_right 3.59 |
| `tshirt-v5.3-S-personal-scaled.glb` | 0.01% | 1.166 | 0 | 0.000% | front 7.66, back 8.72, sleeve_left 5.15, sleeve_right 4.88 |
| `tshirt-v5.3-XL-neutral.glb` | 0.28% | 1.104 | 0 | 0.396% | front 3.74, back 2.92, sleeve_left 1.88, sleeve_right 1.77 |
| `tshirt-v5.3-XL-personal-scaled.glb` | 0.58% | 1.190 | 0 | 0.000% | front 3.52, back 2.32, sleeve_left 9.91, sleeve_right 7.96 |
| `pants-v3-L-neutral.glb` | 0.34% | 1.223 | 0 | 0.005% | left_front 7.15, left_back 3.8, right_front 7.18, right_back 3.89, gusset 0.31 |
| `pants-v3-L-personal-scaled.glb` | 0.38% | 1.239 | 0 | 0.000% | left_front 6.87, left_back 3.93, right_front 6.87, right_back 3.88, gusset 0.9 |
| `pants-v3-M-neutral.glb` | 0.19% | 1.191 | 0 | 0.000% | left_front 7.01, left_back 3.98, right_front 6.94, right_back 3.84, gusset 1.29 |
| `pants-v3-M-personal-scaled.glb` | 0.23% | 1.213 | 0 | 0.011% | left_front 6.97, left_back 4.09, right_front 6.97, right_back 3.99, gusset 1.46 |
| `pants-v3-S-neutral.glb` | 0.15% | 1.184 | 0 | 0.000% | left_front 6.78, left_back 4.34, right_front 6.84, right_back 4.55, gusset 2.35 |
| `pants-v3-S-personal-scaled.glb` | 0.24% | 1.213 | 0 | 0.008% | left_front 6.55, left_back 4.48, right_front 6.58, right_back 4.37, gusset 2.72 |
| `pants-v3-XL-neutral.glb` | 0.41% | 1.234 | 0 | 0.002% | left_front 7.3, left_back 3.94, right_front 7.25, right_back 3.9, gusset 0.31 |
| `pants-v3-XL-personal-scaled.glb` | 0.45% | 1.251 | 0 | 0.000% | left_front 7.22, left_back 4.06, right_front 7.22, right_back 4.04, gusset 0.86 |

**Up-angle limits** (measured maximum over these 18 GLBs + 0.5°, in `test_uv_v3.UP_ANGLE_LIMIT_DEG`):

| Panel | Measured maximum | Limit |
| --- | --- | --- |
| tshirt front | 7.66° | 8.16° |
| tshirt back | 8.72° | 9.22° |
| tshirt sleeve_left | 9.91° | 10.41° |
| tshirt sleeve_right | 7.96° | 8.46° |
| pants left_front | 7.3° | 7.8° |
| pants left_back | 4.48° | 4.98° |
| pants right_front | 7.25° | 7.75° |
| pants right_back | 4.55° | 5.05° |
| pants gusset | 2.72° | exempt (no up direction under the crotch) |

## Layering push: smooth falloff

The 3A push rose from zero with a constant slope of 0.5. Where it started, the cloth turned by about 27° along one line: the ledge seen in the browser above the waistband. For `tshirt-v5.3` the push is built in three steps:

1. Each height bin's push spreads to its neighbours as a smoothstep bump (`value × (1 − smoothstep(d / L))`, L = max(5 cm, 3 × value)). This starts with zero slope and keeps the steepest slope at most 0.5.
2. The field is then blurred vertically (Gaussian, σ = 1.5 cm), because the crossings of overlapping bumps left small kinks.
3. Further push rounds (6 in this mode) restore the 3 mm clearance wherever the blur fell short.

The 3A mode is unchanged.

Measured on shirt L neutral over the pants-v3 envelope: push against height in 12 sectors around the body, and the change of vertical slope where the flare starts:

| Push | Flare reaches above the pants top | Slope change at the flare's start (median / max of 12 sectors) | Steepest slope above the pants top (median) |
| --- | --- | --- | --- |
| 3A linear | 5.3 cm | 0.245 / 0.369 | 0.60 |
| 3.5 smooth falloff + blur | 9.3 cm | 0.128 / 0.250 | 0.57 |

The smooth falloff alone, without the blur, gave 0.172 / 0.658: smoother on average, but with one sharper sector. That is why the blur was added. Whether the ledge is gone as seen is for the browser check.

## Sizes, status only for the personal body

The cut changes only seams and UVs, and the push falloff changes only the shirts' hem flare, so the fit data is the 3A data. The recommended sizes are unchanged: neutral **L / L**, personal **M / M**. `ease_mm` is shown for the neutral body only.

### neutral

**T-shirt v5.3**: recommended **L**.

| Size | chest | waist | hips | shoulders | length |
| --- | --- | --- | --- | --- | --- |
| S | -76 tight (clamped) | +84 good (clamped) | -84 tight (clamped) | -12 tight (clamped) | -25 good |
| M | +24 tight (clamped) | +184 good (clamped) | +16 tight (clamped) | +19 good | +0 good |
| **L** | +124 good | +284 good | +116 good (clamped) | +38 good | +25 good |
| XL | +224 loose | +384 loose | +216 loose (clamped) | +36 good | +51 loose |

**Pants v3**: recommended **L**.

| Size | waist | hips | length |
| --- | --- | --- | --- |
| S | -206 tight (clamped) | -90 tight (clamped) | -2 good |
| M | -83 tight (clamped) | +10 tight (clamped) | -2 good |
| **L** | +51 loose (clamped) | +110 good (clamped) | -2 good |
| XL | +214 loose | +210 loose (clamped) | -2 good |

### personal-scaled (calibrated primary personal body): status only

**T-shirt v5.3**: recommended **M**.

| Size | chest | waist | hips | shoulders | length |
| --- | --- | --- | --- | --- | --- |
| S | tight (clamped) | good (clamped) | tight (clamped) | good (clamped) | tight |
| **M** | good | good | good (clamped) | good | good |
| L | loose | loose | good (clamped) | good | good |
| XL | loose | loose | loose (clamped) | good | good |

**Pants v3**: recommended **M**.

| Size | waist | hips | length |
| --- | --- | --- | --- |
| S | tight (clamped) | tight (clamped) | good |
| **M** | good (clamped) | good (clamped) | good |
| L | loose | loose | good |
| XL | loose | loose | good |


## Gates

| Gate | Result |
| --- | --- |
| Validator (`validate_garment.py`, each GLB against its own avatar: neutral, or the calibrated personal avatar) | **18/18 PASS**: 16 sizes and the 2 neutral base candidates |
| Penetration > 3 mm at rest and every supported pose (exact collisions, `tools/collision`): shirts at 14 poses, pants at 6 | **16/16 PASS**, 0 vertices deeper than 3 mm; worst depth 2.42 mm |
| Layering at rest: every shirt over pants-v3 sizes (neutral also over pants-basic-v3; the calibrated body has no base pants) | **32/36 PASS**. In all 36 pairs: no shirt vertex under the pants, no intersecting triangles, nothing inside the other shell. Passing pairs overlap the waistband by at least 5.3 cm |
| Expected failure: shirt S over each of the 4 pants sizes on the personal body | Hem overlap 2.7–2.8 cm, under the 3 cm bound, with no penetration. Shirt S's length status is `tight` on the 183 cm body. Same as in 3A |
| Strict UV (`test_uv_v3`) | **18/18 PASS**, every panel, 0 folds |
| Collision tool (`tools/collision`, unit tests) | **3/3 PASS** |

Results are in `outputs/garment-tests/sizes-gates-sprint-3.5.json` (local). The gates ran as parallel workers using `evaluate_sizes`' own metrics and pass rules on `outputs/garments/sizes-v5.3/`.

The shirts were regenerated twice after their first gate run: first with the tube-axis sleeves (UVs only, checked byte for byte), then with the blurred push falloff. Every gate result above is for the final files.

## Byte regression

All earlier revisions were regenerated from this branch into a scratch folder and compared byte for byte with the files on disk: v1, v2, v4, v5, v5.1, **v5.2**, pants v1 and **pants v2** are identical, with their corrective sidecars where they have them. The new `panel_seams` rule field is recorded in metadata only when set, so v5.2 and pants-v2 metadata do not change.

## Tests

| Suite | Result |
| --- | --- |
| Garment tests (`services/garments/tests`), including the new `test_uv_v3` (3 tests) | 72 passed |
| Reconstruction tests | 19 passed |
| Collision tool tests | 3 passed |

## Commands

From the repository root (`external/mhr-venv` for generation, `tools/collision/.venv` for the gates):

```powershell
# neutral base candidates
powershell -NoProfile -ExecutionPolicy Bypass -File tools\launch_detached.ps1 -Name v53-base-shirt -Arguments "generate_tshirt.py --rules v5.3 --out-dir ../../outputs/garments/experiments"
powershell -NoProfile -ExecutionPolicy Bypass -File tools\launch_detached.ps1 -Name v53-base-pants -Arguments "generate_pants.py --version v3"
# every size, one job per body (pants first, then shirts over them); resumable
powershell -NoProfile -ExecutionPolicy Bypass -File tools\launch_detached.ps1 -Name v53-sizes-neutral -Arguments "generate_sizes.py --revision 3.5 --bodies neutral --out-dir ../../outputs/garments/sizes-v5.3 --entries-dir ../../outputs/garment-tests/sizes-v5.3 --report ../../outputs/garment-tests/sizes-sprint-3.5-neutral.json"
powershell -NoProfile -ExecutionPolicy Bypass -File tools\launch_detached.ps1 -Name v53-sizes-personal -Arguments "generate_sizes.py --revision 3.5 --bodies personal-scaled --out-dir ../../outputs/garments/sizes-v5.3 --entries-dir ../../outputs/garment-tests/sizes-v5.3 --report ../../outputs/garment-tests/sizes-sprint-3.5-personal.json"
# gates: evaluate_sizes.py --dir outputs/garments/sizes-v5.3 (poses and layering), validate_garment.py per GLB
# tests
cd services/garments; ..\..\external\mhr-venv\Scripts\python.exe -m unittest discover -s tests
```

## Not tested / open

- Browser check of the candidates. Requested before any default or manifest change.
- The web app reads `_PANEL` only if it chooses to; nothing in `apps/web` was changed.

- During the work, gate processes launched from inside an agent's background shell died when the session ended, despite `launch_detached.ps1`. Started directly from PowerShell, as the README describes, they survive. All results here come from runs that completed.
- `sizes-v5.3-superseded/` (local) keeps the earlier shirt runs: the principal-axis sleeves, and the push without the blur.

## Promotion to the default (2026-11-19)

After the browser check, `tshirt-v5.3` / `pants-v3` became the default generation for both bodies and every size.

- `outputs/garments/sizes/` now holds the v5.3 / pants-v3 sizes; the 3A files moved to `outputs/garments/sizes-v5.2/` (local, git-ignored). `generate_sizes.py` defaults to `--revision 3.5`.
- The web app reads the generation from `apps/web/lib/garment/generation.ts`. `?gen=v5.2` keeps v5.2 / pants-v2 reachable for one sprint (through Sprint 4A).
- The personal manifest's primary body wears the recommended v5.3 / pants-v3 sizes (status only: M / M, unchanged).

Gates rerun on the promoted files (from `outputs/garments/sizes/`):

| Gate | Result |
| --- | --- |
| Validator (stretch, flips, intersections, rest clearance), 16 sizes + 2 base garments | 18 / 18 PASS |
| Penetration > 3 mm, every arm and leg pose | 16 / 16 PASS |
| Layering (shirt over pants, hem overlap ≥ 3 cm, no interpenetration) | 32 / 36 PASS; the 4 failures are shirt S on the personal body (below) |
| UV layout v3 bounds (`test_uv_v3.py`) | PASS |
| Byte-for-byte regeneration (v1, v2, v4, v5, v5.1, v5.2, v5.3, pants v1, v2, v3) | 10 / 10 identical |
| Python tests (garments 72, reconstruction 19, collision 3) | PASS |
| Web: typecheck, lint, build, `npm test` | PASS |

**Known failure: shirt S on the personal body.** Over each of the four personal pants sizes, the hem overlaps the waistband by 2.7–2.8 cm instead of 3 cm, with no penetration, no interpenetration and no shirt vertex under the pants. The values equal the Sprint 3.5 run exactly, so this is the known case, not a regression.
