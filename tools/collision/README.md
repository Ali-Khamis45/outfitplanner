# Collision checks

Run from the repository root with Node 24+ and the web dependencies installed:

```powershell
python -m venv tools/collision/.venv
tools/collision/.venv/Scripts/python.exe -m pip install -r tools/collision/requirements.txt
tools/collision/.venv/Scripts/python.exe -m unittest discover -s tools/collision -p test_collision.py -v
tools/collision/.venv/Scripts/python.exe tools/collision/check.py outputs/avatars/mhr-neutral.glb outputs/garments/tshirt-v2-mhr-neutral.glb both-90
tools/collision/.venv/Scripts/python.exe tools/collision/compare.py
```

The CLI accepts `rest`, `left-90`, `both-90`, `both-120` and `torso-twist`. It prints JSON and writes no files. The triangle nearest-point distance and ray parity use `trimesh` with Embree acceleration and require a watertight, consistently wound body; finite-precision intersections and self-intersecting posed bodies can make parity ambiguous. Points within 1e-8 m of the surface are classified as on the surface. Approximation numbers use the exact existing web test's nearest-vertex normal method, including its search radius. Regions are approximate labels from the dominant skin joint of the nearest vertex of the closest body face, not anatomical segmentation.

The repository has no posed-skinning or pose definitions under `services/garments/`: they live in `apps/web/lib/garment/poses.ts` and `binding.ts`. The subprocess imports and executes those modules read-only, along with the same frontend approximate collision diagnostic. It also executes the shared corrective driver and honors the named sidecar child, so Python collision evaluation uses the same morph weights. A GLB fitted to a different skeleton is rejected by the shared binder. Python and Node dependencies are required; this is a Python CLI with a Node subprocess, not a standalone single-binary tool.
