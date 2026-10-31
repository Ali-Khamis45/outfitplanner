# Sprint 0.3 — SAM 3D Body reconstruction experiment

## Resumed experiment — real inference and export

The user authorized resumption. No active Hugging Face download, pip installer, or prior reconstruction process was found. Hugging Face's `hf cache verify --fail-on-missing-files` verified all five official checkpoint files. The existing ViTDet file's SHA-256 matched the previously recorded local hash; this is not an independently published checksum. `pip check` passed; PyTorch 2.7.1+cu126, torchvision 0.22.1+cu126 and an actual Detectron2 CUDA operator passed. The official model, detector, and preview imports succeeded. The official model initialized on `cuda:0` in 19.57 seconds with 3,538,315,264 bytes peak PyTorch allocation (3,730,833,408 bytes reserved). Upstream's `strict=False` loader reported missing keys, including MHR-related keys; their significance remains open.

On the authorized `samples/input/person_front.jfif` (736 × 1104), the official ViTDet stage passed the existing one-person and framing checks, and real SAM inference completed. The first run failed when its EGL preview could not open the graphics device; the CLI published no output from that attempt. A headless renderer smoke test passed using `EGL_PLATFORM=surfaceless LIBGL_ALWAYS_SOFTWARE=1 PYOPENGL_PLATFORM=egl`. With those process-local settings, the repeated run succeeded: model inference took **12.93 seconds**, and PyTorch recorded **6,462,980,096 bytes** peak allocated during the inference stage. This allocator measurement includes live allocations at the start of the stage and is not a measured peak of dedicated VRAM; it exceeds the nominal 6 GiB dedicated capacity, so it should not be described as dedicated VRAM consumption. No OOM occurred in this run.

The ignored private output directory `outputs/sam3d-person-front/` contains `reconstruction.npz`, `metadata.json`, and `preview.png`. All 19 saved numerical arrays were finite; the mesh has 18,439 vertices and 36,874 faces. The mask was absent, as recorded by the estimator. The existing adapter evaluated the real shape (45), MHR pose (204), and expression (72) parameters against the byte-identical official MHR model; maximum vertex difference was 7.15e-7 m. It exported `outputs/avatars/sam3d-person-front.glb` (1,376,292 bytes) and local metadata. The GLB validator passed with 127 joints and maximum skin-weight sum error 1.035e-7; the Three.js `GLTFLoader` test parsed the generated file and confirmed the same mesh and skeleton counts. Browser display, orientation, deformation quality, and exact body fidelity remain **NOT TESTED** by this experiment. Outputs are model estimates and remain Git-ignored.

| Milestone | Status |
| --- | --- |
| Official checkpoint verification, CUDA PyTorch, Detectron2 CUDA extension and imports | PASS |
| Official model initialization on CUDA | PASS, with upstream missing-keys warning |
| Single-person detector and real SAM inference | PASS for this one authorized image |
| Real SAM-to-MHR evaluation, skinned export, GLB validator and Three.js loader | PASS |
| Preview / model visual correctness in browser | NOT TESTED |
| Robustness across people, GPU configurations and repeated runs | NOT TESTED |

Relevant executed commands: `hf cache verify ... --fail-on-missing-files`; `python -m pip check`; `probe_sam3d_initialization.py --checkpoint-dir ...`; the existing `reconstruct.py` with the headless EGL settings and explicit local checkpoint/detector directories; `sam3d_mhr_adapter.py --input outputs/sam3d-person-front/reconstruction.npz --output outputs/avatars/sam3d-person-front.glb --mhr-model external/MHR/assets/mhr_model.pt`; `validate_glb.py` and `node tests/mhr-loader.test.mjs ../../outputs/avatars/sam3d-person-front.glb`. The first loader invocation used an incorrect working-directory path and failed with `MODULE_NOT_FOUND`; the corrected command passed. The 19 Python reconstruction tests, TypeScript, lint and the default frontend loader test passed. The older statuses below are historical and superseded by this section where different.

## Outcome (2026-10-31): first real photo-to-rigged-GLB run

