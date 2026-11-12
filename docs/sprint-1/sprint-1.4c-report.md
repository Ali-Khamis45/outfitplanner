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
