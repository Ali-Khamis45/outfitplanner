# Sprint 0.5 — Personal avatar viewer, GPU memory and body-shape assessment

**Date:** 2026-10-31. **Budget:** $0; local RTX 3060 Laptop GPU (6 GiB) only.

## Summary

- **Viewer:** `/lab` can now display either the neutral MHR body or the real exported personal GLB. The personal file is read in the browser from a local file picker and never uploaded or served. Build, types, lint and HTTP-level privacy checks pass. **Visual browser verification was not possible** (the Chrome automation extension was not connected), so every visual check is NOT TESTED and manual steps are given below.
- **GPU memory:** the overrun happens during **ViTDet detection** (5.93 GB allocated), not in SAM 3D Body (3.47 GB peak). Releasing the detector before loading SAM keeps the whole SAM stage within dedicated VRAM. It also cuts inference from 12.42 s to **2.86 s**, with results identical to the baseline within float noise. The 708 MiB spill remains, now confined to the 3.6 s detection pass.
- **Shape:** the forward lean and the rear bulge come from the **estimated pose** (hips back, spine and neck flexed forward), not from camera alignment, coordinate transforms or export. The Sprint 0.3 report misidentified the bulge as abdominal; it is posterior. A smaller contribution comes from the identity's seat shape.
- **Garment fitting:** ready for a first, limited garment-fitting experiment, with conditions; see the end of this report.

## Task A — Baseline protection

The verified baseline is untouched. All generated artifacts were set read-only before any experiment, and every experiment wrote to a new directory. The adapters also refuse to overwrite existing outputs. Checksums recorded before the experiments still matched afterwards:

| Artifact (private, Git-ignored) | SHA-256 |
| --- | --- |
| `outputs/sam3d-person-front-sprint03-run2/reconstruction.npz` | `77c0e41c41446c93dde66f772728ac7d83507fe809985c883dac73378a479b8c` |
| `outputs/sam3d-person-front-sprint03-run2/metadata.json` | `6a78adabd2285f3a229c78ac4c21312ed72c0a73831d86bc5a2bd4fb98f6122a` |
| `outputs/sam3d-person-front-sprint03-run2/preview.png` | `4ca772c3672a4789774e50e823076032c5f8d64c709d361e9672f57e09533eb4` |
| `outputs/avatars/sam3d-person-front-sprint03-run2.glb` | `b14b9d1da05d3c9b294cda1946017f585e4211364192ddbd2529dd539ca3f8f9` |
| `outputs/avatars/sam3d-person-front-sprint03-run2.json` | `6159afcce3e7483dc71fc9af49f544cf21548ffaebe36efd46a8775bb0b12a07` |
| `outputs/avatars/mhr-neutral.glb` | `6a1050b05c4345d8244fc1f66399776d1982d88f67fe4ff08c86295041686fb3` |
| `services/reconstruction/reconstruct.py` (unchanged this sprint) | `9d2edf5101ea054f243fb38af7530b9f63b250aab720f79c8cfbb1c15b936fa6` |
| `services/reconstruction/sam3d_mhr_adapter.py` (unchanged this sprint) | `9662abdab6d023a5d90a7ba96a38ad9b34304922c5c70c19aab8f48e6ee6e855` |

New experiment outputs: `outputs/sam3d-person-front-sprint04/`, `outputs/sam3d-profile-resident/`, `outputs/sam3d-profile-release-detector/` and `outputs/shape-analysis-sprint05/`. No personal image, NPZ or GLB is tracked by Git; the staged diff must be reviewed before any commit.

## Task B — Personal avatar viewer

### Implementation

