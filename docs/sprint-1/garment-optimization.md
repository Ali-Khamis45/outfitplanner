# Sprint 1.1 — Garment LOD and performance

## Approach

The low-detail variant is the **same procedural garment at a coarser extraction grid** (10 mm voxels instead of 6 mm), generated with the same v2 rules: `generate_tshirt.py --rules v2 --lod`. No decimation library is installed, and none was added to the verified environment. Regenerating also keeps everything a decimator would have to preserve by hand: openings, skinning, UVs, rims, and the shared skeleton and inverse binds.

## Comparison (neutral body)

| Measure | v2 (6 mm) | v2-LOD (10 mm) | Change |
| --- | --- | --- | --- |
| Vertices | 65,522 | 24,578 | −62% |
| Triangles | 121,980 | 44,176 | −64% |
| GLB size | 5.45 MB | 2.06 MB | −62% |
| Node `GLTFLoader.parse` | 7.4 ms | 4.7 ms | −36% (one run each) |
| Browser download from `127.0.0.1` (resource timing) | 35 ms | 16 ms | one load each |
| Triangles rendered per frame in `/lab` (body + garment + helpers) | 158,918 | 81,114 | −49% |
| Draw calls | 4 | 4 | — |
| Shell | watertight, genus 3 | watertight, genus 3 | — |
| Inverse-bind Δ vs avatar / bind drift | 1.2e-7 / 2.4e-7 m | 1.2e-7 / 2.0e-7 m | — |
| Rest penetration / min clearance | 0 / 6.0 mm | 0 / 6.0 mm | — |
| Rest self-intersecting pairs | 115 | 88 | — |
| Clearance push (max) | 1.6 cm | 3.7 cm | coarser surface needs larger local corrections |

## Skinning behaviour (same pose suite as v2)

| Pose | v2 p99 / max / flips | LOD p99 / max / flips |
| --- | --- | --- |
| left +90 | 1.98 / 10.9 / 2 | 2.01 / 7.6 / 3 |
| right +90 | 1.97 / 10.1 / 1 | 2.01 / 12.3 / 0 |
| both +90 | 2.71 / 10.9 / 3 | 2.89 / 12.3 / 3 |
| both +120 | 3.01 / 13.1 / 497 | 3.22 / 14.7 / 118 |
| torso twist | 1.27 / 2.06 / 0 | 1.26 / 1.66 / 0 |
| combined | 1.79 / 6.80 / 1 | 1.79 / 5.30 / 1 |

Deformation quality is comparable: p99 is within about 0.2 and maximum stretch varies by pose in both directions. Like v2, the LOD fails the strict max-stretch gate.

**Visual check:** in the browser at both +90 (capture `07-v2lod-both90-front.png`) the LOD keeps the silhouette, sleeves and neckline. It shows no fins, but its collar is rougher than v2's, with small gaps along the neckline edge.

## Rendering performance

**NOT TESTED.** In the automated Chrome tab, `requestAnimationFrame` delivered only 3 callbacks in 2 s even for an empty loop with the page focused, and the lab's FPS counter read 1 for both variants. The browser was throttling that tab, so FPS cannot be attributed to the garment. The only valid measures are geometry and frame-content counts: −62% vertices and −49% triangles per frame.

## Decision

The LOD is valid and measurably smaller, so it is offered as an explicit **version selector** option ("Improved T-shirt (v2, low detail)"). **No automatic distance-based LOD switching was implemented.** The lab shows a single avatar at close range, there is no measured frame-time problem to solve, and automatic switching would add runtime complexity without evidence of benefit.
