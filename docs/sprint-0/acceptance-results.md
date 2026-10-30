# Sprint 0 acceptance matrix — 2026-10-31

Statuses: **PASS** = observed against this scope; **FAIL** = a required capability is absent or an executed check failed; **BLOCKED** = cannot execute because a prerequisite is unavailable; **NOT TESTED** = not observed. A synthetic pass never implies successful SAM inference.

| Requirement | Expected | Actual | Evidence | Status |
| --- | --- | --- | --- | --- |
| Frontend build and static checks | Build, lint and strict typecheck pass | All passed | `npm.cmd run build`, `lint`, `typecheck` | PASS |
| Full reproducible AI setup | Isolated, pinned, runnable CUDA research environment | SAM environment incomplete, WSL startup resource error, no verified Detectron2 CUDA build | [SAM setup](../setup/sam-3d-body.md); WSL audit | BLOCKED |
| GPU compatibility | CUDA PyTorch executes with selected model on local GPU | NVIDIA driver reports 6 GiB device; MHR environment is CPU-only, SAM CUDA environment not runnable | `nvidia-smi`; `torch.version.cuda=None` | BLOCKED |
| Official SAM checkpoint | Approved accessible model | User reports access pending; no checkpoint download attempted in this review | [SAM setup](../setup/sam-3d-body.md) | BLOCKED |
| Official MHR CPU evaluation | Real model loads and evaluates | Viewer tests use released TorchScript model | 26 official viewer tests passed | PASS |
| Full official MHR Python demo/core suite | Full model and tests run | Two collection errors, `pymomentum` missing; standalone basic test passed | Upstream `pytest tests -q` | BLOCKED |
| Neutral demo GLB geometry | Finite vertices and triangles, valid indices | 18,439 vertices, 36,874 triangles, finite positions | `validate_glb.py` | PASS |
| Neutral demo rig | Joints, skinning and valid weights exist | 127 joints, four influences, max sum error `1.0349e-7` | Validator, 26 upstream tests, GLTFLoader | PASS |
| GLB interoperability | Standard loader parses the asset | Three.js GLTFLoader parses skinned neutral demo and synthetic adapter export | `npm.cmd run test`; adapter test | PASS |
| Full glTF conformance and deformation | Independent full validator and animated inspection pass | Neither executed | No validator report or animation capture | NOT TESTED |
| Real photo inference | Successful authorized single-person inference | No checkpoint access or inference output | [experiment log](../experiments/experiment-log.md) | BLOCKED |
| Three authorized image trials | Three real, permissioned photos tested | Model not operational; none processed | No inference artifacts | BLOCKED |
| SAM parameter mapping and identity | Validate against actual output and preserve shape | Source and synthetic fixture only | [integration analysis](../architecture/sam3d-mhr-integration.md); adapter tests | BLOCKED |
| Photo-derived coordinate, camera and scale | Real output verified in world/browser and image frames | Source-derived conversion and synthetic comparison only | Integration analysis | BLOCKED |
| Dressing-friendly neutral pose | Preserve identity/scale in a verified pose | No neutralization implemented | `sam3d_mhr_adapter.py` preserves predicted pose | NOT TESTED |
| Photo-derived skinned GLB | Real inference exported and checked | Only neutral and synthetic MHR exports | Model access pending | BLOCKED |
| End-to-end UI workflow | Upload, reconstruct, progress, export and render | Local preview exists; start button disabled; no processing backend | `ReconstructionPanel.tsx` | FAIL |
| No fabricated inference success | Missing inference clearly reported | Pending notice and disabled action; no real output claimed | UI and setup docs | PASS |
| Lab HTTP and demo asset | Lab and fixed demo GLB load via HTTP | 200 responses; served bytes match local file | Local HTTP check | PASS |
| Browser rendering and controls | WebGL renders; orbit, zoom, presets, toggles and screenshot work | Browser/native UI automation unavailable | Browser host check | NOT TESTED |
| Responsive layout | Desktop/mobile layout usable | CSS breakpoints exist; not visually tested | `lab.css` | NOT TESTED |
| Inference performance | Measure time and peak memory | No inference | No benchmark | BLOCKED |
| Browser load/FPS | Measure first visible render and interaction FPS | No browser measurements | No browser test | NOT TESTED |
| Git privacy check | No personal photos/checkpoints in tracked files | No checked media/model extensions in current tracked inventory; representative paths ignored | `git ls-files`, `git check-ignore` | PASS |
| Comprehensive secret/history audit | No credentials or private data exposed anywhere | Limited pattern and filename checks only | Review report | NOT TESTED |
| Personal-asset access | No public personal avatar endpoint | No dynamic personal endpoint exists; demo endpoint unauthenticated | `app/api/demo-avatar/route.ts` | PASS |
| Deletion procedure | Describe how to remove user data | Manual procedure documented; no deletion executed | [final report](final-report.md#privacy-deletion-and-license-review) | PASS |
| External research licenses | Complete, current inventory of selected research code and model-asset terms | SAM License and MHR/Detectron2 Apache-2.0 code licenses listed; inventory wording is stale and relevant asset/transitive terms need review | [research licenses](../architecture/research-licenses.md) | FAIL |

**Sprint completion: BLOCKED. Final recommendation: NO-GO.**
