# Sprint 1.0 — Acceptance criteria and results

**Statuses:**
- **PASS:** verified with the evidence cited.
- **FAIL:** verified not to meet the criterion.
- **BLOCKED:** could not be attempted.
- **NOT TESTED:** not executed.

Browser automation (Claude in Chrome) reported "Browser extension is not connected" twice this sprint, so no rendering or interaction check was executed in a browser.

## Success criterion

> The T-shirt is an actual separate 3D garment, correctly aligned with the neutral MHR avatar, bound to the real skeleton, and demonstrably deforms with controlled character movements.

**Met at the mesh and skinning level (PASS), with documented underarm artifacts in raised-arm poses. Not visually verified in a browser.**

## Matrix

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Real, separate 3D T-shirt mesh (torso, short sleeves, neck opening, hem, front and back) | PASS | A separate `SkinnedMesh` GLB with 65,522 vertices. Exactly four openings (hem, neck, two sleeves); offline renders from front, side and back. |
| 2 | Thickness, normals, UVs | PASS | 2 mm solid shell with closed rims. Watertight, consistently wound, outward, genus 3. Unit normals (6e-8). UVs in [−0.007, 0.971] with seams split. |
| 3 | PBR material, adjustable base colour | PASS (asset) / NOT TESTED (browser) | The GLB has a metallic-roughness material. The viewer's colour picker sets `material.color` without reallocation (code, typecheck, build); not observed in a browser. |
| 4 | Not a duplicate of the body surface | PASS | Hang fill, ease of 1.2–3.5 cm, joint-placed cuts, own topology (60,986 welded vertices vs the body's 18,439). Median clearance 3.3 cm on the torso. |
| 5 | Asset provenance documented | PASS | Procedural from the official MHR model (Apache-2.0) and documented rules; no downloaded or paid assets. See [garment-rigging.md](garment-rigging.md). |
| 6 | 127-joint hierarchy inspected; torso, shoulder and arm joints identified | PASS | Chains and twist-joint parentage in [garment-rigging.md](garment-rigging.md). |
| 7 | Matching bind poses, valid inverse binds | PASS | Inverse-bind Δ vs avatar 1.2e-7 (neutral) and 0 (personal). world × inverse bind = I within 6e-8. Bind drift 2.3e-7 m (Python) and 1.2e-7 m (Three.js after rebinding). |
| 8 | Skin weights: valid indices, normalized | PASS | Indices < 127; sums 1 ± 1.4e-7; 20 influencing joints. |
| 9 | Scale and coordinate systems | PASS | Meters, +Y up, +Z forward. The evaluated neutral body equals `mhr-neutral.glb` within 5.7e-8 m. Garment bounds lie inside the avatar's. |
| 10 | No duplicate or conflicting skeleton transforms | PASS | Rebound by name to the avatar's bones (single skeleton), identity bind matrix, garment bone nodes discarded. Mismatched skeletons refused (identity+scale garment on neutral; neutral garment on the posed SAM GLB). |
| 11 | Garment deforms with movement (rest, left arm, right arm, both raised, torso rotation) | PASS (Three.js math in Node) / NOT TESTED (browser) | Sleeves follow their arm 10–18 cm, the opposite sleeve 0, torso 8.5–8.8 cm under rotation. Asserted in `garment-binding.test.mjs`; renders in `outputs/garment-tests/`. |
| 12 | Neutral fit: torso and shoulders, neck and sleeves aligned, no severe intersections | PASS | 0 penetrating vertices at rest (validator) and in all 5 poses (approximate test). Neckline within 6.7 mm of the neck axis; sleeve ends on planes at 50% of the upper arm. |
| 13 | Consistent garment shape during movement | PASS (single arm, torso rotation) / **FAIL (both arms raised, underarm)** | Edge strain p99 ≤ 1.32 for single-arm and twist poses; both arms raised: p99 2.16, max 16×, visible side fins. |
| 14 | Personal body shape in a correct rest pose, evaluated from parameters | PASS | Official MHR evaluation at pose 0; correctives 0 at rest; upright body; SAM parameters unmodified (NPZ checksum unchanged). |
| 15 | Same T-shirt on personal identity vs neutral identity | PASS | Same topology, UVs and weights, retargeted by displacement (max 3.7 cm). 0 penetration at rest and in all poses. The skeleton is identical to neutral. |
| 16 | Personal identity + SAM proportions (extra) | PASS, with caveat | Own skeleton (Δ 0.082 vs neutral, correctly refused there); 0 penetration. Body not ground-aligned (+5.2 cm). |
| 17 | `/lab` Garment Experiment mode (show, load, visibility, colour, wireframe, skeleton, 360°, presets, reset pose, test poses) | PASS (code, typecheck, lint, build, HTTP) / NOT TESTED (browser) | `/lab` HTML contains the panel and controls; `/api/demo-garment` serves the exact neutral GLB (SHA-256 match). |
| 18 | Existing neutral/personal avatar features intact | PASS (build, HTTP, tests) / NOT TESTED (browser) | Avatar route unchanged; loader test passes; personal avatar picker refactored onto the shared `readLocalGlb` without behaviour change. |
| 19 | Resource handling | PASS (code review) | Colour, wireframe and pose changes allocate nothing per frame. Material disposed on unmount; loader cache untouched; blob URLs revoked and evicted. |
| 20 | Collision and deformation diagnostics | PASS (approximate, labelled) | Per-region penetration, follow error, edge strain and neckline metrics for 3 bodies × 5 poses. |
| 21 | Garment visibility from all sides | PASS (offline renders) / NOT TESTED (browser) | Front, side and back CPU z-buffer renders for rest and all poses. |
| 22 | Original reconstruction pipeline unchanged and operational | PASS | Same SHA-256 for `reconstruct.py`, the adapter and the validator; fresh run within 8.3e-7 m of baseline. |
| 23 | Privacy | PASS | Personal bodies and garments only under the ignored `outputs/`; personal URLs return 404; server on loopback. Nothing committed or pushed. |
| 24 | $0 budget, no fabricated results | PASS | Local only; every number above comes from a logged run. |

## Test results

| Suite | Command | Result |
| --- | --- | --- |
| Garment unit and integration tests (Python) | `python -m unittest discover -s services/garments/tests` | **6 passed** |
| Reconstruction tests (Python) | `python -m unittest discover -s services/reconstruction/tests -q` | **19 passed** |
| Garment validation (3 garments) | `validate_garment.py <garment> <avatar>` | **3 passed**; identity+scale garment on the neutral avatar **refused**, as intended |
| Three.js loader + garment binding and deformation | `npm test` | **passed** (neutral, personal identity, personal identity+scale; 2 refusals) |
| TypeScript / lint / production build | `npm run typecheck` / `lint` / `build` | **passed** (build routes: `/`, `/lab`, `/api/demo-avatar`, `/api/demo-garment`) |
| Contracts typecheck | `tsc --noEmit -p packages/contracts` | **passed** |
| HTTP | `curl` against `127.0.0.1:3000` | `/lab` 200, both demo routes 200, personal paths 404 |
| Browser rendering and interaction | — | **NOT TESTED** (extension not connected) |

## Manual visual checklist (browser)

1. In `apps/web`: `npm.cmd run dev -- -H 127.0.0.1`, then open `http://127.0.0.1:3000/lab`.
2. **Neutral:** turn on **Show garment layer**. The status should read `BOUND · 127 joints · inverse-bind Δ 1.2e-7`. Check the shirt from **front**, **left/right** and **back**; turn on **Turntable** (360°); orbit and zoom.
3. **Colour:** change the base colour. It should change immediately with no reload.
4. **Inspection:** turn on **Wireframe** (body and garment) and **Skeleton**.
5. **Poses:** step through every **Test pose**. Sleeves should follow the arms, the shirt should rotate with the torso, and fins under the arms are expected in *Both arms raised*. Press **Reset pose**.
6. **Visibility:** hide and show the garment.
7. **Personal:** set **Avatar → Personal** and pick `outputs/avatars/sam3d-person-front-sprint03-run2-rest-identity.glb`. Set **Garment → Local garment GLB** and pick `outputs/garments/tshirt-sam3d-person-front-sprint03-run2-rest-identity.glb`. It should bind; repeat steps 2–5.
8. **Refusal:** with the neutral avatar, pick the `…-rest-identity-scale` garment. It should show "fitted to a different skeleton", and the avatar should stay visible.
9. Keep any screenshot of personal avatars in `outputs/` and do not share it.

## Sprint 1.1 recommendations

1. **Underarm deformation.** Replace the armpit closing webbing with an explicit underarm seam (separate sleeve and torso panels joined by a seam loop). Compute garment weights with geodesic or heat diffusion instead of Euclidean nearest neighbours, and try dual-quaternion skinning or a corrective for raised arms. Target: p99 edge strain below 1.5 with arms raised.
2. **Neckline and ease.** Shape the collar as a designed curve with its own ease, so it doesn't need a 1.6 cm push-out. Straighten the back neckline.
3. **Retargeting quality.** Smooth the displacement field over the garment (Laplacian) to remove speckle. Ground-align bodies evaluated with SAM scales.
4. **Performance.** Decimate the garment to about 15–20k vertices (quadric, preserving boundaries and UV seams) and measure FPS once a browser is available.
5. **Accurate collision diagnostics.** Use a BVH point-to-triangle distance (for example `three-mesh-bvh`) in tests and as an optional live overlay.
6. **First simulation step.** Run an offline XPBD drape of the same shirt on the rest-pose body with SDF collision, and compare against the skinned version, before any runtime cloth.
7. **Browser verification.** Connect the extension, or run the manual checklist above, and record screenshots privately.
