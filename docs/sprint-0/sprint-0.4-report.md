# Sprint 0.4 — First real SAM 3D Body inference (verification run)

**Date:** 2026-10-31. **Result:** the official SAM 3D Body pipeline initialized, detected the one person in the authorized photo, ran real inference on the RTX 3060 Laptop GPU, and its output was exported as a validated, rigged MHR GLB that Three.js loads. The run needs more memory than the GPU's dedicated VRAM; it completes only through the Windows driver's spill into system RAM.

This sprint re-verifies, from a clean preflight, the path first exercised at the end of [Sprint 0.3](sprint-0.3-report.md). It also covers what 0.3 did not: a JPEG input, a review of the demo's optional components, and core-only initialization measured on its own. All numbers below come from runs in this sprint.

## Acceptance matrix

| Criterion | Status | Evidence |
| --- | --- | --- |
| Preflight: imports, assets, processes | PASS | `torch`, `torchvision`, `detectron2`, `detectron2._C`, `cv2`, `pyrender`, `sam_3d_body`, `tools.build_detector` and `tools.vis_utils` all import. `model.ckpt` (2,109,129,346 B), `model_config.yaml`, `assets/mhr_model.pt` (696,110,248 B) and the ViTDet `model_final_f05665.pkl` (2,765,948,277 B) are present. No other inference, pip, conda or download process was running. `pip check`: no broken requirements. |
| Detectron2 CUDA runtime operations | PASS | [`probe_detectron2_cuda.py`](../../services/reconstruction/probe_detectron2_cuda.py) on `cuda:0`: `nms_rotated` and `batched_nms_rotated` → `[0, 2]`, `pairwise_iou_rotated` self-IoU 1.0, `ROIAlignRotated` shape `[1, 2, 2, 2]`. Extension built with CUDA 12.6 / GCC 12.4. |
| RAM and VRAM available | PASS (recorded) | WSL: 9,871 MiB RAM (9,347 MiB available) plus 3,072 MiB swap, 16 CPUs; no `.wslconfig`. Windows: 20,332 MiB total, 8,064 MiB free. GPU: 6,144 MiB, 0 MiB used per WSL `nvidia-smi`, but `torch.cuda.mem_get_info()` reports only **5,121 MiB free** at idle. About 1 GiB of the dedicated budget is held outside WSL's view. |
| JPEG input prepared | PASS | `person_front.jfif` is already a baseline JPEG (`FF D8 FF E0`, RGB 736 × 1,104, EXIF orientation 1). It was copied byte-for-byte to the Git-ignored `samples/input/person_front.jpg` with no re-encoding; both files have SHA-256 `670d4d24…aa44`. Pillow and OpenCV each decode the two files to identical pixels. |
| Core model initialization | PASS | Official `load_sam_3d_body` via [`probe_sam3d_initialization.py`](../../services/reconstruction/probe_sam3d_initialization.py), with no detector, segmentor or FOV model loaded. Eval-mode model on `cuda:0` in **16.78 s** (process 22.7 s). |
| GPU memory measurement | PASS | Initialization: peak allocated **3,538,315,264 B**, reserved **3,730,833,408 B**, `nvidia-smi` sampled peak 3,668 MiB. Full reconstruction: PyTorch peak allocated **6,462,980,096 B** (6,164 MiB), and on the RTX adapter Windows counters show **5,989 MiB dedicated plus 708 MiB shared (spilled)**. Memory returned to 0 MiB after each process. See [Sprint 0.5](sprint-0.5-report.md) for the per-stage breakdown. |
| Fits in 6 GiB dedicated VRAM | FAIL | See the previous row: the run spills 708 MiB into system RAM. A driver or platform without that fallback would be expected to raise CUDA OOM. |
| CUDA and dependency errors | PASS | None. Warnings only: the upstream loader's missing-keys list (all MHR rig buffers, supplied by `mhr_model.pt`, plus `backbone.encoder.mask_token`), `Momentum is not enabled`, `Ignored kwargs: {'drop_path': 0.1}`, the `pkg_resources` deprecation, and Mesa's `kms_swrast` software-render fallback for the preview. |
| Person detection | PASS | Official ViTDet with the demo's thresholds (`bbox_thr=0.8`, `nms_thr=0.3`). Exactly one person, bbox `[227.8, 37.6, 497.8, 1066.8]` (93% of image height), which passed the adapter's single-person, size and edge checks. |
| Real inference | PASS | Verified pipeline [`reconstruct.py`](../../services/reconstruction/reconstruct.py), unchanged, run on the JPEG. Inference **12.27 s**; reconstruction process 176.3 s. 19 finite output arrays; only `mask` is absent (mask conditioning disabled). Mesh: 18,439 vertices, 36,874 faces. |
| Body geometry and pose output valid | PASS | Vertex extent 0.496 × 1.761 × 0.443 m. All 127 joint coordinates are finite. All 127 global joint rotations are orthonormal (max error 2.4e-7, determinant 1 ± 3e-7). 100% of 70 2D keypoints fall inside the bbox (±20 px). The aligned official preview was saved. |
| Reproducibility vs. the Sprint 0.3 baseline | PASS | Against the protected `sam3d-person-front-sprint03-run2`: identical keys, bbox and focal length. Max differences: vertices 8.3e-7 m, `shape_params` 1.1e-6, `body_pose_params` / `mhr_model_params` 9.2e-7, `global_rot` 3.0e-8, worst field `pred_keypoints_2d` 2.4e-4 px. |
| SAM-to-MHR mapping | PASS | [`sam3d_mhr_adapter.py`](../../services/reconstruction/sam3d_mhr_adapter.py) evaluated `shape_params` (45), `mhr_model_params` (204) and `expr_params` (72) with the official MHR model. Max vertex error against SAM's `pred_vertices` was **7.15e-7 m** (limit 1e-4 m); topology identical. |
| Rigged GLB export | PASS | Official MHR web-viewer exporter, output `outputs/avatars/sam3d-person-front-sprint04.glb`. Validation: 18,439 vertices, 36,874 triangles, 127 joints, max skin-weight-sum error 1.03e-7. Pose is SAM's estimate; no camera transform applied. |
| Three.js loading | PASS | `node tests/mhr-loader.test.mjs <GLB>`: skinned mesh with 18,439 vertices, 36,874 triangles, 127 bones, 1.761 m tall. |
| Out-of-memory handling | NOT TESTED | No OOM occurred, and none was forced. `reconstruct.py` and the new profiler wrap CUDA failures in a non-publishing error; the profiler catches `torch.OutOfMemoryError` explicitly. |

