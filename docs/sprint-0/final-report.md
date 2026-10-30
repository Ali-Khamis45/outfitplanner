# Sprint 0 technical review — 2026-10-31

## Decision: NO-GO

Do not proceed to clothing integration as a completed Sprint 0. A neutral MHR demo can be evaluated and exported with a real skeleton and skinning data, but the central acceptance criterion—an authorized photograph through real SAM 3D Body inference, MHR mapping, rigged GLB and browser rendering—has not been demonstrated. The official SAM checkpoint request is **BLOCKED_PENDING_APPROVAL**; no model inference, real output, preview, or inference benchmark exists. The browser automation and native UI hosts were unavailable, so visual appearance, controls, and responsive behavior were not tested. The $0 budget remains in force; no paid service is assumed.

This review covers the current working tree, including uncommitted changes, and local ignored artifacts. See [acceptance results](acceptance-results.md), [technical debt](technical-debt.md), [next steps](next-sprint-recommendations.md), and the [experiment log](../experiments/experiment-log.md). Prior implementation reports are useful context; the checks below were rerun for this review unless marked historical.

## Environment and reproducibility

Windows 10 Home 22H2 x64; Node 24.18.0, npm 11.16.0, Python 3.11.15, Git 2.54.0. NVIDIA RTX 3060 Laptop GPU, 6,144 MiB VRAM, driver 610.62; 5,997 MiB free at the audit query. This is a point-in-time device reading, not a model memory measurement. WSL2 Ubuntu is installed, but attempting to start it returned `HCS/ERROR_NO_SYSTEM_RESOURCES`. `nvcc` and Conda were not found on Windows PATH; the prior WSL inspection also found no `nvcc` on PATH. CUDA driver support is not proof that a compatible toolkit or PyTorch build is installed.

The isolated Windows MHR viewer environment has PyTorch 2.7.1+cpu, NumPy 2.4.6 and `pip check` found no broken requirements. It is not CUDA-enabled. The separate SAM Pixi Python 3.11 setup is incomplete: the CUDA PyTorch download was interrupted, Detectron2 and its weights are not verified, and the environment could not be started for this audit. npm has a lockfile; MHR has a pinned requirements list without artifact hashes; the complete SAM dependency environment is not locked and has not been reproduced. The logged upstream revisions are MHR `dd4340315901ba2e367133b86971e0caf8e91dd5` and SAM 3D Body `b5c765a0d89d789985e186d396315e7590887b94`.

The user reported that Hugging Face authentication works and access is pending. In the prior session the official checkpoint HEAD checks returned HTTP 401; the pending request was not retried or bypassed during this review. No assumption is made about whether 6 GiB is sufficient for the model and detector.

## MHR and GLB evidence

The official MHR viewer's 26 tests passed in 7.87 s, including real model evaluation and export checks. The independent upstream MHR basic test passed; the full upstream core suite failed collection with two `ModuleNotFoundError: pymomentum` errors, so the full Python demo/core behavior is not verified. The local validator and Three.js GLTFLoader parsed the existing neutral export: 18,439 vertices, 36,874 triangles, 127 joints, finite coordinates and four valid normalized skin influences per vertex; maximum reported weight-sum error `1.0349e-7`. The file is 1,374,992 bytes (about 1.31 MiB), SHA-256 `6a1050b05c4345d8244fc1f66399776d1982d88f67fe4ff08c86295041686fb3`. The validator reports Y-up meters by the official viewer convention; it is not a full glTF conformance validator or a visual deformation test. The official exporter truncates to four normalized influences and uses the evaluated snapshot as bind state; clothing and animation fidelity remain unproven.

## SAM, integration and UI

The adapter is source-derived: 45 shape coefficients, 204 expanded MHR parameters and 72 expression values feed the official MHR model; the inspected SAM head zeros the predicted face expression. It checks parameter shapes, finite values, topology and a provisional `0.0001 m` per-coordinate vertex tolerance after the source-documented Y/Z conversion. Camera translation and focal length are metadata rather than baked into the asset. Synthetic tests using the actual MHR model and exporter passed, including a nonzero identity value, mismatch rejection and Three.js loading. This does not validate the interpretation of a **real** SAM result, camera orientation, scale or CPU/GPU numerical tolerance. Neutralization is intentionally absent; zeroing all model parameters would also discard recovered scale.

The lab has an R3F canvas, camera controls, toggles and a local-only object-URL photo preview. The reconstruction button is disabled, and there is no personal avatar upload or generated-asset endpoint. HTTP `/lab` and the fixed demo-asset endpoint returned 200; the 1,374,992 bytes served exactly match the local GLB. HTTP success and Node GLTFLoader parsing do not demonstrate browser WebGL rendering or controls. No screenshot, browser FPS or browser load-time measurement exists.