**One authorized photograph was reconstructed end to end on the local RTX 3060 Laptop GPU, and the result was exported as a validated, rigged MHR GLB.** Every stage below was run in this session with logs and VRAM sampling. The main caveat is memory: the full pipeline **does not fit in the 6 GiB of dedicated VRAM**. It completes only because the Windows NVIDIA driver spills about 0.7 GiB into shared system memory. The estimated body shape is a model estimate, not a measured digital twin; see Limitations.

| Milestone | Status | Evidence (this session unless noted) |
| --- | --- | --- |
| WSL2 and NVIDIA device | PASS | `nvidia-smi` in Ubuntu: RTX 3060 Laptop GPU, 6,144 MiB, 0 MiB used at baseline, no other GPU or installer processes running. |
| Dependency consistency | PASS | `python -m pip check`: "No broken requirements found." PyTorch 2.7.1+cu126 and torchvision 0.22.1+cu126 are unchanged; nothing was reinstalled or downgraded. The observed package set is recorded in [`sam3d-cu126-freeze.txt`](../../services/reconstruction/sam3d-cu126-freeze.txt). |
| Detectron2 CUDA operators | PASS | [`probe_detectron2_cuda.py`](../../services/reconstruction/probe_detectron2_cuda.py): extension built with CUDA 12.6 / GCC 12.4 at official revision `a1ce2f9`. `nms_rotated` → `[0, 2]` (overlapping box 1 suppressed, as expected), `batched_nms_rotated` → `[0, 2]`, `pairwise_iou_rotated` self-IoU `[1.0, 1.0, 1.0]`, `ROIAlignRotated` output shape `[1, 2, 2, 2]`, all on `cuda:0`. |
| Official SAM 3D Body checkpoint | PASS | Earlier: `hf cache verify` verified all five files. The run metadata records the matching `model.ckpt` SHA-256 `b5a2f9d3…0abf`. |
| Official ViTDet detector weights | PASS | `model_final_f05665.pkl`, 2,765,948,277 bytes, locally computed SHA-256 `8601bc52…ae60`, recorded in run metadata. Upstream publishes no SHA-256 to compare against. |
| Official model initialization | PASS | `probe_sam3d_initialization.py`: eval-mode model in 16.6 s (warm cache; the first run took 119.5 s). Peak PyTorch allocated 3,538,315,264 B, reserved 3,730,833,408 B. Sampled VRAM 0 → 3,668 MiB, back to 0 MiB after exit. |
| Upstream missing-keys warning | PASS (benign for MHR) | All missing keys are MHR rig buffers that come from the separate `mhr_model.pt`, plus `backbone.encoder.mask_token`. The MHR cross-check below reproduces SAM's vertices to 5.96e-7 m, so the MHR head is not corrupted. The effect of the absent `mask_token` on unmasked inference has not been separately established. |
| Person detection | PASS | ViTDet returned exactly one person, bbox `[227.8, 37.6, 497.8, 1066.8]` on the 736 × 1,104 input, which passed the adapter's size and edge checks. |
| Inference | PASS | `reconstruct.py` finished with exit code 0. Inference took 13.23 s. All 19 returned arrays are finite. Only `mask` is absent (mask conditioning disabled). The mesh has 18,439 vertices and 36,874 faces; `focal_length` is 1,326.84 (upstream default FOV) and `pred_cam_t` is `[-0.018, 0.831, 2.528]`. |
| Official preview visualization | PASS (after fix) | First attempt: **FAIL**. Inference completed, then pyrender EGL failed with `GLError 12289 at eglInitialize` because user `levi` could not open `/dev/dri/renderD128` (`root:render`) or `card0` (`root:video`). The adapter published nothing, and GPU memory returned to 0 MiB. Fix, with user approval: `usermod -aG render,video levi`. The re-run produced `preview.png`, whose keypoint and mesh overlays align with the photo. Mesa used its `kms_swrast` software fallback for this preview render. |
| Fits in 6 GiB dedicated VRAM | FAIL | Windows `GPU Adapter Memory` counters for the RTX adapter: dedicated peaked at 5,989 MiB of 6,144, and **shared (system RAM) rose from 0 to 708 MiB**. `nvidia-smi` sampled peak was 5,984 MiB. PyTorch peak allocation during the inference window was 6,462,980,096 B (6,164 MiB), which exceeds the card's capacity. This works only through the driver's system-memory fallback; with that fallback disabled, or on Linux-native drivers, expect a CUDA out-of-memory error. |
| Out-of-memory handling | NOT TESTED | No OOM occurred, and none was forced. The adapter wraps detection, setup and inference errors (including `torch.OutOfMemoryError`) in a non-publishing `ReconstructionError`. The EGL failure exercised this same fail-closed path: no output written, memory released on exit. An OOM-specific test was not run. |
| Run reproducibility | PASS | An earlier, undocumented run at 03:13 had already written `outputs/sam3d-person-front`. This session's run matches it: identical bbox, focal length and topology; vertices within 7.2e-7 m; shape and MHR parameters within 1.7e-6. The earlier artifacts were left untouched. |
| Real SAM-to-MHR mapping | PASS | `sam3d_mhr_adapter.py` evaluated the official MHR model on SAM's `shape_params` (45), `mhr_model_params` (204) and `expr_params` (72). After the Y/Z axis flip, the max vertex error against SAM's `pred_vertices` was **5.96e-7 m** (limit 1e-4 m). Topology matches. |
| Rigged MHR GLB export and validation | PASS | Official MHR web-viewer exporter. Validator: 18,439 vertices, 36,874 triangles, 127 joints, max skin-weight-sum error 1.03e-7, bounds Y −0.034 to 1.727 m. The MHR asset is SHA-256 `352e271a…77bc`, identical to the checkpoint's bundled `assets/mhr_model.pt`. Export took 7.9 s on CPU. Pose is SAM's predicted pose; no neutralization or camera transform is applied. |
| Three.js GLTFLoader on the real GLB | PASS | `node tests/mhr-loader.test.mjs <real GLB>`: 18,439 vertices, 36,874 triangles, 127 joints, 1.761 m height. The neutral-demo control also passes (1.727 m). |
| Browser WebGL display of the reconstructed avatar | NOT TESTED | The `/lab` route serves only the fixed neutral demo GLB. No route serves reconstructed outputs, and no browser rendering was observed. |
| Shape fidelity / measurement accuracy | NOT TESTED | No ground truth was available. The qualitative side view shows a forward lean and a pronounced bulge. Do not use for sizing. **Correction (Sprint 0.5):** this row originally called it a "belly/hip bulge likely biased by loose pleated trousers". [Sprint 0.5](sprint-0.5-report.md) found the bulge is posterior (seat and lower back) and driven by the estimated hip and spine flexion; the trouser attribution was unsupported. |
| Existing reconstruction unit tests | PASS | `python -m unittest discover -s services/reconstruction/tests -q` (Windows MHR venv): 19 tests OK. |
| Private data and budget | PASS | Photo, preview, NPZ, GLB, logs and checkpoints stay in ignored local directories. No paid services were used. |

