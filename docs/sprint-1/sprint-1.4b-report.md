# Sprint 1.4B — web corrective runtime

- **PASS** - In the existing `sprint-1.4-web` worktree, `npm.cmd install` in `apps/web` and a production build completed before the report update. The worktree already contained the implementation; this was not a fresh pre-implementation baseline. Install reported one unapproved `unrs-resolver` install script.

- **PASS** — Optional version 1 sidecar drives matching morph targets using the live avatar skeleton. A local picker accepts the GLB and sidecar together; absence leaves weights zero. Toggle and readout are in the garment panel. Unknown targets and unusable joints are warned and skipped.
- **PASS** — Independent tiny skinned GLB fixture: 0/45/90/105/120 degrees, twist, toggle, missing sidecar and unknown target. TypeScript, ESLint and production build passed.
- **FAIL** — `npm test` stops at the existing MHR loader because `outputs/avatars/mhr-neutral.glb` is absent in this worktree. The binding test also fails for missing generated neutral assets. Inspection test passed separately. Garment-quality command exits zero but **NOT TESTED**: all asset cases were skipped. No generation or assets were touched.
- **NOT TESTED** — Real v5 sidecar/GLB compatibility, browser rendering, the capture matrix, FPS values, and neutral or personal visual QA: demo and personal assets are absent here. No visual acceptance is claimed. The matrix uses load-state polling and short settle delays, which require browser validation.

## How to verify

Run `npm.cmd run dev` in `apps/web`, open `/lab` in a normal Chromium browser, and load the neutral avatar and matching demo garments into this worktree's ignored `outputs/`. For a local garment, select both its GLB and matching `<stem>.correctives.json` (or `<filename>.glb.correctives.json`) in the same file picker. Toggle Correctives and compare the readouts at the test poses. The demo v5 route currently assumes `outputs/garments/experiments/tshirt-v5-mhr-neutral.glb` and a same-stem `.correctives.json`; confirm Claude's actual output path before relying on it. A missing v5 is skipped by capture.

For captures, click **Capture matrix** and select `outputs/captures` in the directory picker. The browser creates a dated folder and `index.html`, with v1/v2/v4/v5 × five poses × front/left/back; unavailable variants are listed as missing. Existing filenames for that date are overwritten. The browser requires File System Access API and permission to write the selected directory. Keep personal assets out of this demo capture.

For performance, enable the full v2 garment, leave the tab visible, and wait at least 10 seconds for the footer's average FPS, average frame time and 1% low FPS (reciprocal of mean frame time in the slowest 1% of frames). Repeat with v2 low detail at the same pose, view, window size and device pixel ratio. The canvas renders continuously for measurement, including when idle; background tab throttling invalidates a sample.

## Contract ambiguity

A joint name does not specify which child defines the bone direction when there are multiple children, or how to handle a joint without a nonzero child offset. The driver uses the first nonzero child bone in skeleton order; missing directions are warned and skipped. Confirm this convention against the v5 producer before treating results as validated. Demo v5 path and sidecar naming likewise need confirmation; neither was supplied in the contract. The driver does not infer a different corrective format.
