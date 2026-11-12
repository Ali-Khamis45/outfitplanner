# Sprint 1.4C

## Collision comparison

**PASS** - The checker uses closest-triangle depth and ray parity on a watertight, consistently wound posed body; the known inside/outside points and the fixed 0.2 m inward garment shift tests passed. The 15 requested neutral comparisons completed. Both the exact-surface/parity check and the existing nearest-vertex approximation reported **0 inside vertices** and **0 mm maximum depth** in all cases; there were no per-vertex classification disagreements.

| Garment | Rest | L +90 | Both +90 | Both +120 | Torso rotation |
| --- | --- | --- | --- | --- | --- |
| Original | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| v2 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| v4 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

Cells show exact / approximate inside-vertex counts. The 3 mm counts were also zero. Posed self-intersection and finite-precision ray parity may make inside/outside ambiguous; body-region labels use nearest-face skin influences. This is a vertex test, not continuous triangle-triangle collision.

Commands (PowerShell, repository root):

```powershell
python -m venv tools/collision/.venv
tools/collision/.venv/Scripts/python.exe -m pip install -r tools/collision/requirements.txt
tools/collision/.venv/Scripts/python.exe -m unittest discover -s tools/collision -p test_collision.py -v
tools/collision/.venv/Scripts/python.exe tools/collision/compare.py
```

The actual matrix was run using the same `check.py` command for each path/pose; `compare.py` reproduces that loop. The shared test poses and skinning are in `apps/web/lib/garment`, not `services/garments`; the checker calls those read-only modules via Node rather than inventing a second pose implementation. The same shared driver uses named corrective children for Python collision evaluation. No personal assets were changed.

## Reconstruction GPU memory

**NOT TESTED** - No new reconstruction or detector variants could be run: `samples/input/` contains only `.gitkeep`, and `external/` contains no SAM 3D Body, MHR, detector checkpoints, or reconstruction Python environment. Windows Python also has no PyTorch. The GPU is present (RTX 3060 Laptop, 6,144 MiB). The authorized photo was not read from another checkout; no personal output or parameters were changed. FP16/BF16, reduced detector input, fresh release-detector profiling, export peak, the <=1 mm vertex gate and joint-count gate remain untested. No precision/input-size change was retained.

Historical measurements from [Sprint 0.5](../sprint-0/sprint-0.5-report.md), **not new 1.4C measurements**:

| Stage / result | Detector resident | Detector released before SAM | New 1.4C result |
| --- | ---: | ---: | --- |
| Detection peak allocated | 5,934 MiB | 5,932 MiB | NOT TESTED |
| SAM inference peak allocated | 6,164 MiB | 3,469 MiB | NOT TESTED |
| Export peak allocated | NOT TESTED | NOT TESTED | NOT TESTED |
| Peak shared-memory spill | 708 MiB | 708 MiB | NOT TESTED |
| Maximum vertex difference vs protected baseline | 0.00066 mm | 0.00054 mm | NOT TESTED |
| Joint-count equality | NOT TESTED | NOT TESTED | NOT TESTED |

Commands run to establish the blocker (PowerShell, repository root):

```powershell
nvidia-smi --query-gpu=name,memory.total,memory.used --format=csv,noheader
Get-ChildItem -Force samples/input
Get-ChildItem -Force external
python -c "import importlib.util; print(importlib.util.find_spec('torch'))"
```

The old profiler's detector-release mode remains an experiment rather than a new verified change. Repeating the required measurements requires the authorized photo and the project's official model environment and checkpoints in this worktree. Confirm dedicated and shared GPU memory separately: allocator peak alone does not prove zero spill.
