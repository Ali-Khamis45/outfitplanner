# Sprint 0.1 stabilization report

Date: 2026-10-31. This is a local, zero-cost assessment of the existing implementation; no gated checkpoint was downloaded and no photograph was processed. Sprint 0 end-to-end reconstruction remains **BLOCKED**.

## Acceptance results

| Criterion | Status | Evidence and limits |
| --- | --- | --- |
| Existing `/lab` server responds | PASS | The already-running local server returned HTTP 200 at `127.0.0.1:3000/lab`; it was not restarted. This is an HTTP check, not browser rendering. |
| Actual MHR GLB served | PASS | `/api/demo-avatar` returned 1,374,992 bytes and SHA-256 `6a1050b05c4345d8244fc1f66399776d1982d88f67fe4ff08c86295041686fb3`, identical to `outputs/avatars/mhr-neutral.glb`. The route reads that fixed local file and `AvatarModel` uses `useGLTF` and requires a skinned mesh. |
| MHR geometry and skinning | PASS | Python validator: 18,439 vertices, 36,874 triangles, 127 joints, max weight-sum error 1.035e-7. Three.js GLTFLoader independently parsed the asset. This establishes asset structure, not visual quality or animation. |
| GLB scale and orientation | NOT TESTED | The asset validator reports a 1.727 m Y extent and the documented official viewer convention of metres and +Y up; face orientation, grounding, and visual proportions were not checked in a browser. |
| Visual MHR rendering | NOT TESTED | Browser access host and native browser pipe were unavailable. HTTP and loader checks do not prove WebGL rendered the model. |
| Front, back, left, right and reset views | NOT TESTED | Camera preset implementation was inspected; actual view directions and interaction were not exercised. |
| Orbit and zoom | NOT TESTED | OrbitControls exists in the code; browser interaction unavailable. |
| Skeleton and wireframe toggles | NOT TESTED | Controls and `SkeletonHelper`/material wireframe handling exist; visual behavior unavailable. |
| Screenshot | NOT TESTED | No browser download or screenshot verified. |
| Responsive layout | NOT TESTED | No desktop or mobile viewport executed. |
| Browser console / WebGL errors | NOT TESTED | No browser execution or console access. |
| Browser FPS and avatar load time | NOT TESTED | Neither browser performance nor a rendering benchmark was available. |
| TypeScript, lint and loader test | PASS | `npm.cmd run typecheck`, `npm.cmd run lint` and `npm.cmd test` passed. |
| Reconstruction unit tests | PASS | 19 Python tests passed, including failure paths and synthetic SAM-to-MHR adapter data. Synthetic tests do not demonstrate real inference. |
| Official MHR web-viewer tests | PASS | 26 passed; pytest could not write its cache due to access permissions. |
| Production build in this run | FAIL | `npm.cmd run build` failed with `EPERM` opening `.next/trace` and `.next/trace-build`, followed by an access-denied lockfile error. A dev server was already running; the precise cause was not established. A previous report records a successful build, but that does not make this run a pass. Retry in an exclusive session after coordinating the existing server and permissions. |
| WSL status and host resource diagnosis | PASS | Read-only host status, RAM, pagefile, configuration and recent event metadata were collected. The WSL startup error was reproduced; root cause is undetermined. |
| Stable WSL startup | FAIL | `wsl -d Ubuntu -- cat /proc/meminfo` failed with `Wsl/Service/CreateInstance/CreateVm/HCS/ERROR_NO_SYSTEM_RESOURCES`. Intermittent behavior was reported previously; this run proves one failure, not its frequency. |
| WSL effective memory, swap and GPU visibility | BLOCKED | Ubuntu failed before `/proc/meminfo`, `/etc/wsl.conf`, and WSL `nvidia-smi` could be inspected. |
| CUDA-ready SAM environment | BLOCKED | Ubuntu cannot start, the isolated AI environment is incomplete, and CUDA PyTorch/Detectron2 imports were not verified. The Windows MHR environment has CPU-only PyTorch. |
| Official checkpoint and real inference | BLOCKED | User reports `facebook/sam-3d-body-dinov3` access pending approval. No access retry, download or inference attempted. |
| Photo-to-rigged-avatar end-to-end validation | BLOCKED | No real SAM output, corresponding export, or browser rendering has been verified. |

