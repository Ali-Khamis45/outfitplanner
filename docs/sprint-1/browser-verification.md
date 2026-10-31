# Sprint 1.1 — Browser verification

**Date:** 2026-10-31. **Browser:** your Chrome, driven by the Claude in Chrome extension, at `http://127.0.0.1:3000/lab` (loopback-only `next dev`).

**Evidence:** PNGs from the lab's own **Capture** button (canvas `toBlob`), moved from Downloads into the Git-ignored `outputs/garment-tests/browser/`. The two personal captures (08, 09) are private and must not be shared. Direct extension screenshots worked twice and then timed out repeatedly, so with your approval the Capture button was used instead.

**Earlier observations:** your own browser observations from before this work (fins with both arms raised, body and shirt speckling, a boxy waist) are recorded in [browser-observations.md](browser-observations.md).

## Matrix

| Check | Status | Evidence |
| --- | --- | --- |
| /lab loads; neutral avatar renders | PASS | Live screenshot; inspector shows 18,439 vertices and 127 joints. |
| Original v1 shirt binds and renders | PASS | Inspector `tshirt-basic-v1`, `BOUND · 127 joints · inverse-bind Δ 1.2e-7`; capture 01. |
| **v1 underarm fins at both +90** | **Confirmed (defect)** | Capture 01: wing-like flaps below both armpits, front view. |
| Improved v2 shirt binds and renders | PASS | `tshirt-basic-v2`, 65,522 vertices, Δ 1.2e-7; captures 02–06. |
| **v2 at both +90: fins** | **PASS (fins removed)** | Front (02) and back (04): clean sides from sleeve to hem. |
| **v2 at both +90: underarm side view** | **FAIL** | Left view (03): underarm cloth pulls away, exposing the armpit, with a crumpled rim. |
| Original vs improved comparison at the same pose | PASS | Version selector plus "Compare: raise both arms"; v1 and v2 captured at the same both +90 pose (01 vs 02). |
| Front / side / back views | PASS | Camera presets used for captures 02, 03, 04. |
| Colour change | PASS | 06: blue → `#c0392b`, applied without reloading the garment. |
| Garment wireframe (independent of body) | PASS | 05: shirt triangles shown, body stays solid. The triangle density reveals faint extraction-grid arcs. |
| Skeleton overlay | PASS | 06: joint hierarchy drawn, aligned with body and shirt. |
| v2 low-detail variant | PASS (renders, binds, no fins) | 07: 24,578 vertices; collar rougher with small gaps. |
| Personal floor-aligned body (identity + SAM scales) | PASS | Loaded via the local file picker; in-browser SHA-256 `d314b6c67aee…` matches the file on disk. Side view (09): upright, **feet on the floor grid** (previously +5.2 cm). |
| Personal garment binds to the personal body | PASS | `BOUND · 127 joints · inverse-bind Δ 0.0e+0 · fitted to personal-identity-scale`; captures 08/09. Sleeve cuff edge ragged. |
| Body speckling (shadow acne) | PASS (not observed after fix) | No black speckling on the body in any of the 9 captures with the new shadow settings. Not compared side by side with the old settings in this session. |
| Neckline quality | FAIL (cosmetic) | Ragged collar edge in every v1/v2 capture; worse on the LOD. |
| Camera orbit by mouse drag | NOT TESTED | Only presets were used. |
| Turntable | PARTIAL | Toggled on and off via the UI; motion not observable (frames throttled, see below). |
| Rendering performance / FPS | NOT TESTED | The tab was throttled: 3 `requestAnimationFrame` callbacks in 2 s on an empty loop, and the FPS counter read 1 for every variant. Triangles per frame: v2 158,918, LOD 81,114. |
| Personal assets not served over HTTP | PASS | `/api/demo-garment` accepts only `v1`, `v2` or `v2-lod` (each returns its exact file, verified by SHA-256); other values return 400. The old `/api/garment-candidate` route is removed (404). Personal files were only loaded through the browser file picker. |

## Manual re-check (for anything marked NOT TESTED or PARTIAL)

1. Run `npm.cmd run dev -- --hostname 127.0.0.1` in `apps/web` and open `http://127.0.0.1:3000/lab`. Keep the tab in the foreground.
2. **Neutral:** turn on **Show garment layer**. Use **Garment** to switch between *Improved (v2)*, *Original (v1)* and *v2 low detail*. With **Compare: raise both arms**, orbit around both armpits by dragging. Expect no fins on v2/LOD, but an exposed armpit from the side.
3. **Performance:** turn on **Turntable** and read the FPS figure in the footer for v2 and the LOD.
4. **Personal (private):** set **Avatar → Personal** and choose `outputs/avatars/sam3d-person-front-sprint03-run2-rest-identity-scale-floor.glb` (or `…-rest-identity.glb`). Set **Garment → Local garment GLB** and choose the matching `outputs/garments/tshirt-v2-sam3d-person-front-sprint03-run2-rest-identity-scale-floor.glb` (or `…-rest-identity.glb`). Check that the feet touch the grid in every pose, and that switching poses causes no vertical jump.
5. **Refusal:** load a mismatched pair, for example the `-scale-floor` garment on the neutral body. Expect "fitted to a different skeleton", with the avatar still visible.