- **Avatar selector** ([`AvatarSourcePanel.tsx`](../../apps/web/components/avatar-lab/AvatarSourcePanel.tsx)): choose *MHR / Neutral body* or *Personal / Reconstructed avatar*. Personal mode shows a `.glb` file picker. The file is checked for the binary glTF header and a 64 MB size limit, then hashed with SHA-256 in the browser (Web Crypto). The hash is shown so you can compare it with the table above, proving the actual reconstruction is on screen. The file becomes a `blob:` URL that is revoked when replaced or on unmount, and is evicted from the loader cache.
- **Privacy model:** there is **no server route for personal files**. `next dev` listens on all interfaces by default, and App Router handlers have no trustworthy client address (the `Host` header is client-controlled), so any route serving the personal GLB would be an unauthenticated LAN endpoint. The production route list is unchanged: `/`, `/lab` and the fixed neutral `/api/demo-avatar`.
- **Rendering:** the same React Three Fiber path as the neutral body. `AvatarModel` now takes a URL and still rejects any GLB without a skinned mesh, bones and skin attributes, so a static mesh is never shown as a rigged avatar. A **turntable** toggle runs OrbitControls `autoRotate` (one revolution in about 15 s) while keeping the on-demand frameloop alive. Existing front, back, left and right (side) presets, orbit and zoom, skeleton helper, wireframe, grid, loading and error states all apply to both sources. The error boundary resets per source and has a personal-specific message. The inspector shows source, pose ("SAM predicted"), file name, size and hash, plus a "not a measured digital twin" note.
- **Orientation and scale:** the personal GLB is in meters, +Y up, and faces +Z like the neutral body (toe direction `[0.092, 0, 0.996]`, a 5.3° yaw from toe splay), so the front preset faces the person. Height is 1.761 m.
- The stale "BLOCKED · PENDING APPROVAL" reconstruction notice now says reconstruction runs from the CLI and is not wired to the browser.

### Browser verification matrix

| Check | Status | Evidence |
| --- | --- | --- |
| TypeScript, lint, production build | PASS | `npm run typecheck`, `npm run lint` and `npm run build` (Next.js 16.4.3) all exit 0. |
| `/lab` serves the new UI | PASS | HTTP 200 from the existing loopback-only dev server (`127.0.0.1:3000`, PID 20840, not started by this session). The HTML contains the selector options, the Turntable toggle and the CLI-only notice. |
| Neutral asset route intact | PASS | `/api/demo-avatar` returns 200, `model/gltf-binary`, 1,374,992 B, SHA-256 `6a1050b0…fb3`. |
| Personal GLB not reachable over HTTP | PASS | `/api/personal-avatar`, `/outputs/avatars/<personal>.glb` and a `../../outputs/...` traversal all return 404. |
| Personal GLB parses as a rigged avatar in Three.js | PASS (Node) | `GLTFLoader` on the same bytes: skinned mesh, 127 bones, 18,439 vertices, 1.761 m. This is the same parse path the viewer uses with a blob URL, but in Node, not a browser. |
| WebGL render of the personal avatar | NOT TESTED | Claude in Chrome reported "Browser extension is not connected". No screenshot was taken. |
| Selector switching, file picker, hash display | NOT TESTED | As above. |
| Turntable, presets, orbit/zoom, skeleton, wireframe | NOT TESTED | As above. |
| Loading and error states (e.g. a non-GLB file) | NOT TESTED | As above. Logic is covered only by typecheck and code review. |

### Manual test steps

1. In `apps/web`, run `npm.cmd run dev -- -H 127.0.0.1` (or reuse the server already on `127.0.0.1:3000`), then open `http://127.0.0.1:3000/lab`. Use `127.0.0.1`/`localhost`: Web Crypto hashing needs a secure context.
2. The neutral body loads; confirm the inspector shows 18,439 vertices and 127 joints.
3. Set **Active model → Personal / Reconstructed avatar**, click **Choose personal GLB**, and pick `outputs/avatars/sam3d-person-front-sprint03-run2.glb`. Confirm the SHA-256 starts with `b14b9d1da05d` and the height reads 1.76 m.
4. Check **front** (face visible), **left/right** (forward lean visible), **back**, the **Turntable** toggle, drag-orbit and scroll-zoom, **Skeleton**, and **Wireframe**.
5. Choose a non-GLB file renamed to `.glb` and confirm "missing the glTF header". Switch back to Neutral and confirm it reloads.
6. Screenshots show your reconstruction: keep them in `outputs/` and do not share them.

## Task C — GPU memory

### Method

[`profile_reconstruction.py`](../../services/reconstruction/profile_reconstruction.py) is new; `reconstruct.py` was not modified. It reuses `reconstruct.py`'s validation helpers and the same official calls and thresholds, and writes the same output schema plus `memory_stages`. Each stage resets PyTorch's peak counters and records the following separately:

