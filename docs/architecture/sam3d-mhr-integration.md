# SAM 3D Body → MHR integration

**End-to-end status (2026-10-31): mapping verified on one real result.** A real SAM 3D Body output from one authorized photo was evaluated with the official MHR model. It reproduced SAM's vertices to 5.96e-7 m after the Y/Z flip, and the result was exported as a rigged GLB that passed validation and Three.js GLTFLoader parsing; see the [Sprint 0.3 report](../sprint-0/sprint-0.3-report.md). Still unverified: browser display of a reconstructed avatar, skinning and animation quality, a neutral dressing pose, and behavior across more photos. The analysis below was written before that result and is otherwise unchanged. No paid GPU or unofficial checkpoint is used.

Sources: SAM 3D Body commit [`b5c765a0d89d789985e186d396315e7590887b94`](https://github.com/facebookresearch/sam-3d-body/tree/b5c765a0d89d789985e186d396315e7590887b94) and MHR commit [`dd4340315901ba2e367133b86971e0caf8e91dd5`](https://github.com/facebookresearch/MHR/tree/dd4340315901ba2e367133b86971e0caf8e91dd5). Inspect the pinned [SAM MHR head](https://github.com/facebookresearch/sam-3d-body/blob/b5c765a0d89d789985e186d396315e7590887b94/sam_3d_body/models/heads/mhr_head.py), [estimator](https://github.com/facebookresearch/sam-3d-body/blob/b5c765a0d89d789985e186d396315e7590887b94/sam_3d_body/sam_3d_body_estimator.py), [camera head](https://github.com/facebookresearch/sam-3d-body/blob/b5c765a0d89d789985e186d396315e7590887b94/sam_3d_body/models/heads/camera_head.py) and [MHR model](https://github.com/facebookresearch/MHR/blob/dd4340315901ba2e367133b86971e0caf8e91dd5/mhr/mhr.py) before changing the mapping.

## Source-derived fields

| SAM estimator field | Upstream meaning and proposed MHR use |
| --- | --- |
| `shape_params` | 45 shape coefficients passed as MHR `identity_coeffs`. Preserve unchanged. |
| `mhr_model_params` | Expanded MHR model parameter vector: body/hand/root pose plus 68 expanded scale values, 204 total in the inspected code. Pass as MHR `model_parameters`; do not substitute raw pose or the 28-value `scale_params`. Full-hand refinement recomputes this vector. |
| `expr_params` | 72 expression coefficients passed to MHR. In this source revision the head explicitly multiplies predicted face values by zero; do not claim recovered facial expression. |
| `body_pose_params`, `hand_pose_params`, `scale_params`, `global_rot` | Intermediate predictions; the head expands scale using learned mean/components, replaces hand parameters in the full pose, and returns the resulting `mhr_model_params`. Do not reconstruct this transformation independently. |
| `pred_vertices`, `mesh_faces` | The estimator returns vertices; our reconstruction CLI stores its actual estimator faces as `mesh_faces`. The inspected head uses LOD 1. Compare topology and evaluated vertices before export. |
| `pred_joint_coords`, `pred_global_rots` | Upstream joint outputs; their coordinate treatment differs. Re-evaluate the full MHR skeleton state for export rather than constructing a rig from positions alone. The full-hand refinement path must be checked against a real output before relying on returned rotations. |
| `pred_cam_t`, `focal_length` | Image projection parameters. The camera head adds translation to 3D points for projection. Keep these as metadata; the exported asset is in MHR space and does not bake the photo camera transform into the avatar. |

The MHR head calls MHR with `(shape_params, model_params, expr_params)`, divides MHR vertex and joint coordinates by 100, then flips Y and Z for its camera convention. The adapter evaluates MHR directly and exports its **unflipped MHR-space** vertex positions and skeleton translations in meters. It applies the same documented Y/Z flip only for a comparison against `pred_vertices`; it does not apply `pred_cam_t` to the export. The official MHR viewer describes its exported space as meters and +Y up. Image camera direction, world orientation, parameter units and the correctness of cross-version assets remain to be checked on real outputs.

## Adapter and export

[`sam3d_mhr_adapter.py`](../../services/reconstruction/sam3d_mhr_adapter.py) requires finite float vectors of lengths 45, 204, 72 and 3, a vertex array, and exact topology equality with the selected MHR asset. It runs the official TorchScript MHR model, converts centimeters to meters, and refuses export if its camera-convention vertices differ from the SAM result by more than 0.0001 m per coordinate. This fail-closed comparison is a provisional tolerance: measure actual CPU/GPU and model-version differences before treating it as an acceptance threshold.

The adapter calls the official web-viewer exporter and its four-influence selection, validates the generated GLB with the local validator, and saves a sidecar containing coordinate convention and the unapplied camera translation. Both artifacts must remain in ignored `outputs/`. The exporter computes bind transforms from the evaluated snapshot; it retains the four strongest normalized influences, so deformation fidelity relative to the full MHR model and clothing suitability still require visual and animation tests. The photo-derived shape and pose are sensitive data.

After a genuine reconstruction exists and the mapping has been validated, the local adapter can be invoked from the project root with:

```powershell
external/mhr-venv/Scripts/python.exe services/reconstruction/sam3d_mhr_adapter.py --input outputs/reconstruction-person-front/reconstruction.npz --output outputs/reconstruction-person-front/posed-avatar.glb --mhr-model external/checkpoints/sam-3d-body-dinov3/assets/mhr_model.pt
```

The paths are examples only. The MHR model should be the one paired with the actual checkpoint; version and geometry cross-checks are essential. This command has not been run with a photo-derived result.

No neutralization is implemented. Zeroing all 204 values would discard estimated scale parameters as well as pose. A future dressing pose needs a documented parameter-name-based treatment that preserves identity and scales, and must be tested against MHR's actual rig, skinning and pose correctives; zero continuous pose tokens are also not necessarily all-zero values. The current exporter preserves the estimated pose.

## Test evidence and gaps

Tests use a deliberately synthetic MHR parameter set with a nonzero identity coefficient, the actual official MHR model and the official exporter. They check vector shapes and finiteness, detect mismatched vertices, structurally validate a skinned GLB, and load that GLB with Three.js GLTFLoader when Node is available. These are **not** SAM outputs and do not establish real mapping compatibility. Once access is approved: capture a real authorized inference, inspect every field and shape, compare both vertices and topology using the adapter, check camera orientation and height, visually inspect posed deformation and test joint animation in a glTF viewer before enabling the browser reconstruction action.

The lab photo picker currently creates a browser-local preview only. Reconstruction remains disabled while the checkpoint and end-to-end path are blocked. No private upload endpoint or permanent personal-asset URL is exposed. The existing neutral demo remains available.
