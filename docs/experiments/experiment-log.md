# Experiment log

## 2026-10-30 — Foundation audit

No inference or model downloads performed. Hardware and tooling findings are in [the environment audit](../setup/environment-audit.md). Future entries should include date, exact upstream revision and model, input provenance without identifying details, setup, commands, hardware, timings, peak memory, result, failures, and local artifact locations. Do not include personal images or tokens.

Foundation verification: `npm.cmd install` installed 416 packages and reported zero audit vulnerabilities; npm warned that ESLint 9 is no longer supported and one `unrs-resolver` postinstall was not approved. `npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd run build` passed. `npm.cmd run test` exited successfully but no tests exist. `npm.cmd run dev` started and an HTTP request to `/` returned 200 with the lab title and the unimplemented-feature notice. The server was stopped after verification. No browser/WebGL or 3D viewer test was performed.