- `memory_allocated` (live tensors)
- `memory_reserved` (caching allocator)
- per-stage peaks of both
- device-wide `total − free` from `cudaMemGetInfo`, which includes about 1 GiB held outside WSL
- host RSS

Externally, `nvidia-smi` was sampled every 250 ms in WSL, and the Windows dedicated and **shared** counters for the RTX adapter roughly every 1.4 s. These are different quantities and are not interchangeable. The preview render, which is CPU/EGL only, was skipped in both profiles. Each run was the only GPU process.

### Baseline: `resident` mode (detector stays loaded, as in `reconstruct.py`)

| Stage | Time (s) | Allocated (MiB) | Reserved (MiB) | Stage peak allocated | Stage peak reserved | Device used | Host RSS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CUDA context | 0.04 | 0 | 2 | 0 | 2 | 1,043 | 851 |
| Detector load | 32.37 | 2,707 | 2,776 | 2,707 | 2,776 | 3,817 | 1,044 |
| Detection | 3.76 | 2,715 | 6,460 | **5,934** | 6,460 | **6,144 (full)** | 1,928 |
| SAM load | 25.54 | 6,081 | 6,460 | 6,081 | 6,460 | 6,144 | 5,502 |
| Inference | **12.42** | 6,081 | 6,474 | **6,164** | 6,474 | 6,144 | 5,574 |

The process took 116.1 s. Windows RTX counters show 5,989 MiB dedicated (max) and **708 MiB shared (max)**.

From this run, the detector weights are 2,707 MiB, and detection activations add about 3.2 GB (peak 5,934 MiB). SAM 3D Body weights are about 3,366 MiB (6,081 − 2,715), and its inference adds about 83 MiB over its weights. The device is already full during detection. SAM then loads into the 6.46 GB reserved pool that detection left behind, and inference runs with the device full.

### Experiment 1: `release-detector`

Upstream supports this without changing semantics: `process_one_image(bboxes=...)` runs the same crop path as the estimator's internal detection, and the detector returns CPU NumPy boxes. The profiler keeps only those boxes, deletes the detector, runs `gc.collect()` and `empty_cache()`, then **asserts** that allocated memory is back to the CUDA-context baseline within 1 MiB before loading SAM.

- **Attempt 1 failed closed:** 8,519,680 bytes remained, which is exactly PyTorch's default cuBLAS workspace (2 × 4 MiB + 8 × 16 KiB). It is a per-process buffer created on the first matmul, not a detector reference, so it was missing from the baseline rather than leaked. Fix: initialize cuBLAS in the context stage. The tolerance stayed at 1 MiB.
- **Attempt 2:**

| Stage | Time (s) | Allocated (MiB) | Reserved (MiB) | Stage peak allocated | Stage peak reserved | Device used | Host RSS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CUDA context (+cuBLAS) | 0.17 | 8 | 22 | 9 | 22 | 1,073 | 958 |
| Detector load | 20.05 | 2,713 | 2,790 | 2,713 | 2,790 | 3,841 | 1,151 |
| Detection | 3.64 | 2,713 | 6,474 | **5,932** | 6,474 | 6,144 (full) | 1,952 |
| Detector release | 0.30 | **8 (= baseline, 0 B leftover)** | 20 | — | — | 1,075 | 1,952 |
| SAM load | 16.20 | 3,384 | 3,564 | 3,384 | 3,564 | 4,619 | 5,987 |
| Inference | **2.86** | 3,384 | 3,688 | **3,469** | 3,688 | **4,751** | 6,060 |

The process took 71.7 s. Windows RTX counters show 5,981 MiB dedicated (max) and 708 MiB shared (max). The spill now occurs only during detection.

### Before/after comparison

| Metric | Resident (baseline) | Release-detector | Change |
| --- | --- | --- | --- |
| Inference time | 12.42 s | **2.86 s** | −77% |
| SAM-stage peak allocated | 6,164 MiB | 3,469 MiB | −2,695 MiB |
| SAM-stage device used | 6,144 MiB (full) | 4,751 MiB | within dedicated VRAM |
| Process peak allocated | 6,164 MiB | 5,932 MiB (detection) | −232 MiB |
| Shared-memory spill (max) | 708 MiB | 708 MiB (detection only) | unchanged |
| Process wall time | 116.1 s | 71.7 s | −38%; load times also vary with file cache |
| Output vs protected baseline (max vertex diff) | 6.6e-7 m | 5.4e-7 m | both at float noise; identical bbox and focal length |
| Release vs resident (max vertex diff) | — | 8.3e-7 m | same result |

