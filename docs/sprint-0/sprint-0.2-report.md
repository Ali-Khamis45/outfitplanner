# Sprint 0.2 — browser verification and environment recovery

Date: 2026-10-31. Scope: existing MHR asset and Avatar Lab, build reliability, and non-destructive WSL diagnostics. No personal photos, gated checkpoints, inference, paid resources, application features, system settings, or research source files were changed. Sprint 0 end-to-end reconstruction remains **BLOCKED**.

## Acceptance matrix

| Criterion | Status | Actual evidence |
| --- | --- | --- |
| Production build in host context | PASS | `npm.cmd run build` passed twice consecutively, with the project dev server stopped. Routes include `/lab` and `/api/demo-avatar`. |
| Production build in restricted execution context | FAIL | After stopping the project dev server, the same command still returned `EPERM` opening `.next/trace` and `.next/trace-build`, then access denied acquiring a lockfile. |
| Exact build denial mechanism | NOT TESTED | Context affects the result, but the precise filesystem security or locking mechanism was not established. |
| `/lab` and local asset HTTP response | PASS | Restored local dev server: `/lab` and `/api/demo-avatar` both returned 200. The served asset is 1,374,992 bytes and its SHA-256 matches the existing MHR export. HTTP success is not a rendering test. |
| MHR skinned asset structure | PASS | Python validator and Three.js GLTFLoader: 18,439 vertices, 36,874 triangles, 127 joints, maximum skin-weight sum error 1.035e-7. |
| Browser displays actual MHR model | NOT TESTED | Browser automation inventory had no browser and reported the browser access host and native pipe unavailable. |
| Front, back, left, right and reset | NOT TESTED | No browser interaction. |
| Orbit and zoom | NOT TESTED | No browser interaction. |
| Skeleton and wireframe | NOT TESTED | No browser interaction. |
| Screenshot export | NOT TESTED | No browser execution or download. |
| Fullscreen | NOT TESTED | No browser execution. |
| Responsive layout | NOT TESTED | No viewport execution. |
| Console and WebGL errors | NOT TESTED | No browser console available. |
| Model visually upright, undistorted and facing correctly | NOT TESTED | Bounds and documented +Y/metre conventions were validated structurally, not visually. |
| Browser FPS | NOT TESTED | No browser measurements. |
| WSL startup on this attempt | PASS | `wsl -d Ubuntu -- cat /proc/meminfo` succeeded; WSL subsequently listed Ubuntu running. Prior HCS failure was intermittent, so continued reliability is not established. |
| Root cause of intermittent WSL HCS failure | NOT TESTED | Current successful launch and snapshots do not explain the prior `HCS/ERROR_NO_SYSTEM_RESOURCES`. |
| NVIDIA GPU visibility in WSL | PASS | Ubuntu `nvidia-smi` showed RTX 3060 Laptop GPU, 6,144 MiB VRAM, Windows kernel driver 610.62. |
| CUDA-enabled PyTorch in isolated SAM environment | FAIL | Isolated Pixi Python 3.11.18 returned `ModuleNotFoundError: No module named 'torch'`. A CUDA tensor operation was therefore not run. |
| Official checkpoint and real SAM inference | BLOCKED | User reports official gated checkpoint access pending; no access retry, download or inference was attempted. Model fit in 6 GiB is unverified. |
| Existing tests | PASS | Typecheck, lint, Three.js loader, 19 Python tests, 26 official MHR viewer tests and GLB validator passed. MHR viewer pytest reported a cache-write permission warning. |

## Build investigation

Host process inspection identified the server on `127.0.0.1:3000` as PID 36208 (`next/dist/server/lib/start-server.js`) with Next dev parent PID 17740, project npm PID 18548 and a project Turbopack worker PID 772. Other Node processes belonged to unrelated tools and were not stopped. After revalidating their command lines, PIDs 772 and 36208 were stopped; the remaining two had already exited and were skipped. No source or generated cache was deleted. The restored development server is listening at `http://127.0.0.1:3000`.

