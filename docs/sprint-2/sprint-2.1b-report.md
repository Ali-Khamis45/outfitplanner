# Sprint 2.1B — try-on

- **PASS** — `/try-on` is separate from `/lab`; it provides independent top and pants colours and visibility, always-on corrective drivers, camera controls, three poses, a local avatar picker and console-only FPS logging.
- **PASS** — Pose transition tests verify 400 ms endpoints and interruption against the neutral MHR skeleton. The real v5 and pants corrective drivers pass the existing shared-rig tests.
- **PASS** — `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd test`; `/try-on` returned HTTP 200. Tests ran against isolated neutral-only copies to avoid writing under `outputs/`; personal-avatar cases were skipped.
- **NOT TESTED** — Visual layout, lighting, orbit, actual transition smoothness, local avatar selection and console FPS in a browser: the browser host was unavailable. Garments still require a compatible matching avatar bind pose; incompatible fits are reported in the page.
