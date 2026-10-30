# Reconstruction service

MHR proof-of-concept adapters live here. `export_mhr_glb.py` asks the official local viewer to reset to neutral LOD 1 and export its skinned GLB; `validate_glb.py` checks its geometry, joint hierarchy and weights. The viewer owns shared mutable state, so run exports only when nobody else is editing it. See [MHR setup](../../docs/setup/mhr.md) for exact commands and limitations. SAM 3D Body and image reconstruction are not implemented.
