# Sprint 1.1 — Garment deformation quality and fitting stabilization

**Date:** 2026-10-31. **Budget:** $0 (local CPU; browser on loopback). Nothing was pushed.

## Summary

| Area | Status |
| --- | --- |
| Baseline preserved (checksums, read-only, v1 reproducible byte-for-byte) | PASS |
| Underarm deformation: fins | PASS: fins gone in the browser at both +90 (front and back) |
| Underarm deformation: numeric gate and side view | **FAIL**: max stretch reduced 30–40% (target 50%); armpit exposed from the side; worse than v1 at +120° |
| Skin weights rebuilt (projection + discontinuity-aware smoothing) | PASS: p99, flips, penetration and degeneracy improved or held in every gated pose |
| Personal floor alignment | PASS: feet at y = 0.000 (was +0.052 m), rigid translation, verified in the browser |
| Surface speckling | PASS: geometric speckle traced to the retarget field and fixed; render speckle traced to shadow acne and fixed (no speckle in 9 browser captures) |
| LOD | PASS: −62% vertices and size, valid skinning; offered via selector; no automatic switching |
| /lab integration (v1 / v2 / LOD selector, compare pose, wireframe, skeleton, colour, personal) | PASS (browser-verified) |
| Rendering performance | NOT TESTED: browser tab throttled |
| Reconstruction pipeline unchanged | PASS |

## 1. Original failure analysis

See [deformation-analysis.md](deformation-analysis.md). The 16–18× stretch and the fins had three causes in `services/garments/tshirt.py`:

- **Topology:** A-pose armpit webbing, where the eased sleeve and torso volumes fused by closing.
- **Weights:** nearest-vertex skin weights that mixed arm (about 67%) and torso influences across that web.
- **Clearance:** per-vertex push-outs that crinkled the neckline (174 self-intersecting pairs at rest; 23 flips under a 21° twist).

Inverse binds, bone frames and the bind pose were verified correct and were not causes.

## 2. Changes made

| Change | Where |
| --- | --- |
| Projection skin weights (exact closest point on body, barycentric), plus smoothing only around projection discontinuities, along the surface and in 3D | `tshirt.transfer_weights`, `closest_body_points`, `closest_point_on_triangles` |
| Smoothed clearance field (neighbours move together; each vertex keeps at least its own push) | `tshirt.enforce_clearance` |
| Smoothed retarget displacement field | `tshirt.retarget` |
| Rigid floor alignment for personal bodies more than 2 mm off the floor | `body.evaluate_rest_body(floor_align=True)` |
| Rule sets, LOD flag, ablations, experiment overrides; **v1 rules regenerate the Sprint 1.0 GLB byte-identically** | `generate_tshirt.py`, `FitRules`, `V2_RULES`, `rules_record` |
| Pose suite (9 poses) and deformation diagnostics module | `apps/web/lib/garment/poses.ts`, `diagnostics.ts` |
| Baseline-relative quality gate | `apps/web/tests/garment-quality.test.mjs` (`npm run test:garment-quality`) |
| Garment version selector (v1, v2, v2-LOD) via a whitelisted fixed route; candidate route removed | `GarmentPanel.tsx`, `types.ts`, `app/api/demo-garment/route.ts` |
| Shadow-acne fix (3.2 m frustum, 2048² map, normal bias) | `LightingRig.tsx` |
| Unit tests for closest point, v1 metadata stability, floor alignment and v2 validation | `services/garments/tests/test_garment.py` |

**Rejected after measurement:** underarm separation, "region" weights and an armpit gusset. All three are kept as options for reproducibility.

**Kept from the parallel Codex session:** independent body/garment wireframe (`lib/garment/inspection.ts` and its test), the corrected binding-test pose names, the compare-pose button and clearer reconstruction-panel copy. Its notes are in [browser-observations.md](browser-observations.md) and [sprint-1.1-visual-qa.md](sprint-1.1-visual-qa.md); the "candidate" parts of those notes are superseded by this report.

## 3. Original vs improved deformation (neutral; full tables in the analysis)

| Pose | p99 | Max stretch | Flipped |
| --- | --- | --- | --- |
| left +90 | 2.04 → 1.98 | 17.6 → 10.9 | 10 → 2 |
| both +90 | 3.03 → 2.71 | 17.6 → 10.9 | 20 → 3 |
| torso twist | 1.25 → 1.27 | 3.2 → 2.1 | 23 → 0 |
| combined | 1.92 → 1.79 | 9.6 → 6.8 | 9 → 1 |
| both +120 (not gated) | 3.41 → 3.01 | 21.3 → 13.1 | **123 → 497** (regression) |

Rest self-intersections dropped from 174 to 115, and penetration beyond 3 mm stayed at 0 in every pose.

## 4. Underarm artifact status