The `.next` directory and trace files were owned by the host user and their displayed ACLs included modify rights for the sandbox group and authenticated users. Nevertheless, a sandbox build failed on `.next/trace`, `.next/trace-build` and lock acquisition even after the dev server was stopped. Two sequential host-context builds then succeeded without cache cleanup. This controlled comparison implicates a difference in execution context or access to generated files; it does **not** prove whether the exact issue was sandbox policy, a Windows access check, a lock, or some other interaction. Concurrent dev execution alone cannot explain the isolated sandbox retry. Production builds are reproducible in the host context used here; the restricted context failure remains open. The generated `next-env.d.ts` changed during build and returned to its prior state when the dev server restarted.

## Browser verification and manual checklist

The computer-use inventory reported no available browsers: `Computer Use native pipe is unavailable` and `browser access host is unavailable`. No screenshots, FPS values or claims of visual execution are available. Asset routing and parser tests are useful but do not substitute for a rendered frame. The served SHA-256 was `6a1050b05c4345d8244fc1f66399776d1982d88f67fe4ff08c86295041686fb3`, matching `outputs/avatars/mhr-neutral.glb`; the lab code uses the demo route and checks for a skinned mesh.

To complete the **NOT TESTED** browser items:

1. Open `http://127.0.0.1:3000/lab` in a WebGL-capable browser. If the local server is no longer running, start it from the project root with `npm.cmd run dev --workspace @virtual-wardrobe/web -- --hostname 127.0.0.1`.
2. Open developer tools; confirm `/api/demo-avatar` succeeds, the full-body model renders, and the console contains no rendering or WebGL errors. Check posture, proportions, floor contact, front direction and absence of visible distortion. Record browser and GPU.
3. Exercise front, back, left, right and reset views; orbit with pointer drag and zoom with wheel or trackpad. Toggle skeleton and wireframe separately and together, and verify each reverses cleanly.
4. Enter and exit fullscreen. Export a screenshot and open the downloaded file to verify it contains the model. Keep any captured demo evidence under ignored `outputs/`.
5. Repeat at roughly 1440 × 900 and 390 × 844, checking usable controls, scrolling and canvas layout. Record FPS or loading time only if actually measured; include measurement method and viewport.

## WSL and GPU diagnostics

Windows 10 Home build 19045.6466, WSL 3.0.3.0 and kernel 6.18.54.1-1 were reported. At the initial snapshot Ubuntu and docker-desktop were both stopped, WSL2; Ubuntu 26.04.1 LTS subsequently started without a system change. Firmware virtualization was reported enabled and `HypervisorPresent` true. Processor WMI also returned `SecondLevelAddressTranslationExtensions=False` and `VMMonitorModeExtensions=False`; these raw properties do not prove a missing feature while a hypervisor is active. Do not change virtualization settings based on these readings.

Host snapshot: 20,820,028 KiB visible RAM, 7,203,592 KiB free, 30,481,220 KiB virtual memory total and 5,412,064 KiB free. Windows pagefile allocation was 9,434 MiB, with 1,457 MiB in use and 2,145 MiB peak. Ubuntu `/proc/meminfo` reported 10,108,832 KiB total, 9,384,244 KiB available, and 3,145,728 KiB swap total/free at its later snapshot. Free disk: C: 153,143,668,736 bytes; D: 536,136,654,848 bytes. These are point-in-time measurements and do not identify the cause of an earlier VM creation failure.

