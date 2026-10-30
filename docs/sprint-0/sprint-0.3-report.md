# Sprint 0.3 — SAM 3D Body reconstruction experiment

## Continuation: approved assets verified

The checkpoint download completed after the initial snapshot below. The official `hf cache verify facebook/sam-3d-body-dinov3 --local-dir /home/levi/sam3d-lab/checkpoints/sam-3d-body-dinov3 --fail-on-missing-files` reported **all five files verified**. SHA-256: `model.ckpt` `b5a2f9d305dd02626b967aa2e86021fba07065df66ce7a7e00ffb9664f150abf`; `assets/mhr_model.pt` `352e271a6c42729c68554ceaea0c955e866970160c31e35506d782dc0f7377bc`. The official MHR file loaded as a TorchScript `RecursiveScriptModule` on CPU. This does not initialize SAM.

The official SAM source checkout is available directly from WSL at `/mnt/d/Projects/outfitplannerapp/virtual-wardrobe/external/sam-3d-body`, origin `https://github.com/facebookresearch/sam-3d-body.git`, revision `b5c765a0d89d789985e186d396315e7590887b94`. A fresh CUDA matrix multiplication again passed with PyTorch 2.7.1+cu126 and torchvision 0.22.1+cu126. Importing `sam_3d_body` in that environment failed with `ModuleNotFoundError: No module named 'cv2'`, before model initialization; the already-running official dependency installation had not yet installed its downloaded wheels at that moment.

Because CUDA compilation tools were absent, a separate ignored Conda prefix was started with `conda create -y -p /mnt/d/Projects/outfitplannerapp/virtual-wardrobe/external/sam3d-cuda126 -c nvidia/label/cuda-12.6.0 cuda-nvcc=12.6 cuda-cudart-dev=12.6 cuda-cccl=12.6`. This is separate from the existing PyTorch environment; until it completes and is tested it is not evidence that Detectron2 builds. The official ViTDet weights specified in upstream `tools/build_detector.py` are being downloaded with resumable `curl` into the ignored `external/checkpoints/vitdet/model_final_f05665.pkl.part`. The final `.pkl` must only be made available to the adapter after the download succeeds and is verified; `.part` is not a usable model. The original constrained dependency installer continues in the SAM environment, so do not run another installer concurrently against it.

Current milestone status: official checkpoint **PASS**; official MHR CPU load **PASS**; CUDA PyTorch smoke test **PASS**; SAM import/initialization **BLOCKED** on dependency installation; Detectron2 and detector weights **BLOCKED** while setup is in progress; real inference, inference benchmarks and real-parameter GLB export **NOT TESTED**. No model output or VRAM benchmark is claimed. The historical table below records the earlier snapshot and is superseded where this continuation differs.

## Milestones

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

## Environment and experiment details

The user's existing Miniforge SAM environment is separate from the Windows MHR environment and frontend. The approved checkpoint remains official `facebook/sam-3d-body-dinov3`. The CLI requires all three model assets (`model.ckpt`, `model_config.yaml`, `assets/mhr_model.pt`) and official ViTDet detector weights; the latter must also be obtained from the upstream documented source before using the existing detection adapter. No second SAM model or unofficial checkpoint was used. Model initialization, person detection and image processing beyond basic validation were not performed.

Package installation was started following upstream's dependency list with explicit constraints on the installed torch and torchvision versions, upstream's networkx version, and provisional NumPy/OpenCV versions. Constraints minimize accidental PyTorch replacement but do not establish compatibility. The repository's adapter catches inference and setup exceptions and reports errors without publishing a completed result; out-of-memory behavior has not been exercised and GPU memory feasibility is unknown. Once dependencies and assets are ready, record installed versions (`pip freeze`), verify imports and Detectron2 CUDA extensions, then execute the existing CLI on the authorized sample and preserve the actual metadata, inference time, peak allocation and any failure. If inference succeeds, validate the resulting real parameter arrays and use the MHR exporter and both validators; do not substitute the demo GLB.

## Commands and observations

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

## Next action

Allow the existing official checkpoint download and constrained dependency install to finish, then verify actual file presence, importability and CUDA Detectron2 support before running the reconstruction command. If the install or transfer fails, capture the exact error and retry via the official mechanisms. Avoid concurrent modifications to the same environment. No cloud GPU or paid service is required for these preparation steps.