## Automated checks

| Command / suite | Result | Scope |
| --- | --- | --- |
| `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build` | PASS | Current frontend and contracts; production build completed. |
| `npm.cmd run test` | PASS | One Node Three.js GLTFLoader test of the neutral demo, not browser rendering. |
| `external/mhr-venv/Scripts/python.exe -m unittest discover -s services/reconstruction/tests -v` | PASS: 19 tests | Includes synthetic MHR adapter, invalid input and GLB validator tests; no real SAM inference. |
| MHR `web-viewer`: `python -m pytest tests -q` | PASS: 26 tests | Official viewer backend on CPU with local MHR model. |
| MHR root: `python -m pytest tests -q` | FAIL / BLOCKED | Two collection errors due to missing `pymomentum`; no full-suite result. `tests/test_basic.py` separately passed 1 test. |
| SAM 3D Body tests | NOT TESTED | No upstream `test_*.py`/`*_test.py` files were found in the checkout; inference is blocked. |
| `pip check` in MHR environment | PASS | Installed distribution requirements only, not MHR full-demo support. |
| `npm.cmd audit` | PASS | 0 known advisories returned at audit time; not proof of security. |

The GLB structural validator and source inspection were also run. A full glTF conformance validator, browser automated tests, actual GPU execution and authorized three-photo tests were not run. The three-image requirement is conditional on the model being operational, which it is not.

## Performance: targets versus measurements

These are initial investigation targets, not measured results or product promises. Revisit them with agreed hardware and workload.

| Metric | Initial target | Measured result |
| --- | --- | --- |
| Single-image warm inference | ≤60 s per photo | BLOCKED; no inference. Record cold and warm runs separately. |
| Peak GPU memory | ≤5.5 GiB allocated on the 6 GiB GPU, leaving headroom | BLOCKED; 5,997 MiB free was only an idle device snapshot. Record allocated and total device usage. |
| Demo GLB size | ≤2 MiB | 1,374,992 bytes; PASS for the neutral example only. |
| Local browser avatar load | ≤3 s to first visible frame | NOT TESTED; HTTP availability is not a render-time measurement. |
| Interaction FPS | ≥30 FPS during orbit on the target machine | NOT TESTED; demand rendering only samples while frames are active. |
| Cost | $0 for this sprint | No paid GPU resource was provisioned in the recorded work; independent billing verification not performed. |

## Privacy, deletion and license review

The current tracked-file inventory contains zero media or model/mesh paths, and visible Git-history filenames contain zero media extensions from the checked list. A limited pattern scan of tracked working-tree files found zero matches for common Hugging Face, OpenAI-style or AWS access-key patterns. This is not a comprehensive secret scan, a complete historical content scan, or proof that no credentials or personal data exist elsewhere. The input photo, `outputs/`, research checkouts and checkpoint example paths are ignored; `git check-ignore` confirmed representative paths. Ignore rules do not prevent forced staging or remove historical data. Review the index and history before sharing the repository.

The current Next endpoint reads only the fixed neutral demo path, and the photo preview uses an in-browser object URL. There is no implemented personal-avatar URL or upload backend. The endpoint is unauthenticated: a server bound to an external interface can expose its fixed asset, and replacing that asset with a private avatar would expose it. Bind to localhost and do not expose this proof of concept to untrusted networks.

To delete a person's data, close any lab page showing the photo, then use the file manager or PowerShell `Remove-Item -LiteralPath '<exact-file-path>'` for each authorized photo under `samples/input/`, each generated preview, NPZ, GLB and metadata file under that person's `outputs/` directory, and any screenshots downloaded by the browser. Confirm the exact files before deleting; do not delete the whole shared outputs or checkpoint directories by default. Check any copies in temp directories, Recycle Bin, browser downloads, backups and other devices according to the user's retention policy. Object URLs are revoked on selection change/unmount, but closing the page and clearing any saved copies is still necessary. There is no automated deletion or retention policy, and this procedure was documented rather than executed during review.

SAM 3D Body code and checkpoints use the [SAM License](https://github.com/facebookresearch/sam-3d-body/blob/main/LICENSE); MHR and Detectron2 code use Apache-2.0 as documented in [research licenses](../architecture/research-licenses.md). Verify model and transitive dependency terms before distribution. The inventory incorrectly says no research checkout or checkpoint is installed, even though MHR assets and both checkouts exist; this is documentation debt, not a license conclusion.
