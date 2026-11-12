# Sprint 1.3 — Explicit underarm gusset

**Date:** 2026-10-31. **Decision: NO-GO.** An actual stitched gusset panel was implemented and verified (Gate A PASS), but it fails the stretch (B) and extreme-pose (C) gates. Visual verification (E) could not run. **v2 remains the default**; v4 is kept as a clearly labelled experiment. Nothing was committed or pushed.

## Phase 0: safety

- **Other agents:** four `codex.exe` and two Codex command-runner processes were present but idle. The last repository write before this sprint was at 10:36 (Sprint 1.2), and file timestamps were re-checked before every shared-file edit; no foreign edits occurred. No process was stopped.
- **Uncommitted work:** Sprint 1.2's changes (route, panel, types, quality test, four docs) were in the working tree and were built on, not reverted.
- **Baseline:** 28 checksums were recorded before any change. Afterwards, all 22 assets and reconstruction scripts among them were unchanged; the 6 garment Python files were edited by design. v3 and the new v4 files are read-only. SAM code, identity parameters and personal outputs were not touched.

## 1. Exact topological changes; 2. connectivity evidence; 3. construction

See [gusset-topology.md](gusset-topology.md).

- **Geometry:** the short sleeve's underside is only 1.5–1.7 cm long, so the gusset was built as a **sleeve-underseam kite with its base on the cuff**.
- **Removed:** per side, a 4 cm geodesic disk (146 / 142 faces) touching the sleeve opening along one arc.
- **Inserted:** a Delaunay-triangulated panel (325 / 315 triangles) stitched to the shared seam vertices. Its new cuff is extended by **H = 3.35 / 3.39 cm, derived from the shoulder reach** for a design average stretch of 4×. The panel adds 63% / 57% more area than it replaces.
- **Result:** the shell stays watertight, genus 3, with four openings. Three automated tests prove the panels exist, are stitched to both torso and sleeve, and are left/right consistent.

## 4. Skin-weight changes

Only the panel's vertices are new; every other vertex keeps its v2 weights. The seam keeps v2 weights, the cuff blends from its endpoint weights to pure upper-arm weights (sin(πt)), and the interior is a harmonic blend over 127 joints. The skeleton is unchanged (inverse-bind Δ 1.2e-7, drift 2.4e-7 m).

The first build gave the cuff ends pure arm weights, a seam discontinuity that produced 80.9× triangles. It was corrected to the stated design and both builds are kept.

## 5–7. Quality, collision and the +90 / +120 results (four versions, identical methods)

Full tables: [gusset-quality-results.md](gusset-quality-results.md).

| Both arms | v1 | v2 (default) | v3 | v4 gusset |
| --- | --- | --- | --- | --- |
| +90 max stretch (target ≤ 8.785) | 17.57 | 10.94 | 10.87 | **14.46** |
| +90 p99 stretch | 3.03 | 2.71 | 2.66 | 3.57 |
| +90 flips | 20 | 3 | 3 | 7 |
| +120 flips (target ≤ 123) | 123 | 497 | 497 | **504** |
| +120 extra self-intersection pairs (target ≤ 186) | 186 | 1,888 | 1,892 | **1,895** |
| Penetration > 3 mm, all poses | 0 | 0 | 0 | 0 |

**Why it fails:**

- **+90° stretch** now concentrates where the panel's cuff ends meet the original cuff at the front and back armpit folds. The body's own skin weights switch from torso to arm there, so the remaining cuff still has to span the arm's whole opening.
- **+120° flips and self-intersections** are entirely **shoulder-top compression** (y 1.45–1.50 m, |x| 0.15–0.20 m), identical in v2 and v4. They are unrelated to the underarm.

## 8. Visual verification

**NOT TESTED.** The Claude in Chrome extension reported "not connected" this session, so no browser rendering was observed for v4.

Offline CPU renders (`outputs/garment-tests/renders13/`, supplementary only) show:

- **flared cuff flaps** under both arms at both +90;
- the **same side-view armpit exposure** as v2.

v4 is in the lab selector as "Experimental v4 · underarm gusset (failed gates)" for your own inspection. To compare at the same pose: open `/lab`, show the garment, switch between *Improved v2* and *Experimental v4*, and use **Compare: raise both arms** with the front, left and back presets.

## Phase 7: neckline and cuffs

**Not changed.** The ragged neckline and the original cuff edges are a separate cleanup task. The gusset replaces only the underarm part of each cuff.

## 9. Tests

| Suite | Result |
| --- | --- |
| Garment Python tests (13, including 3 new gusset topology tests) | **PASS** |
| Reconstruction Python tests (19) | **PASS** |
| Validator, v4 vs neutral avatar | **PASS**: genus 3, inverse-bind Δ 1.2e-7, weight-sum error 1.4e-7, normals 6e-8, UV ≤ 0.998, 0 rest penetration |
| v1 / v2 regeneration after refactor | **byte-identical** (`2d8076b8…`, `83d9d9c2…`) |
| `npm test` (loader, binding incl. refusals, inspection) | **PASS** |
| `npm run test:garment-quality` | **FAILS** (as expected): v4 fails B and C; v2/v3 failures unchanged |
| TypeScript, ESLint (after a `prefer-const` fix in the new diagnostic), production build | **PASS** |
| HTTP whitelist: v1–v4 return their exact files; `v5` returns 400 | **PASS** |
| Baseline checksums (22 assets and reconstruction scripts) | **unchanged** |

## 10. Decision and recommendation

**NO-GO.** Keep v2 as the default. v4 and its first build are preserved in `outputs/garments/experiments/` (read-only) and selectable as experimental.

**Recommendation.** Investigate **pose-aware correctives first**, then **pattern-based construction**, not further rest-pose geometry:

- **Gate C** fails at the **shoulder top**, which no underarm geometry changes; v1, v2, v3 and v4 differ only through their weights. Compression at a 72°-above-horizontal raise is a pose-dependent problem. Corrective blend shapes driven by shoulder abduction, or a volume-preserving skinning model evaluated offline, are the direct tools.
- **Gate B** fails because the cuff runs through the armpit-fold skin transition. A **pattern-based sleeve** (proper sleeve cap, a longer underseam so the cuff lies beyond the transition, a real side seam) moves the problem out of the transition. A rest-pose panel can only redistribute it.

Both must be evaluated with this same suite and with real browser checks before any promotion.