The inference speedup is attributable to the release: in resident mode, inference ran with the device full. The wall-time difference also includes load-time variance from file caching (detector load 32.4 s vs 20.1 s), which is unrelated to the change.

### Conclusions and next single experiment

- Releasing the detector is a safe, semantics-preserving improvement. It should become the default in `reconstruct.py` in a future change; this sprint did not modify the verified script.
- The remaining overrun is ViTDet-H detection at 1,024 px: 2.7 GB of weights plus about 3.2 GB of activations, against a usable budget of about 5.1 GB. The next experiment, one at a time, is **detection on CPU**: same weights, precision and input, with only the device changed. It should be measured for time and for box equality.
- **Not tried:** FP16/BF16 detection (a precision change), a smaller detection input (a semantics change) and a different detector (a model change). Each needs documented justification first.
- No OOM occurred, so OOM handling remains NOT TESTED. The profiler catches `torch.OutOfMemoryError` and publishes nothing on failure.

## Task D — Body-shape assessment

[`analyze_body_shape.py`](../../services/reconstruction/analyze_body_shape.py) re-evaluates the baseline's saved parameters with the official MHR model under controlled variants. It uses MHR's own parameter-transform masks (136 pose including 6 rigid, 68 scale; together they partition the 204 model parameters). It measures sagittal angles against vertical (+ means forward) and torso slices in a torso-aligned frame. Renders are private, in `outputs/shape-analysis-sprint05/` (`mean_body_rest.png`, `identity_scale_rest.png`, `posed.png`, each showing front, side and back).

| Segment angle (°) | Mean body, rest | Identity, rest | Identity + scale, rest | Posed (SAM) | Posed − rest |
| --- | --- | --- | --- | --- | --- |
| Legs (ankles → hips) | 4.62 | 4.62 | 4.50 | −3.81 | **−8.31** (hips back) |
| Torso (hips → neck) | 0.16 | 0.16 | 0.12 | 8.77 | **+8.65** |
| Lower spine (root → spine2) | −11.18 | −11.18 | −10.98 | −3.86 | +7.12 |
| Upper spine (spine2 → neck) | 11.05 | 11.05 | 10.72 | 21.21 | **+10.49** |
| Head (neck → head) | 16.75 | 16.75 | 16.75 | 40.28 | **+23.53** |
| Whole body (ankles → head) | 3.81 | 3.81 | 3.84 | 3.93 | +0.09 |

| Torso measure | Mean body | Identity | Identity + scale | Posed |
| --- | --- | --- | --- | --- |
| Abdomen front minus chest front | 1.30 cm | 1.33 cm | 2.08 cm | 0.44 cm |
| Abdomen front at 60% stature | 16.8 cm | 14.0 cm | 13.8 cm | 12.7 cm |
| Upper-back extent at 70% stature | −11.1 cm | −8.8 cm | −9.3 cm | **−17.8 cm** |
| Stature (vertical extent) | 1.727 m | 1.736 m | 1.715 m | 1.761 m |

