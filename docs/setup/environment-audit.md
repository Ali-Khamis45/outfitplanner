# Environment audit — 2026-10-30

Observed in the provided Windows session; availability can differ outside its sandbox.

Update: a subsequent elevated WSL inspection found Ubuntu 26.04 on WSL2 and NVIDIA GPU visibility. Later WSL starts failed with `HCS/ERROR_NO_SYSTEM_RESOURCES`; see [MHR setup](mhr.md).

| Item | Result |
| --- | --- |
| OS and architecture | Windows 10 Home 22H2, build 19045, x64 |
| Node / npm | Node v24.18.0; npm 11.16.0 via `npm.cmd`. PowerShell blocks `npm.ps1`. |
| Python / Conda | Python 3.11.15 in an existing Hermes virtual environment; `py` reports no installed Python; `conda` not on PATH. Do not install research dependencies into that unrelated environment. |
| Git | 2.54.0.windows.1 |
| GPU | NVIDIA GeForce RTX 3060 Laptop GPU; 6144 MiB VRAM; WDDM. |
| Driver / CUDA | NVIDIA driver 610.62; `nvidia-smi` reports CUDA UMD 13.3 (driver capability, not an installed toolkit). `nvcc` not on PATH. |
| PyTorch | Not installed in the inspected Python environment, so PyTorch/CUDA compatibility and actual CUDA execution are unverified. |
| RAM | 21,319,708,672 bytes (~19.86 GiB) total; 6,880,800,768 bytes (~6.41 GiB) available at observation. |
| WSL2 | `wsl.exe` exists, but `wsl --status` and `wsl --list --verbose` returned access denied in this session. Installed distributions, WSL version and GPU access are unknown. |

## Assessment

Local inference is **possible but not established**. The upstream [installation guide](https://github.com/facebookresearch/sam-3d-body/blob/main/INSTALL.md) specifies Python 3.11, PyTorch, Detectron2 and gated checkpoints but gives no minimum VRAM. The 6 GiB GPU may fit some configurations but is tight for the complete pipeline; an upstream [experimental offloading pull request](https://github.com/facebookresearch/sam-3d-body/pull/130) reports a roughly 6.5 GB peak in its setup, not a universal requirement. Measure the selected model, detector and image configuration before deciding. No inference, checkpoint access, CUDA PyTorch, or export has been tested.

Prefer a separate WSL2 Ubuntu AI environment due to Linux-oriented research dependencies and Detectron2 build complexity; keep the Next.js frontend on Windows. WSL is not verified here and must be checked in a normal user session. If local memory or compatibility blocks experiments, use a temporary Linux cloud instance with an NVIDIA GPU of at least 16 GiB VRAM as an initial experiment target, subject to measurement and provider availability. No cloud resources have been provisioned. Model access and license conditions still apply.