### Measured resource use

| Stage | Wall time | GPU memory |
| --- | --- | --- |
| Initialization probe (SAM only) | 23.5 s process, 16.6 s load | 3,668 MiB sampled peak; 3.54 GB PyTorch peak allocated |
| Full reconstruction (detector + SAM + inference + preview + save) | 115.6 s process | 5,984 MiB sampled dedicated peak plus 708 MiB shared spill; 6.46 GB PyTorch peak allocated |
| Inference only (`process_one_image`) | 13.23 s | included above |
| Failed first attempt (stopped at EGL) | 91.6 s process | same 5,984 MiB / 708 MiB pattern |
| MHR GLB export (Windows, CPU) | 7.9 s | none |

VRAM was sampled with `nvidia-smi --query-gpu=memory.used -lms 250` inside WSL and with Windows `\GPU Adapter Memory(*)\Dedicated Usage` and `\Shared Usage` counters every ~1.4 s. Sampled peaks can miss short spikes; PyTorch's `max_memory_allocated` is the exact allocator peak. Each process ran alone, with one model instance at a time.

### Environment change made this session

Added WSL user `levi` to the `render` and `video` groups so pyrender's EGL backend can open `/dev/dri`. Revert with `sudo gpasswd -d levi render && sudo gpasswd -d levi video`. No Python packages, PyTorch, Detectron2 or upstream source were modified.