## Official demo components reviewed before enabling

Source: upstream `demo.py`, `tools/build_*.py` and `sam_3d_body_estimator.py` at revision `b5c765a`.

| Component | Demo default | Used here | Rationale |
| --- | --- | --- | --- |
| Human detector | `vitdet`: Cascade Mask R-CNN with a ViT-H backbone, 2.77 GB weights | **Yes** | Needed to get a valid person crop; without it the estimator falls back to the full image. It is also the dominant memory consumer: about 2.7 GB of weights plus about 3.2 GB of activations during detection. |
| Segmentor | `sam2`, but it loads only if a segmentor path is given, and `use_mask` defaults to `False` | No (not installed) | By default the demo neither loads nor uses a mask. Mask conditioning is optional and was not required for this valid single-person inference. |
| FOV estimator | `moge2` (MoGe-2 ViT-L, downloaded from Hugging Face) | No (not installed) | The estimator officially falls back to a default FOV: here focal 1,326.8 px, about 45.2° vertical. This is recorded in every run's metadata warnings. MoGe would add VRAM, and its absence is a candidate contributor to depth-direction pose error (see Sprint 0.5). |

Passing a precomputed bbox to `process_one_image(bboxes=...)` follows the same code path the estimator uses after its own internal detection (`is_crop=True`, same batch preparation). The adapter's separate detection call therefore uses the demo's detection semantics.

## Artifacts (all private, Git-ignored, marked read-only)

- `outputs/sam3d-person-front-sprint04/` holds `metadata.json`, `reconstruction.npz` and `preview.png`.
- `outputs/avatars/sam3d-person-front-sprint04.glb` and `.json` hold the rigged GLB and its validation metadata.

## Reproduce

In WSL from the project root, with `PY=/home/levi/miniforge3/envs/sam_3d_body/bin/python` and `C=/home/levi/sam3d-lab/checkpoints/sam-3d-body-dinov3`:

```bash
$PY -m pip check
$PY services/reconstruction/probe_detectron2_cuda.py
$PY services/reconstruction/probe_sam3d_initialization.py --checkpoint-dir "$C"
$PY services/reconstruction/reconstruct.py --input samples/input/person_front.jpg --output outputs/<new-dir> --checkpoint-dir "$C" --detector-dir external/checkpoints/vitdet
```

Then in Windows:

```powershell
.\external\mhr-venv\Scripts\python.exe services\reconstruction\sam3d_mhr_adapter.py --input outputs\<new-dir>\reconstruction.npz --output outputs\avatars\<name>.glb
cd apps\web; node tests\mhr-loader.test.mjs ..\..\outputs\avatars\<name>.glb
```

VRAM was sampled with `nvidia-smi --query-gpu=memory.used -lms 250` in WSL and with the Windows `\GPU Adapter Memory(*)\Dedicated Usage` and `\Shared Usage` counters on the RTX adapter (LUID `…0x10902`).

## Blockers and caveats

- **VRAM:** the pipeline as written does not fit in dedicated memory. [Sprint 0.5](sprint-0.5-report.md) locates the peak in detection and removes the SAM-stage overrun.
- **Wall time varies:** the reconstruction process took 176.3 s here, against 115.6 s for the identical Sprint 0.3 run. Inference time was stable (12.3 vs 13.2 s), so the variance is in loading, detection and spill. It was not investigated further.
- **One photo:** one person, front view, default FOV. Shape accuracy is not measured.