- **Fins:** removed (browser captures 01 vs 02/04).
- **Underarm coverage:** **unresolved.** From the side at both +90 the armpit is exposed (capture 03), stretched streaks remain in the crease, and v2 folds through itself at +120°.
- **Status: FAIL.** The fix needs real underarm material, not better weights; see the recommendation below.

## 5. Personal floor alignment

**Cause:** evaluating SAM's 68 scale parameters at pose 0 shortens the legs, while MHR's root stays where it was, so the lowest vertex sat at +0.0518 m.

**Fix:** a rigid +Y translation of every vertex and every joint position (−0.0518 m), applied before export, so the inverse binds are recomputed from the moved skeleton. Rotations, joint scales and identity parameters are unchanged (unit-tested to 1e-9). The identity-only body (−1 mm) is within the 2 mm tolerance and stays bit-identical to the neutral skeleton.

**Result:** the new private GLB `sam3d-person-front-sprint03-run2-rest-identity-scale-floor.glb` spans y = 0.000–1.715 m, and its retargeted garment binds with inverse-bind Δ 0. In the browser the feet sit on the floor grid. Test poses rotate only the arms and spine, never the root or legs, so switching poses cannot move the feet. Original personal assets are untouched.

## 6. Surface speckling

| Hypothesis | Finding |
| --- | --- |
| Geometric noise from retargeting | **Cause on personal shirts.** On the torso band, normal deviation from the 1-ring was 1.66° mean / 6.17° p99 on v1 personal shirts, vs 0.50° / 1.44° on neutral. The 8-NN displacement field is only C0 across neighbourhood boundaries. Smoothing it (≤ 4.4 mm change) gives **0.59° / 1.76°**. |
| Shadow acne | **Cause of the black speckling in the browser.** The 1024² shadow map over a 6 m frustum gave about 5.9 mm texels with almost no bias. Fixed with about 1.6 mm texels and a normal bias. No speckling in 9 browser captures. |
| Z-fighting / insufficient clearance | Excluded: minimum garment–body clearance is 5.4–6 mm at rest. |
| Flipped normals | Excluded: shells are watertight and consistently wound; unit normals. |
| Precision | Excluded: float32 positions at metre scale. |

The shirt was **not** enlarged to hide any of these.

## 7. LOD and performance

See [garment-optimization.md](garment-optimization.md): 65,522 → 24,578 vertices, 5.45 → 2.06 MB, 158,918 → 81,114 triangles per frame, with comparable skinning. FPS was not measurable (tab throttled).

## 8. Tests executed

| Suite | Result |
| --- | --- |
| Garment Python tests (`unittest discover -s services/garments/tests`) | **10 passed** |
| Reconstruction Python tests | **19 passed** |
| Garment validator: v2 neutral, v2-LOD, v2 personal identity, v2 personal identity+scale+floor | **4 passed**: genus 3, inverse-bind Δ ≤ 1.2e-7, drift ≤ 2.4e-7 m, 0 penetration |
| Body GLB validation (floor-aligned body, official validator) | passed (18,439 vertices, 127 joints) |
| `npm test` (MHR loader, garment binding incl. refusals, wireframe inspection) | **passed** |
| `npm run test:garment-quality` (baseline-relative gate) | **FAILS**: max stretch in 7 of 8 poses for each v2 asset; see the analysis |
| TypeScript / ESLint / production build | **passed** (routes: `/`, `/lab`, `/api/demo-avatar`, `/api/demo-garment`) |
| HTTP: variant whitelist, removed candidate route | passed: exact SHA-256 per variant, unknown → 400, candidate → 404 |
| Browser verification | see [browser-verification.md](browser-verification.md) |
| Baseline integrity | all 22 recorded checksums for reconstruction outputs, avatars, garments and `reconstruct.py` / adapter / validator unchanged; v1 garment regenerated byte-identically |

## 9. Unresolved issues

1. Underarm: exposed armpit in side view at large raises; stretched crease streaks; v2 worse than v1 at +120°.
2. Ragged neckline and cuff edges (extraction cut boundary); worse on the LOD.
3. Faint extraction-grid arcs, visible in garment wireframe.
4. Boxy waist (the hang fill), as you reported; unchanged this sprint.
5. Rendering performance not measured (throttled automation tab).
6. The quality gate's max-stretch target is not met.

## 10. Recommendation for Sprint 1.2

Fix the underarm with **material, not weights**:

1. **Garment authoring pose.** Generate the shirt with the arms raised about 30° above the A-pose (evaluate MHR at that pose; bind with matching inverse binds), so the underarm has slack that compresses on lowering and unfolds on raising.
2. **Explicit underarm panel and seam**, or a pose-space **corrective blend shape** driven by arm abduction, fitted offline to keep clearance.
3. **Clean neckline and cuff edges** by re-meshing the boundary bands (fixed-width rims instead of cut-plane leftovers).

Gate each step with `npm run test:garment-quality` and the same browser comparison. Keep the waist silhouette and any cloth simulation out of scope until the underarm passes.