### Reproduce

From the project root in WSL (`/mnt/d/Projects/outfitplannerapp/virtual-wardrobe`), with `PY=/home/levi/miniforge3/envs/sam_3d_body/bin/python`:

```bash
$PY -m pip check
$PY services/reconstruction/probe_detectron2_cuda.py
$PY services/reconstruction/probe_sam3d_initialization.py --checkpoint-dir /home/levi/sam3d-lab/checkpoints/sam-3d-body-dinov3
$PY services/reconstruction/reconstruct.py --input samples/input/person_front.jfif \
  --output outputs/<new-directory> \
  --checkpoint-dir /home/levi/sam3d-lab/checkpoints/sam-3d-body-dinov3 \
  --detector-dir external/checkpoints/vitdet
```

Then, from the project root in Windows PowerShell:

```powershell
.\external\mhr-venv\Scripts\python.exe services\reconstruction\sam3d_mhr_adapter.py --input outputs\<new-directory>\reconstruction.npz --output outputs\avatars\<name>.glb
cd apps\web; node tests\mhr-loader.test.mjs ..\..\outputs\avatars\<name>.glb
```

This session's outputs are `outputs/sam3d-person-front-sprint03-run2/` and `outputs/avatars/sam3d-person-front-sprint03-run2.{glb,json}`; all are ignored and private.

### Limitations

- **6 GiB is not enough on its own.** A machine or driver without system-memory fallback will likely OOM. Options to evaluate next: release the detector before loading SAM (they currently co-reside), run detection on CPU, or use reduced precision. All are untested.
- One photo, one person, front view, default FOV. There's no camera calibration, MoGe FOV estimation or mask conditioning.
- The GLB keeps SAM's estimated pose, and camera translation is not applied. A neutral "dressing pose" is still undesigned (see the [integration analysis](../architecture/sam3d-mhr-integration.md)).
- Loose clothing likely distorts shape estimates. Shape accuracy has not been measured.
- `pkg_resources` is deprecated in setuptools ≥ 81. The `setuptools==80.9.0` pin is required by Detectron2's LazyConfig.

### Next actions

1. Measure whether freeing the ViTDet detector before SAM loads keeps the pipeline within dedicated VRAM, and record any OOM behavior.
2. Add a local, non-public lab route or file picker that displays a reconstructed GLB, and verify WebGL rendering in a browser.
3. Try several authorized photos (different clothing, poses and framing) to judge shape robustness before relying on body shape.

## Preparation history (earlier snapshots; superseded where they differ from the outcome above)

**Paused at user request:** The official ViTDet checkpoint completed at 2,765,948,277 bytes, with locally computed SHA-256 `8601bc52000c8a87960f3db6a9672596c5e06ce33bc30a3b8f96a96efe42ae60`; its resumed ranges were checked against the source ETag and byte ranges, but no independently published SHA-256 was verified. A real reconstruction attempt reached GPU detection and was manually interrupted at the user's request while still running; it did not produce an inference result or GLB. The reconstruction process exited and released its GPU memory. Resume only when the user explicitly requests it; preserve the existing verified assets. A sampled GPU usage reached 5,981 MiB during detection, which is not a measured peak or an inference benchmark.

Latest Detectron2 result: **PASS**. The official revision was rebuilt with the separate CUDA 12.6 compiler, GCC 12 and header paths from the installed NVIDIA PyTorch packages. The compiled CUDA `nms_rotated` operator returned `tensor([0], device='cuda:0')`. `pip check` reported no broken requirements and the existing PyTorch/torchvision pair remained `2.7.1+cu126`/`0.22.1+cu126`. The complete build log is locally ignored at `external/detectron2-build-cuda-retry.log`. The upstream ViTDet checkpoint download is separate and incomplete; a passing operator test does not demonstrate detection or inference.

