# Experiment log

## 2026-10-30 — Foundation audit

No inference or model downloads performed. Hardware and tooling findings are in [the environment audit](../setup/environment-audit.md). Future entries should include date, exact upstream revision and model, input provenance without identifying details, setup, commands, hardware, timings, peak memory, result, failures, and local artifact locations. Do not include personal images or tokens.

Foundation verification: `npm.cmd install` installed 416 packages and reported zero audit vulnerabilities; npm warned that ESLint 9 is no longer supported and one `unrs-resolver` postinstall was not approved. `npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd run build` passed. `npm.cmd run test` exited successfully but no tests exist. `npm.cmd run dev` started and an HTTP request to `/` returned 200 with the lab title and the unimplemented-feature notice. The server was stopped after verification. No browser/WebGL or 3D viewer test was performed.

## 2026-10-30 — MHR neutral GLB

Upstream commit `dd4340315901ba2e367133b86971e0caf8e91dd5`, release assets `v1.0.1`. WSL Ubuntu 26.04 initially exposed the RTX 3060; later WSL launches failed `HCS/ERROR_NO_SYSTEM_RESOURCES`, blocking the recommended Pixi install. Windows Python 3.11 / PyTorch 2.7.1+cpu successfully ran the official TorchScript viewer server. The official full `demo.py` failed `ModuleNotFoundError: pymomentum`; `pymomentum-cpu` had no Windows distribution. No upstream files were changed.

Viewer metadata and CPU evaluation succeeded; the root page returned HTTP 200. Browser visual verification was blocked by unavailable browser and native UI hosts. The official API exported zero identity/pose/expression, LOD 1, correctives on and ground snapping off to ignored `outputs/avatars/mhr-neutral.glb`. Structural validation passed: 18,439 vertices, 36,874 triangles, 127 joints, four valid normalized influences per vertex and finite coordinates; max weight-sum error `1.04e-7`. Bounds, hashes, limitations and reproducible commands are in [MHR setup](../setup/mhr.md). Official viewer backend tests: **26 passed** in 51.73 seconds. Project validator synthetic tests: **5 passed**. Neither result proves browser rendering or animation quality.

## 2026-10-30 — React Three Fiber studio

Created `/lab` and a fixed local endpoint for the ignored MHR neutral GLB. The Next.js development server returned HTTP 200 for the lab and asset; the 1,374,992 bytes served match the generated asset SHA-256 `6a1050b05c4345d8244fc1f66399776d1982d88f67fe4ff08c86295041686fb3`. The Three.js GLTFLoader test parsed 18,439 vertices, 36,874 triangles, 127 joints and a 1.727 m height. TypeScript, lint and the loader test passed. Browser and native UI hosts were unavailable: actual WebGL rendering, camera, toggles, screenshot, responsive layout and FPS could not be observed. The scene reports FPS only when demand-rendered frames are active; no FPS measurement is claimed here.
