# Experiment log

## 2026-10-30 — Foundation audit

No inference or model downloads performed. Hardware and tooling findings are in [the environment audit](../setup/environment-audit.md). Future entries should include date, exact upstream revision and model, input provenance without identifying details, setup, commands, hardware, timings, peak memory, result, failures, and local artifact locations. Do not include personal images or tokens.

Foundation verification: `npm.cmd install` installed 416 packages and reported zero audit vulnerabilities; npm warned that ESLint 9 is no longer supported and one `unrs-resolver` postinstall was not approved. `npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd run build` passed. `npm.cmd run test` exited successfully but no tests exist. `npm.cmd run dev` started and an HTTP request to `/` returned 200 with the lab title and the unimplemented-feature notice. The server was stopped after verification. No browser/WebGL or 3D viewer test was performed.

## 2026-10-30 — MHR neutral GLB

Upstream commit `dd4340315901ba2e367133b86971e0caf8e91dd5`, release assets `v1.0.1`. WSL Ubuntu 26.04 initially exposed the RTX 3060; later WSL launches failed `HCS/ERROR_NO_SYSTEM_RESOURCES`, blocking the recommended Pixi install. Windows Python 3.11 / PyTorch 2.7.1+cpu successfully ran the official TorchScript viewer server. The official full `demo.py` failed `ModuleNotFoundError: pymomentum`; `pymomentum-cpu` had no Windows distribution. No upstream files were changed.

Viewer metadata and CPU evaluation succeeded; the root page returned HTTP 200. Browser visual verification was blocked by unavailable browser and native UI hosts. The official API exported zero identity/pose/expression, LOD 1, correctives on and ground snapping off to ignored `outputs/avatars/mhr-neutral.glb`. Structural validation passed: 18,439 vertices, 36,874 triangles, 127 joints, four valid normalized influences per vertex and finite coordinates; max weight-sum error `1.04e-7`. Bounds, hashes, limitations and reproducible commands are in [MHR setup](../setup/mhr.md). Official viewer backend tests: **26 passed** in 51.73 seconds. Project validator synthetic tests: **5 passed**. Neither result proves browser rendering or animation quality.

## 2026-10-30 — React Three Fiber studio

Created `/lab` and a fixed local endpoint for the ignored MHR neutral GLB. The Next.js development server returned HTTP 200 for the lab and asset; the 1,374,992 bytes served match the generated asset SHA-256 `6a1050b05c4345d8244fc1f66399776d1982d88f67fe4ff08c86295041686fb3`. The Three.js GLTFLoader test parsed 18,439 vertices, 36,874 triangles, 127 joints and a 1.727 m height. TypeScript, lint and the loader test passed. Browser and native UI hosts were unavailable: actual WebGL rendering, camera, toggles, screenshot, responsive layout and FPS could not be observed. The scene reports FPS only when demand-rendered frames are active; no FPS measurement is claimed here.

## 2026-10-30 — SAM 3D Body preparation

Cloned official upstream commit `b5c765a0d89d789985e186d396315e7590887b94`. Windows and WSL NVIDIA driver reports show an RTX 3060 Laptop GPU with 6 GiB VRAM; WSL Ubuntu started during this session. Both official checkpoints returned HTTP 401 with the existing WSL credential; no gated files were downloaded. The provided `samples/input/person_front.jpg` was absent under the project and workspace roots at inspection. No personal photo was processed and no model inference, preview or benchmark occurred. The offline validation and failure-path unit tests passed; their mocked failures are not inference verification. Setup and pending steps are documented in [SAM 3D Body setup](../setup/sam-3d-body.md).

## 2026-10-31 — Pending checkpoint and MHR verification

User reports Hugging Face authentication is working and the DINOv3 access request is pending: **BLOCKED_PENDING_APPROVAL**. No gated checkpoint was downloaded or inference attempted. An isolated WSL Pixi Python 3.11 environment was created, but the CUDA PyTorch download was interrupted after the pending-access clarification; the research environment is incomplete. A `.jfif` file was present in the input directory but was not opened or processed. No paid GPU services or unofficial checkpoints were used.

The official local MHR viewer exported an additional neutral LOD 1 GLB at `outputs/avatars/mhr-neutral-verification.glb`; its SHA-256 matched the original. Validation found 18,439 vertices, 36,874 triangles, 127 joints, valid skin weights and finite coordinates. The Next.js lab and asset endpoint returned HTTP 200, and the served asset matched the original generated GLB. Three.js GLTFLoader parsed the skinned asset. Browser automation and the native UI pipe were unavailable; rendering and interactive controls remain visually unverified. TypeScript, lint, frontend loader test, 15 Python tests, the production build, and 26 official MHR viewer tests passed. A later WSL startup failed with `HCS/ERROR_NO_SYSTEM_RESOURCES`.