The official ViTDet LazyConfig initially failed because setuptools 84 did not supply `pkg_resources`. Pinning `setuptools==80.9.0` resolved the import; the configuration loaded as `DictConfig`, with a deprecation warning, and `pip check` remained clean. That pin is recorded in the provisional constraints. The official detector download is being resumed from its saved prefix using version-checked HTTP ranges; a read timeout occurred on the first parallel attempt and the ranges were resumed with retries. Incomplete parts must never be treated as the finished checkpoint.

Later execution: **SAM initialization PASS** on the RTX 3060 using `services/reconstruction/probe_sam3d_initialization.py`. The official loader returned an evaluation-mode model in 119.505 seconds, with peak PyTorch GPU allocation 3,538,315,264 bytes and reserved memory 3,730,833,408 bytes. These are initialization measurements, not inference benchmarks. The upstream loader used `strict=False` and printed a state-dictionary missing-keys warning, including MHR-related keys; its significance for inference is not yet established. Upstream also printed `Momentum is not enabled` and downloaded its DINOv3 code through Torch Hub. No photograph was processed in this initialization test.

The official dependencies completed; CUDA PyTorch remained 2.7.1+cu126 and a fresh GPU calculation passed. Detectron2 distribution metadata identifies the official revision `a1ce2f956a1d2212ad672e3c47d53405c2fe4312`. Its installed CUDA operator test failed explicitly with `RuntimeError: Detectron2 is not compiled with GPU support!`. An `iopath` dependency conflict was fixed using `iopath==0.1.9`, after which `pip check` reported no broken requirements; the version is included in the provisional constraints. A separate CUDA 12.6.20 compiler in ignored `external/sam3d-cuda126` is installed. The first CUDA rebuild failed, and the GCC 12 retry's logged concrete error was `fatal error: cusparse.h: No such file or directory`; the required header exists under the installed NVIDIA PyTorch package. A further build using those header paths was started. Until a CUDA operator actually succeeds, Detectron2 GPU readiness is **FAIL**.

The checkpoint download completed after the initial snapshot below. The official `hf cache verify facebook/sam-3d-body-dinov3 --local-dir /home/levi/sam3d-lab/checkpoints/sam-3d-body-dinov3 --fail-on-missing-files` reported **all five files verified**. SHA-256: `model.ckpt` `b5a2f9d305dd02626b967aa2e86021fba07065df66ce7a7e00ffb9664f150abf`; `assets/mhr_model.pt` `352e271a6c42729c68554ceaea0c955e866970160c31e35506d782dc0f7377bc`. The official MHR file loaded as a TorchScript `RecursiveScriptModule` on CPU. This does not initialize SAM.

The official SAM source checkout is available directly from WSL at `/mnt/d/Projects/outfitplannerapp/virtual-wardrobe/external/sam-3d-body`, origin `https://github.com/facebookresearch/sam-3d-body.git`, revision `b5c765a0d89d789985e186d396315e7590887b94`. A fresh CUDA matrix multiplication again passed with PyTorch 2.7.1+cu126 and torchvision 0.22.1+cu126. Importing `sam_3d_body` in that environment failed with `ModuleNotFoundError: No module named 'cv2'`, before model initialization; the already-running official dependency installation had not yet installed its downloaded wheels at that moment.

Because CUDA compilation tools were absent, a separate ignored Conda prefix was started with `conda create -y -p /mnt/d/Projects/outfitplannerapp/virtual-wardrobe/external/sam3d-cuda126 -c nvidia/label/cuda-12.6.0 cuda-nvcc=12.6 cuda-cudart-dev=12.6 cuda-cccl=12.6`. This is separate from the existing PyTorch environment; until it completes and is tested it is not evidence that Detectron2 builds. The official ViTDet weights specified in upstream `tools/build_detector.py` are being downloaded with resumable `curl` into the ignored `external/checkpoints/vitdet/model_final_f05665.pkl.part`. The final `.pkl` must only be made available to the adapter after the download succeeds and is verified; `.part` is not a usable model. The original constrained dependency installer continues in the SAM environment, so do not run another installer concurrently against it.