## Asset and implementation

The Three.js loader test and independent `validate_glb.py` check the actual exported MHR asset. Its measured bounds are X −0.6532 to 0.6532, Y −0.00059 to 1.72623, and Z −0.13894 to 0.25613, in the documented metre convention. `AvatarModel.tsx` loads the fixed local demo route, clones its skeleton and rejects absent skinning attributes; a successful code inspection does not prove a visible, correctly oriented model. The SAM adapter tests evaluate the official MHR model using synthetic inputs and do not validate mapping from real SAM inference. The local demo asset is a research asset and is excluded from Git.

## Manual browser verification procedure

1. From the project root, if no server is already running, start `npm.cmd run dev --workspace @virtual-wardrobe/web -- --hostname 127.0.0.1`. Open `http://127.0.0.1:3000/lab` in a WebGL-capable browser.
2. With developer tools open, verify that `/api/demo-avatar` returns successfully and that a full-body MHR mesh appears; record console and WebGL errors. Check whether the feet sit on the floor, the body is upright and the apparent front is correct. Do not infer face direction solely from the GLB bounds.
3. Click front, back, left, right and reset; confirm each view, drag to orbit and use the wheel or trackpad to zoom. Toggle skeleton and wireframe independently and together; confirm both return to normal.
4. Use the screenshot button and open the downloaded image to check its contents. Test at approximately 1440 × 900 and 390 × 844, including access to controls, scrolling and absence of clipped canvas. Record actual FPS and asset load time only if measured, along with browser, GPU and viewport.
5. Save only non-personal demo evidence under ignored `outputs/`; report actual results and errors. The browser checklist remains **NOT TESTED** until performed.

## WSL and GPU diagnostics

At the time of the host snapshot, Windows 10 Home 10.0.19045 reported 20,820,028 KiB visible physical RAM, 6,951,392 KiB free; virtual memory total 30,481,220 KiB and free 4,166,272 KiB. The Windows pagefile reported 9,434 MiB allocated, 1,493 MiB current and 2,145 MiB peak usage. These are point-in-time values; they do not establish why VM creation failed. WSL version was 3.0.3.0, kernel 6.18.54.1-1; Ubuntu and docker-desktop were listed as stopped WSL2 distributions before the Ubuntu launch attempt. Sandboxed WSL enumeration initially returned `E_ACCESSDENIED`, while the host-context read succeeded; this differs from the reproduced HCS error.

