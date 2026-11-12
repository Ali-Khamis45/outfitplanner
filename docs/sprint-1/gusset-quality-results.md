# Sprint 1.3 — Gusset quality results

All four garments were measured in one run of [`apps/web/tests/garment-quality.test.mjs`](../../apps/web/tests/garment-quality.test.mjs), on the neutral avatar, with identical pose definitions ([`poses.ts`](../../apps/web/lib/garment/poses.ts)), Three.js skinning and diagnostics ([`diagnostics.ts`](../../apps/web/lib/garment/diagnostics.ts)). Evidence: `outputs/garment-tests/quality-v1-neutral+v2-neutral+v3-close1-neutral+v4-gusset-neutral.json` (Git-ignored).

"Raised N°" means abduction from the rest A-pose: +90° puts the arm about 42° above horizontal, +120° about 72° above.

| Version | File | Vertices / triangles | GLB size |
| --- | --- | --- | --- |
| v1 original | `garments/tshirt-mhr-neutral.glb` | 65,522 / 121,980 | 5.45 MB |
| v2 default | `garments/tshirt-v2-mhr-neutral.glb` | 65,522 / 121,980 | 5.45 MB |
| v3 (Sprint 1.2, closing = 1) | `garments/experiments/tshirt-v3-close1-mhr-neutral.glb` | 65,618 / 122,068 | 5.46 MB |
| **v4 gusset** | `garments/experiments/tshirt-v4-mhr-neutral.glb` | 66,018 / 122,720 | 5.49 MB |

## Edge stretch: p95 / p99 / maximum

| Pose | v1 | v2 | v3 | v4 |
| --- | --- | --- | --- | --- |
| rest | 1 / 1 / 1.000 | 1 / 1 / 1.000 | 1 / 1 / 1.000 | 1 / 1 / 1.000 |
| left +30 | 1.056 / 1.380 / 6.80 | 1.049 / 1.364 / 4.67 | 1.049 / 1.362 / 4.63 | 1.053 / 1.446 / 5.54 |
| left +60 | 1.112 / 1.740 / 12.60 | 1.099 / 1.717 / 8.07 | 1.100 / 1.723 / 8.02 | 1.107 / 1.869 / 10.30 |
| left +90 | 1.158 / 2.043 / 17.57 | 1.148 / 1.980 / 10.94 | 1.148 / 1.980 / 10.87 | 1.159 / 2.221 / 14.46 |
| right +90 | 1.158 / 2.074 / 11.14 | 1.151 / 1.973 / 10.07 | 1.151 / 1.973 / 10.03 | 1.159 / 2.231 / 13.18 |
| **both +90** | 1.384 / 3.025 / **17.57** | 1.371 / 2.705 / **10.94** | 1.372 / 2.664 / **10.87** | 1.422 / 3.568 / **14.46** |
| **both +120** | 1.458 / 3.409 / 21.35 | 1.443 / 3.008 / 13.06 | 1.444 / 2.971 / 12.99 | 1.501 / 4.057 / 17.64 |
| torso twist 21° | 1.151 / 1.249 / 3.23 | 1.160 / 1.272 / 2.06 | 1.160 / 1.274 / 1.99 | 1.161 / 1.274 / 2.06 |
| combined (L45 / R30 / twist 15°) | 1.201 / 1.922 / 9.59 | 1.202 / 1.785 / 6.80 | 1.203 / 1.777 / 6.51 | 1.222 / 2.141 / 7.91 |

## Inversions, collisions and coverage

Each cell shows: flipped / degenerate / self-intersecting pairs above rest / penetrating vertices beyond 3 mm / deepest penetration (m) / armpit side coverage.

