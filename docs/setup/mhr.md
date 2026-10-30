# MHR proof of concept

## Status and provenance

The official [MHR repository](https://github.com/facebookresearch/MHR) was cloned at commit `dd4340315901ba2e367133b86971e0caf8e91dd5` into ignored `external/MHR`. Its [web viewer](https://github.com/facebookresearch/MHR/tree/main/web-viewer) and TorchScript CPU inference run on this Windows machine; the HTTP server, neutral export, and backend tests passed. Visual browser rendering has **not** been verified because the browser automation host and native computer-use pipe were unavailable. The full upstream `demo.py` did **not** run: it imports `pymomentum`, and `pip install pymomentum-cpu` found no Windows distribution. The preferred Linux/Pixi installation was not completed: Ubuntu 26.04 WSL2 initially started and saw the NVIDIA GPU, but subsequent starts failed with `HCS/ERROR_NO_SYSTEM_RESOURCES`. This is an environment failure, not proof that Pixi or MHR is incompatible with WSL.

The MHR code and release asset license are Apache-2.0; retain the upstream and asset license notices. Viewer dependencies include their own licenses; consult their packages. No research source files were modified. Official release `v1.0.1` was downloaded using `python mhr/download_assets.py --release v1.0.1 --dest .`. SHA-256: archive `e4f4f205cd87c0fa106577ba1de4fc763e4eb197c924461d2ef7e6944e9d6b94`, model `352e271a6c42729c68554ceaea0c955e866970160c31e35506d782dc0f7377bc`. The asset archive extracts several GB. Keep it, the checkout and outputs outside Git.

## Reproduce the tested Windows viewer path

From the repository root, using a standalone Python 3.11 with venv support and Node/npm:

```powershell
git clone https://github.com/facebookresearch/MHR.git external/MHR
git -C external/MHR checkout dd4340315901ba2e367133b86971e0caf8e91dd5
python -m venv external/mhr-venv
external/mhr-venv/Scripts/python.exe -m pip install torch==2.7.1 --index-url https://download.pytorch.org/whl/cpu
external/mhr-venv/Scripts/python.exe -m pip install -r services/reconstruction/requirements-mhr-viewer-windows.txt --extra-index-url https://download.pytorch.org/whl/cpu
Push-Location external/MHR
../mhr-venv/Scripts/python.exe mhr/download_assets.py --release v1.0.1 --dest .
Pop-Location
Push-Location external/MHR/web-viewer
npm.cmd ci
../../mhr-venv/Scripts/python.exe server.py --no-browser
```

Keep the server running in its terminal. It binds to `127.0.0.1:8891`; open that address in a browser to perform the pending visual check. In a second terminal, from the project root:

```powershell
python services/reconstruction/export_mhr_glb.py outputs/avatars/mhr-neutral.glb
python services/reconstruction/validate_glb.py outputs/avatars/mhr-neutral.glb
python -m unittest discover -s services/reconstruction/tests -v
Push-Location external/MHR/web-viewer
../../mhr-venv/Scripts/python.exe -m pytest tests -q
Pop-Location
```

`export_mhr_glb.py` mutates the official viewer's single shared state: it configures LOD 1, pose correctives on, ground snapping off, and resets pose, identity and expression to zero. Do not run it while another person is editing the viewer. It requests the upstream `/api/export/glb` rather than implementing rigging. Stop the viewer with Ctrl+C after use. The pinned requirements describe the tested Windows CPU fallback; they are not a lock with package hashes and do not install PyMomentum. Upstream recommends Pixi, whose `pixi.lock` is in its checkout. Once WSL resources are repaired, use upstream `pixi install --locked`, `pixi run download-assets`, and `pixi run demo`, recording the result and environment; do not treat this fallback as a successful full demo.

## Inspection and measured output

The viewer metadata reports 45 identity parameters (20 body, 20 head, 5 hands), 204 pose parameters and 72 facial expression parameters. The model reports 127 joints; its hierarchy starts `body_world → root → l_upleg → l_lowleg → l_foot` among other branches. The viewer exposes seven LODs; metadata reports:

| LOD | Vertices | Triangles |
| --- | ---: | ---: |
| 0 | 73,639 | 147,274 |
| 1 | 18,439 | 36,874 |
| 2 | 10,661 | 21,318 |
| 3 | 4,899 | 9,794 |
| 4 | 2,461 | 4,918 |
| 5 | 971 | 1,938 |
| 6 | 595 | 1,186 |

The exported neutral LOD 1 file is `outputs/avatars/mhr-neutral.glb`, SHA-256 `6a1050b05c4345d8244fc1f66399776d1982d88f67fe4ff08c86295041686fb3`. The validator found 18,439 vertices, 36,874 triangles, 127 skin joints, finite positions, in-range joint indices, inverse bind matrices and normalized weights (maximum sum error approximately `1.04e-7`). XYZ bounds in meters are approximately `[-0.6532, 0.6532]`, `[-0.00059, 1.72623]`, `[-0.13894, 0.25613]`. The viewer converts source centimeters to meters and uses +Y as up. The validator reports this upstream convention; it cannot infer semantic front direction or physical units from coordinates alone.

The upstream exporter takes the four highest source skin influences per vertex and normalizes them, writes `JOINTS_0`, `WEIGHTS_0`, the named hierarchy and inverse bind matrices, and uses the evaluated snapshot as bind state. Thus the GLB contains a real skin, but is not a full lossless MHR representation: additional original influences, editable parametric shape/expression, pose-corrective evaluation and animation clips are not preserved as a live MHR model. No dressing, arbitrary animation quality, or browser rendering has been tested. The validator targets self-contained GLB 2.0 files with ordinary accessors, rejects unsupported sparse/external buffers, and is not a full glTF conformance validator. It does not prove visual quality or deformation fidelity.