At the earlier snapshot immediately after asset verification, SAM import was blocked on the dependency installation. That has since changed: see the successful initialization and Detectron2 findings above. The detector weights and CUDA extension rebuild remain in progress; real inference, inference benchmarks and real-parameter GLB export have not yet been performed. The historical table below records the earlier snapshot and is superseded where this continuation differs.

### Earlier milestone snapshot (superseded)

| Milestone | Status | Evidence |
| --- | --- | --- |
| WSL2 and NVIDIA device | PASS | Ubuntu running; WSL `nvidia-smi` detected RTX 3060 Laptop GPU, 6,144 MiB. |
| CUDA-enabled PyTorch execution | PASS | In `/home/levi/miniforge3/envs/sam_3d_body`: Python 3.11.18, PyTorch 2.7.1+cu126, torchvision 0.22.1+cu126, CUDA runtime version 12.6. `torch.cuda.is_available()` was true; a 1,024 × 1,024 GPU matrix multiplication returned 1,073,741,824. Peak allocated for this smoke test was 16,909,824 bytes, **not model inference memory**. |
| Official installation compatibility | BLOCKED | [Official installation instructions](https://github.com/facebookresearch/sam-3d-body/blob/main/INSTALL.md) specify Python 3.11, PyTorch, dependencies and Detectron2 revision `a1ce2f9`. Python and CUDA execution work; the full dependency set, Detectron2 and compatibility are not yet verified. |
| Hugging Face authentication and access | PASS | `hf auth whoami` reported logged in; user reports approval, and authenticated official repository metadata was accessible. No token was printed. |
| Approved official checkpoint | BLOCKED | Official `hf download --dry-run` listed 5 files totalling 2.8 GB, including `model.ckpt` (2.1 GB) and `assets/mhr_model.pt` (696.1 MB). An existing separate official download under `/home/levi/sam3d-lab/checkpoints/sam-3d-body-dinov3` is still in progress; incomplete files are not usable. An initially launched duplicate download in the project's ignored external directory was stopped when the other process was discovered. |
| Python dependencies | BLOCKED | Official dependency installation was started with the CUDA torch pair constrained. Downloads are unusually slow; completion and imports are not yet verified. [`constraints-sam3d-cu126.txt`](../../services/reconstruction/constraints-sam3d-cu126.txt) is a provisional constraints file, **not** a fully tested lockfile. |
| Detectron2 | BLOCKED | Not installed or built in this experiment; `nvcc` was not found on the WSL PATH and the environment had no `cuda-nvcc` conda package. CUDA extension build and detector assets remain to be addressed. |
| Authorized input image | PASS | The user explicitly authorized `samples/input/person_front.jfif`; existing image validation read 736 × 1,104 pixels. A person detection or full-body visibility check did not run. |
| Official model initialization and inference | BLOCKED | Required checkpoint files and dependencies were incomplete at assessment. No model initialization, inference, or out-of-memory event occurred. |
| Inference time / peak GPU memory | NOT TESTED | No inference was run. No claim is made that the model fits in 6 GiB VRAM. |
| Real SAM-to-MHR mapping and rigged export | BLOCKED | Depends on real inference output. Existing synthetic adapter tests are not evidence of real parameter mapping. |
| Validate real reconstructed GLB / Three.js loader | NOT TESTED | No reconstructed GLB was produced. The existing neutral MHR demo is separate. |
| Existing reconstruction tests | PASS | `python -m unittest discover -s services/reconstruction/tests -q` with the Windows MHR venv: 19 tests passed. |
| Private data and budget | PASS | No photo, token, checkpoint or generated avatar was committed. No paid services used. |

### Earlier environment and experiment details

The user's existing Miniforge SAM environment is separate from the Windows MHR environment and frontend. The approved checkpoint remains official `facebook/sam-3d-body-dinov3`. The CLI requires all three model assets (`model.ckpt`, `model_config.yaml`, `assets/mhr_model.pt`) and official ViTDet detector weights; the latter must also be obtained from the upstream documented source before using the existing detection adapter. No second SAM model or unofficial checkpoint was used. Model initialization, person detection and image processing beyond basic validation were not performed.

Package installation was started following upstream's dependency list with explicit constraints on the installed torch and torchvision versions, upstream's networkx version, and provisional NumPy/OpenCV versions. Constraints minimize accidental PyTorch replacement but do not establish compatibility. The repository's adapter catches inference and setup exceptions and reports errors without publishing a completed result; out-of-memory behavior has not been exercised and GPU memory feasibility is unknown. Once dependencies and assets are ready, record installed versions (`pip freeze`), verify imports and Detectron2 CUDA extensions, then execute the existing CLI on the authorized sample and preserve the actual metadata, inference time, peak allocation and any failure. If inference succeeds, validate the resulting real parameter arrays and use the MHR exporter and both validators; do not substitute the demo GLB.

### Earlier commands and observations

Commands below were run in host-authorized WSL context, except the last two Windows project commands. No credential value was emitted.

```text
wsl --list --verbose
wsl -d Ubuntu -- nvidia-smi
wsl -d Ubuntu -- /home/levi/miniforge3/envs/sam_3d_body/bin/python -c 'import torch,torchvision;print(torch.__version__);print(torchvision.__version__);print(torch.version.cuda);print(torch.cuda.is_available());print(torch.cuda.get_device_name(0));x=torch.ones((1024,1024),device=0);print((x@x).sum().item());torch.cuda.synchronize();print(torch.cuda.max_memory_allocated())'
wsl -d Ubuntu -- /home/levi/miniforge3/envs/sam_3d_body/bin/hf auth whoami
wsl -d Ubuntu -- /home/levi/miniforge3/envs/sam_3d_body/bin/hf download facebook/sam-3d-body-dinov3 --dry-run
wsl -d Ubuntu -- /home/levi/miniforge3/envs/sam_3d_body/bin/hf download facebook/sam-3d-body-dinov3 --local-dir /mnt/d/Projects/outfitplannerapp/virtual-wardrobe/external/checkpoints/sam-3d-body-dinov3  # stopped duplicate after discovering another transfer
wsl -d Ubuntu -- /home/levi/miniforge3/envs/sam_3d_body/bin/python -m pip install -c /mnt/d/Projects/outfitplannerapp/virtual-wardrobe/services/reconstruction/constraints-sam3d-cu126.txt pytorch-lightning pyrender opencv-python yacs scikit-image einops timm dill pandas rich hydra-core hydra-submitit-launcher hydra-colorlog pyrootutils webdataset chump networkx==3.2.1 roma joblib seaborn wandb appdirs appnope ffmpeg cython jsonlines pytest xtcocotools loguru optree fvcore black pycocotools tensorboard huggingface_hub
wsl -d Ubuntu -- /home/levi/miniforge3/bin/conda list -n sam_3d_body cuda-nvcc  # no match
wsl -d Ubuntu -- which nvcc  # absent
.\external\mhr-venv\Scripts\python.exe -m unittest discover -s services\reconstruction\tests -q  # 19 PASS
.\external\mhr-venv\Scripts\python.exe -c "import sys;sys.path.insert(0,'services/reconstruction');from reconstruct import validate_image;from pathlib import Path;im=validate_image(Path('samples/input/person_front.jfif'));print('validated dimensions:',im.size)"  # 736 x 1104
```

At the last observed download snapshot the separate official transfer contained incomplete files of 1,633,001,594 and 180,110,580 bytes; do not treat byte counts or small downloaded metadata as checkpoint completion. Package downloads observed around 38–45 kB/s, including a 62.5 MB OpenCV wheel. At the last process check the dependency install (WSL PID 1498) and pre-existing checkpoint transfer (WSL PID 1673) were still running. The initial duplicate was terminated; the separate existing transfer was not disturbed. These PIDs and transfer states are point-in-time observations and may change.

### Earlier next action (completed)

Allow the existing official checkpoint download and constrained dependency install to finish, then verify actual file presence, importability and CUDA Detectron2 support before running the reconstruction command. If the install or transfer fails, capture the exact error and retry via the official mechanisms. Avoid concurrent modifications to the same environment. No cloud GPU or paid service is required for these preparation steps.
