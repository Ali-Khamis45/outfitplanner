# Sprint 2.1B — try-on

- **PASS** — `/try-on` is separate from `/lab`; it provides independent top and pants colours and visibility, always-on corrective drivers, camera controls, three poses, a local avatar picker and console-only FPS logging.
- **PASS** — Pose transition tests verify 400 ms endpoints and interruption against the neutral MHR skeleton. The real v5 and pants corrective drivers pass the existing shared-rig tests.
- **PASS** — `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd test`; `/try-on` returned HTTP 200. Tests ran against isolated neutral-only copies to avoid writing under `outputs/`; personal-avatar cases were skipped.
- **PASS** — Headless Chrome checks at 390, 768 and 1024 px showed the avatar and feet above the view bar; the narrower layouts put the panel below the 60vh stage. Try-on arm settings are 18° inward and ±10° walk swing in `TRY_ON_ARM_CONFIG`.
- **NOT TESTED** — Browser checks of the updated arm and garment clipping, personal avatar selection, console FPS and interactive orbit. Garments still require a compatible matching avatar bind pose; incompatible fits are reported in the page.