| Candidate cause | Finding |
| --- | --- |
| Export transformations | **Ruled out.** Re-evaluated MHR matches SAM vertices to 5.9e-7 m after the documented Y/Z flip; the GLB is that geometry. |
| Coordinate transformation / global tilt | **Ruled out.** The whole-body axis is 3.93° posed vs 3.84° at rest, so the body is not rigidly tilted. The GLB faces +Z with +Y up. |
| Camera alignment | **Not validated.** Keypoint reprojection error is exactly 0 px, but that holds by construction, because the 2D keypoints are projections of the 3D ones. The camera is the upstream default: focal 1,326.8 px, about 45.2° vertical FOV, subject 2.53 m away. The true lens is unknown; the JPEG has no usable EXIF focal length. |
| Pose estimation | **Primary cause.** Opposing segment rotations (legs −8.3°, torso +8.7°, upper spine +10.5°, head +23.5°) produce the forward lean, a rounded upper back (−17.8 cm vs −9.3 cm) and pushed-back hips. The renders show the protrusion **behind** the body. The abdomen is flat when posed (0.44 cm abdomen-minus-chest, below the mean body's 1.30 cm). |
| Body identity estimation | **Minor.** Identity-only and identity-plus-scale bodies have a slimmer abdomen than the mean template and no abdominal bulge. The identity's side view shows a somewhat prominent seat, which the hip flexion then amplifies. |
| Pose correctives | **Minor.** Max vertex shift 1.41 cm, mean 0.17 cm. |
| Clothing occlusion | **Not evidenced either way.** Loose pleated trousers hide the hip and thigh contours. That could affect pose and identity, but nothing measured here isolates it. |

Why pose is the weak point: a frontal photo barely constrains bending toward or away from the camera. An 8.7° forward torso pitch shortens the torso's 2D projection by only 1.2%. With no MoGe FOV estimate, depth-direction posture is the least reliable part of the estimate. The 23.5° extra head flexion is the clearest over-estimate compared with the photo, where the subject looks roughly at the camera.

**Correction to Sprint 0.3:** the 0.3 report described a "belly/hip bulge … likely biased by loose pleated trousers". The bulge is **posterior** and pose-driven; the trouser attribution was unsupported. The 0.3 report now carries a note pointing here.

### Recommendation: measurement-guided correction (not implemented)

1. Keep SAM's raw parameters immutable. Store each correction as a separate, versioned, reversible layer: pose overrides plus identity deltas.
2. **Pose:** derive a canonical "dressing pose" by zeroing or clamping sagittal spine and neck flexion with official MHR parameters, preserving identity and scale. Validate with a second, side-view photo when available.
3. **Shape:** fit identity coefficients to user-supplied measurements (height, chest, waist, hip, inseam) by least squares through the official MHR model, with a prior that keeps coefficients near SAM's estimate. Report residuals per measurement and never present the result as exact.
4. Accept a correction only if the re-rendered mesh still reprojects onto the original photo's 2D keypoints within a set pixel tolerance.

## Task E — Verification

| Check | Result |
| --- | --- |
| Python reconstruction tests (`unittest discover`, MHR venv) | PASS: 19 tests OK |
| `py_compile` of the new scripts | PASS |
| GLB structural validation (`validate_glb.py` on the baseline GLB; adapter validation for Sprint 0.4) | PASS: 18,439 vertices, 36,874 triangles, 127 joints, weight-sum error 1.03e-7 |
| Three.js GLTFLoader test (neutral and personal) | PASS: 1.727 m and 1.761 m |
| TypeScript, lint, production build | PASS (all exit 0) |
| Browser checks | HTTP PASS; visual NOT TESTED (extension not connected) |
| Optimized result vs original | Max vertex diff 5.4e-7 m, `shape_params` 7.8e-7, `mhr_model_params` 7.7e-7, bbox and focal identical |

## Remaining limitations

- No visual browser verification of the viewer.
- The detection pass still spills 708 MiB, and the full pipeline still needs the Windows sysmem fallback. OOM handling is untested.
- One photo, one front view, default FOV; no MoGe and no second view. Shape and measurement accuracy are unvalidated.
- The exported avatar keeps SAM's estimated pose, including its over-flexed spine and neck. No dressing pose exists yet.
- The personal avatar must be reloaded by hand each session (by design, for privacy).

## First Clothing Engine experiment: readiness

**Ready, with conditions.** The pieces a first fitting experiment needs are verified: a rigged, metric, +Y-up MHR body with 127 joints and normalized skinning, produced from a real photo; a viewer that renders local GLBs; and validators. The posed personal mesh is not suitable as a fitting target: its depth-direction pose is unreliable, and fit judgments on it would mislead.

Recommended first experiment: drape **one simple garment** (for example a T-shirt or straight trousers template) on the **MHR neutral body** to establish the collision, skinning-transfer and rendering pipeline. Then, unchanged, on the **personal identity + scale in the MHR rest pose**, i.e. the `identity_scale_rest` variant above, exported as a new GLB that keeps the original. Compare garment-to-body clearance between the two bodies. Do not judge fit or size until a measurement-guided correction exists.