`C:\Users\levi\.wslconfig` was absent when checked. Microsoft's [WSL configuration reference](https://learn.microsoft.com/en-us/windows/wsl/wsl-config) documents default VM memory of 50% of Windows memory and swap of 25% of Windows memory rounded up to the nearest GB. These are documented defaults, not measurements of this failed VM; effective limits and per-distro settings could not be checked. No settings were changed and WSL was not shut down. The Hyper-V Compute Admin log query returned no matching events within the preceding three hours; this does not exclude other causes or logs. Follow [Microsoft's WSL troubleshooting guidance](https://learn.microsoft.com/en-us/windows/wsl/troubleshooting), capturing Windows/WSL/kernel versions, reproduction steps and relevant diagnostics when the failure recurs. Investigate commit pressure and other resource constraints before proposing any configuration change; do not assume memory pressure is the confirmed root cause.

Host `nvidia-smi` identified an NVIDIA GeForce RTX 3060 Laptop GPU, 6,144 MiB VRAM, driver 610.62, and 5,997 MiB free at the query. Its CUDA UMD 13.3 display is a driver capability indicator, not proof of an installed CUDA toolkit or compatible PyTorch. `nvcc` was not found on the Windows PATH. Windows MHR venv PyTorch is `2.7.1+cpu`, `torch.version.cuda` is `None`, and `torch.cuda.is_available()` is false. WSL GPU availability and the AI environment's PyTorch build are **BLOCKED**, not inferred from the host GPU.

## Local AI readiness plan

The checked-in setup notes identify an isolated WSL Pixi Python 3.11 environment whose attempted CUDA PyTorch installation was interrupted. The [official installation guide](https://github.com/facebookresearch/sam-3d-body/blob/main/INSTALL.md) asks for Python 3.11, PyTorch, its listed packages and Detectron2 revision `a1ce2f9`; optional components are separate. Current dependency compatibility, CUDA access and detector build remain unverified. The inspected upstream estimator sends batches to CUDA; CPU inference must not be assumed to work.

1. Restore reliable Ubuntu startup using read-only diagnostics and appropriately authorized system maintenance. Once Ubuntu starts, inspect `/proc/meminfo`, `/etc/wsl.conf`, `nvidia-smi`, and the isolated environment without changing system-wide settings.
2. Complete the upstream-compatible isolated installation, validate CUDA-enabled PyTorch and Detectron2 imports, and record package versions and GPU visibility. Avoid contaminating the working CPU MHR environment. Determine whether a compiler/toolkit is actually needed for the selected build.
3. Wait for explicit approval of the official gated checkpoint before any download. Then obtain only official permitted assets, run with an authorized full-body photo and record inference time and peak GPU allocation. Keep inputs, outputs, credentials and checkpoints ignored by Git.
4. Treat 6 GiB VRAM as an unproven constraint: the model and detector may exceed it. If CUDA reports out of memory, record the failure and peak memory rather than claim success; use only officially supported lower-memory options if available and verified. No paid service or unofficial checkpoint is planned.

## Commands and observed results

Commands were run from the project root unless stated. Browser verification used the computer-use surface, whose inventory reported no browsers and an unavailable browser access host/native pipe.

```powershell
npm.cmd run typecheck                  # PASS
npm.cmd run lint                       # PASS
npm.cmd test                           # PASS: Three.js GLTFLoader, 18,439 vertices / 36,874 triangles / 127 joints
.\external\mhr-venv\Scripts\python.exe -m unittest discover -s services\reconstruction\tests -v  # PASS: 19
.\external\mhr-venv\Scripts\python.exe services\reconstruction\validate_glb.py outputs\avatars\mhr-neutral.glb  # PASS
npm.cmd run build                      # FAIL: EPERM on .next trace and lockfile
# From external/MHR/web-viewer:
..\..\mhr-venv\Scripts\python.exe -m pytest tests -q  # PASS: 26; cache warning
wsl --version                          # PASS: version and kernel reported
wsl --status                           # sandbox denied; host context PASS
wsl --list --verbose                   # sandbox denied; host context PASS
wsl -d Ubuntu -- cat /proc/meminfo     # FAIL: HCS/ERROR_NO_SYSTEM_RESOURCES
nvidia-smi                             # PASS: host GPU/driver only
nvidia-smi --query-gpu=name,memory.total,memory.free,driver_version --format=csv  # PASS
nvcc --version                         # NOT FOUND on Windows PATH
.\external\mhr-venv\Scripts\python.exe -c "import torch; print(torch.__version__, torch.version.cuda, torch.cuda.is_available())"  # CPU-only
Get-CimInstance Win32_OperatingSystem   # host context: PASS; sandbox denied
Get-CimInstance Win32_PageFileUsage    # host context: PASS; sandbox denied
Get-FileHash outputs\avatars\mhr-neutral.glb -Algorithm SHA256  # PASS
```

Additional read-only PowerShell checks inspected `.wslconfig`, enumerated Hyper-V log names via `wevtutil el`, queried recent Hyper-V Compute Admin events via `Get-WinEvent`, requested `/lab` and `/api/demo-avatar` with `Invoke-WebRequest`, and hashed response bytes. The HTTP server was already running; no new browser or server process was started. No official research source or system configuration was modified.

## Recommended next action

Perform the manual browser checklist on the existing local server and capture non-personal evidence. In parallel, diagnose WSL startup using the recorded failure and host commit/resource information; make system changes only after explaining and obtaining any required approval. When checkpoint access is approved and WSL CUDA is demonstrably usable, run and benchmark the real photo-to-GLB path. Until those checks pass, neither visual lab operation nor Sprint 0 end-to-end reconstruction is verified.