| Pose | v1 | v2 | v3 | v4 |
| --- | --- | --- | --- | --- |
| rest | 0 / 0 / 2 / 0 / 0 / 0.072 | 0 / 0 / 0 / 0 / 0 / 0.072 | 0 / 0 / 0 / 0 / 0 / 0.072 | 0 / 0 / 0 / 0 / 0 / 0.072 |
| left +90 | 10 / 0 / 9 / 0 / 0 / 0.109 | 2 / 0 / 3 / 0 / 0 / 0.101 | 2 / 0 / 3 / 0 / 0 / 0.101 | 4 / 0 / 5 / 0 / 0 / 0.123 |
| right +90 | 10 / 0 / 7 / 0 / 0 / 0.123 | 1 / 0 / 2 / 0 / 0 / 0.101 | 1 / 0 / 6 / 0 / 0 / 0.101 | 3 / 0 / 1 / 0 / 0 / 0.123 |
| both +90 | 20 / 0 / 14 / 0 / 0 / 0.159 | 3 / 0 / 5 / 0 / 0 / 0.130 | 3 / 0 / 9 / 0 / 0 / 0.130 | 7 / 0 / 6 / 0 / 0 / 0.174 |
| **both +120** | **123 / 0 / 186** / 0 / 0 / 0.203 | 497 / 0 / 1,888 / 0 / 0 / 0.152 | 497 / 0 / 1,892 / 0 / 0 / 0.152 | **504 / 0 / 1,895** / 0 / 0 / 0.167 |
| torso twist | 23 / 0 / 17 / 0 / 0 / 0.130 | 0 / 0 / 14 / 0 / 0 / 0.130 | 0 / 0 / 12 / 0 / 0 / 0.130 | 0 / 0 / 18 / 0 / 0 / 0.145 |
| combined | 9 / 0 / 5 / 0 / 0 / 0.130 | 1 / 0 / 11 / 0 / 0 / 0.116 | 1 / 0 / 12 / 0 / 0 / 0.116 | 1 / 0 / 17 / 0 / 0 / 0.130 |

Self-intersecting pairs at rest: v1 174, v2 115, v3 129, v4 134. Rest clearance for v4 (validator, approximate): 0 penetrating vertices; minimum 6.0 mm (torso), 8.4 / 9.0 mm (sleeves), 20.9 / 16.9 mm (gussets).

**About the metrics:**

- **Penetration** is approximate: the signed distance to the nearest posed body vertex along its normal.
- **Self-intersection** is exact triangle–triangle intersection on a 1 cm grid, skipping pairs that share a welded vertex.
- **Armpit side coverage** is the fraction of body vertices within 7 cm of either rest axilla for which a 35 cm segment toward the side camera (±X) crosses a garment triangle. It is a new, approximate measure. Rays blocked by the arm itself are *not* counted, so low values do not on their own mean the skin is visible; differences between versions under identical rays are what matter. v4 covers slightly more at both +90 (0.174 vs v2 0.130 and v1 0.159).

## Where v4 fails, and why

- **Stretch (+90).** The worst v4 faces are now **panel triangles at the back end of the new cuff**: faces 60071, 60074 and 120575 at (0.218, 1.25, −0.082), 14.5×, with weights about 82% upper arm and 14–17% `c_spine2`. The panel's two cuff ends must stay attached to the original cuff, which runs through the front and back armpit folds where the *body's own* weights switch from torso to arm. However much fabric the panel adds in the middle, the cuff between each fold and the panel must still span the arm's whole opening. v4's p99 is also worse than v2's (3.57 vs 2.71 at both +90), because the lengthened cuff fans out (visible as flared flaps in the offline renders).
- **Inversions and self-intersection (+120).** For both v2 and v4, every top flip and self-intersection bin is on the **top of the shoulder**: torso y 1.45 m, |x| 0.20 (389 flips, 579 self-intersecting triangles), plus y 1.50 and the sleeve tops. The counts are identical in v2 and v4, so this is shoulder-top compression of the 2 mm shell at a 72°-above-horizontal raise, nowhere near the underarm panel. No underarm construction can move these numbers. v1 shows fewer (123 / 186) because its nearest-vertex weights smear the shoulder top more broadly; it pays for that with fins and 17.6× stretch at +90.

## Gate summary

| Gate | Target | v4 | Status |
| --- | --- | --- | --- |
| A — implementation | Real new underarm panel with verified connectivity | 2 stitched panels, +352 faces, regions 3/4, 3 topology tests pass | **PASS** |
| B — stretch, both +90 | max ≤ 8.785× (−50% vs 17.57×) | 14.46× (−17.7%; worse than v2's 10.94×) | **FAIL** |
| C — extreme, both +120 | ≤ 123 flips, ≤ 186 extra self-intersection pairs | 504 flips, 1,895 pairs (same hotspot as v2, shoulder top) | **FAIL** |
| D — collision | No penetration > 3 mm | 0 in all poses; deepest 0 | **PASS** (approximate diagnostic) |
| E — visual | No fins, gaps, collapse or bunching | Browser extension not connected this session | **NOT TESTED**. Offline renders (not a substitute) show flared cuff flaps under both arms and the same side-view armpit exposure as v2. |
| F — regression | Fit, shell, UVs, binding and features intact | Validator pass; v1/v2 regenerate byte-identically; all tests and the build pass | **PASS** |

**Promotion requires all gates; v4 is NO-GO.**
