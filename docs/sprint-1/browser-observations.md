> **Superseded in part (Sprint 1.1 final):** the experimental "underarm candidate" and `/api/garment-candidate` described here were replaced by the v1 / v2 / v2-LOD selector; see [sprint-1.1-report.md](sprint-1.1-report.md) and [browser-verification.md](browser-verification.md). User observations below remain valid as recorded.

# Garment lab browser observations

The following observations were reported by the user on 2026-10-31. They are visual checks, separate from automated geometry and skinning tests.

| Check | Status | User observation |
| --- | --- | --- |
| Neutral avatar visibility | PASS | Full body visible. |
| Neutral avatar floor contact | PASS | Feet appeared grounded. |
| T-shirt placement and arm movement | PASS | Shirt appeared on the body and sleeves followed raised arms. |
| Underarm deformation with both arms raised | FAIL | Severe side protrusions / fin-like artifacts remained visible near the armpits. |
| Wireframe toggle | NOT VERIFIED | User did not verify it. |
| Personal body in neutral pose and floor alignment | NOT VERIFIED | Personal GLB was not loaded during this check. |
| Browser-side reconstruction | NOT AVAILABLE | The panel says reconstruction is CLI-only; the personal avatar must be selected through Avatar → Personal using a local GLB. |

No claim about a revised garment's visual quality follows from these observations. Repeat the relevant browser checks against the revised asset when one has passed the geometry checks.

In the user's subsequent browser check, body wireframe showed triangle topology, while dense black speckling appeared on the body and faint speckling appeared on the shirt. The shirt's wireframe behavior was unclear, its waist looked boxy, and whether the loaded body was the personal rest shape remained uncertain. Neutral and personal identity must not be inferred from appearance alone. Follow-up changes and their unverified visual status are recorded in [sprint-1.1-visual-qa.md](sprint-1.1-visual-qa.md).

## Follow-up geometry experiments

These are automated Three.js/geometry measurements, not browser observations. The existing demo garment remains in use; none of the experiments below met the acceptance criteria.

| Neutral garment, both arms raised 90° | P99 triangle-edge stretch | Maximum stretch | Flipped triangles | Notes |
| --- | ---: | ---: | ---: | --- |
| Existing demo | 3.025× | 17.571× | 20 | Baseline; user saw severe underarm fins. |
| Existing experimental v2 | 3.204× | 10.946× | 114 | Full quality suite also reports 298 self-intersection pairs above rest; fails gate. |
| Separation-only ablation | 3.406× | 57.884× | 91 | Fails deformation targets. |
| Region-weights-only ablation | 2.953× | 17.727× | 38 | Fails deformation targets. |
| Collapsed upper-arm twist influences, 120 smoothing iterations | 2.215× | 29.344× | 3 | Exploratory asset, not promoted. |
| Three-influence experiment, 360 smoothing iterations | 1.680× | 44.140× | 10 | Exploratory asset, not promoted. |
| Three-influence experiment, 1,200 smoothing iterations | 1.330× | 49.130× | 12 | Full diagnostic reports 3,692 approximate body penetrations beyond 3 mm at both-90. The maximum stretch occurs on a very short edge, but the collision regression alone prevents promotion. |

The experimental assets and detailed diagnostics are local ignored files under `outputs/garments/experiments/` and `outputs/garment-tests/`. The temporary experiment scripts are under ignored `external/`. Reducing stretch alone is insufficient: the shirt must avoid body penetration while preserving sleeve motion, topology, rigging and all target poses. The next engineering step is a proper underarm seam or pose-aware corrective with collision-aware evaluation; it must pass the existing pose suite and then be rechecked visually in the browser.

## Follow-up implementation and tests

The reconstruction panel now explicitly says its photo preview does not create or load an avatar and directs the user to **Avatar → Personal** to select a local GLB. The personal selector explains that a fitted shirt needs the matching rest-pose avatar and garment. The existing file reader still creates an in-browser blob URL; no personal-asset server route or upload was added. This copy change was checked with TypeScript and lint; browser rendering of the change was not tested.

The existing binding test referred to retired `left-arm`/`right-arm` pose names; its assertions now use the existing `left-90`/`right-90` poses. The first `npm test` run failed on the stale names; after that correction the neutral and available personal binding tests passed, including skeleton-mismatch refusals. Six Python garment tests passed. None of these passing tests overrides the separate failed underarm quality gate or establishes visual correctness. Browser automation was unavailable in this session; the user-provided checks above retain their own statuses.
