# Environment setup

## Frontend on Windows

Use a supported Node.js release and npm. This foundation was audited using Node 24.18.0 and npm 11.16.0. From the repository root:

```powershell
npm.cmd ci
npm.cmd run dev
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run build
```

`npm.cmd` bypasses this machine's PowerShell script execution restriction without changing system policy. The lockfile pins the installed dependency tree. Tests are not yet defined; the workspace test command succeeds without running tests.

## Future AI environment

First verify `wsl --status`, `wsl --list --verbose` and `nvidia-smi` inside an existing WSL2 Ubuntu distribution in a normal Windows session. Install WSL or GPU drivers only following [Microsoft's WSL installation](https://learn.microsoft.com/windows/wsl/install) and [NVIDIA's CUDA on WSL guide](https://docs.nvidia.com/cuda/wsl-user-guide/), with appropriate system permissions. The audit session could not inspect WSL.

Use an isolated Python 3.11 environment and follow the [official SAM 3D Body installation](https://github.com/facebookresearch/sam-3d-body/blob/main/INSTALL.md) and the [PyTorch installation selector](https://pytorch.org/get-started/locally/). Record exact CUDA, PyTorch, upstream commit and dependency versions after installation. The driver-reported CUDA version does not establish toolkit or PyTorch compatibility. The official guide requires access approval for gated model checkpoints; authenticate locally without recording or committing tokens. Keep research clones under `external/`, photos in `samples/input/`, and artifacts in `outputs/`. Check licenses before obtaining assets. None of these AI installation steps has been performed.

If 6 GiB proves insufficient, consider a temporary Linux cloud GPU with at least 16 GiB VRAM and benchmark the chosen configuration; costs and availability vary. Do not provision resources without an explicit decision.

## Troubleshooting

- PowerShell blocks `npm.ps1`: use `npm.cmd`.
- WSL access denied: check in a normal user session and consult the WSL diagnostics; do not assume it is absent.
- CUDA unavailable in PyTorch: verify WSL GPU visibility, driver, selected PyTorch build and toolkit separately.
- Out of memory: record peak allocation, configuration, and failure; try a smaller supported configuration or a larger GPU rather than claiming success.