The current user's `.wslconfig` was absent. Ubuntu `/etc/wsl.conf` contained `[boot] systemd=true` and a default user; it did not specify memory or swap. [Microsoft's WSL configuration documentation](https://learn.microsoft.com/en-us/windows/wsl/wsl-config) describes `.wslconfig` as global to the WSL2 VM; changes can affect all distributions and require that VM to restart. No global settings or virtualization settings were changed, and neither WSL nor any distribution was shut down. The Hyper-V Compute Admin event query found no matching events in the preceding two days; this does not exclude other diagnostic logs or causes. Follow [Microsoft's troubleshooting guidance](https://learn.microsoft.com/en-us/windows/wsl/troubleshooting) to capture the exact failure, WSL and Windows versions, reproduction steps, and relevant diagnostics if it recurs.

Host `nvidia-smi` reported NVIDIA GeForce RTX 3060 Laptop GPU, 6,144 MiB, driver 610.62 and 5,997 MiB free at that instant. WSL `nvidia-smi` also saw the GPU and reported 14 MiB in use at its own snapshot. Driver-reported CUDA UMD 13.3 is not evidence that a CUDA toolkit or CUDA-enabled PyTorch is installed. The isolated SAM Pixi environment uses Python 3.11.18 but lacks `torch`. The existing Windows MHR venv was previously found to use CPU-only PyTorch; it is not evidence of SAM GPU readiness. No GPU inference or CUDA tensor execution occurred.

## Commands and results

Commands are from the project root unless otherwise noted. Host-context commands were used for Windows process/CIM/WSL checks and the two successful builds; no system configuration was changed.

```powershell
Get-CimInstance Win32_Process -Filter "name='node.exe'"  # inspect command lines and parent IDs
Get-NetTCPConnection -LocalPort 3000 -State Listen      # project PID 36208
Get-Item -Force apps\web\.next,apps\web\.next\trace,apps\web\.next\trace-build
Get-Acl apps\web\.next; Get-Acl apps\web\.next\trace
# Rechecked process identities, then stopped project PIDs 772 and 36208 only.
npm.cmd run build  # sandbox: FAIL, EPERM; project dev server stopped
npm.cmd run build  # host: PASS
npm.cmd run build  # host repeat: PASS
npm.cmd run dev --workspace @virtual-wardrobe/web -- --hostname 127.0.0.1  # restored; ready
Invoke-WebRequest http://127.0.0.1:3000/lab -UseBasicParsing  # 200
Invoke-WebRequest http://127.0.0.1:3000/api/demo-avatar -UseBasicParsing  # 200; SHA-256 compared to file
Get-FileHash outputs\avatars\mhr-neutral.glb -Algorithm SHA256
npm.cmd run typecheck  # PASS
npm.cmd run lint       # PASS
npm.cmd test           # PASS
.\external\mhr-venv\Scripts\python.exe -m unittest discover -s services\reconstruction\tests -v  # 19 PASS
.\external\mhr-venv\Scripts\python.exe services\reconstruction\validate_glb.py outputs\avatars\mhr-neutral.glb  # PASS
# From external/MHR/web-viewer:
..\..\mhr-venv\Scripts\python.exe -m pytest tests -q  # 26 PASS, cache warning
wsl --version; wsl --status; wsl --list --verbose
wsl -d Ubuntu -- cat /proc/meminfo  # PASS
wsl -d Ubuntu -- cat /etc/wsl.conf
wsl -d Ubuntu -- cat /etc/os-release
wsl -d Ubuntu -- nvidia-smi         # PASS: GPU visible
nvidia-smi --query-gpu=name,memory.total,memory.free,driver_version --format=csv
wsl -d Ubuntu -- /mnt/d/Projects/outfitplannerapp/virtual-wardrobe/external/pixi-bin/pixi run --manifest-path /mnt/d/Projects/outfitplannerapp/virtual-wardrobe/external/sam3d-env/pixi.toml python --version  # 3.11.18
wsl -d Ubuntu -- /mnt/d/Projects/outfitplannerapp/virtual-wardrobe/external/pixi-bin/pixi run --manifest-path /mnt/d/Projects/outfitplannerapp/virtual-wardrobe/external/sam3d-env/pixi.toml python -c 'import torch;print(torch.__version__);print(torch.version.cuda);print(torch.cuda.is_available())'  # FAIL: torch missing
Get-CimInstance Win32_OperatingSystem; Get-CimInstance Win32_PageFileUsage
Get-CimInstance Win32_Processor; Get-CimInstance Win32_ComputerSystem
Get-PSDrive -PSProvider FileSystem
# Read %USERPROFILE%\.wslconfig if present; query Hyper-V Compute Admin via Get-WinEvent for the last two days.
```

An earlier isolated-environment probe had a PowerShell quoting error and returned a Python `SyntaxError`; the corrected torch probe above produced the meaningful missing-module result. The browser inventory check was performed through the computer-use surface.

## Blockers and recommended next step

Complete the manual browser checklist and record actual observations. Continue observing WSL across restarts and capture Microsoft-recommended diagnostics if HCS fails again; the one successful launch does not establish a permanent fix. Install and verify a compatible CUDA-enabled PyTorch and official dependencies in the isolated environment using the project's existing setup documentation; do not alter the working MHR environment. Wait for checkpoint approval before downloading official weights or attempting inference. After approval, benchmark actual memory and latency on an authorized photo; 6 GiB suitability remains unknown. Resolve the restricted-context build access problem if builds must run in that context, using the host-context success as the control.
