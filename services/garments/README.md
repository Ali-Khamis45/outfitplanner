# Garment service (Sprint 1.0, experimental)

Generates a procedural, skinned T-shirt for MHR bodies and validates it against the avatar it must bind to. Run everything with the Windows MHR venv (`external/mhr-venv`); it uses the official MHR model and exporter unmodified.

| File | Purpose |
| --- | --- |
| `body.py` | Rest-pose MHR bodies evaluated from parameters (neutral, personal identity, personal identity + scale). |
| `tshirt.py` | Fitting rules, garment volume, surface extraction, manifold repair, clearance rule, weight transfer, UVs, thickness, retargeting. |
| `garment_glb.py` | Skinned garment GLB writer (official rig math) and a NumPy GLB reader. |
| `generate_tshirt.py` | CLI: `--rules v1` (default, reproduces Sprint 1.0 byte-for-byte) or `--rules v2`; `--lod` for the 10 mm variant; `--reconstruction <npz>` adds personal rest bodies (floor-aligned from v2) and retargeted garments; `--name/--override/--out-dir` for experiments. Never overwrites. |
| `validate_garment.py` | Structural, skeleton, topology and approximate rest-clearance validation against an avatar GLB. |
| `render_views.py` | Offline front/side/back CPU renders (evidence only, not browser rendering). |
| `tests/` | `python -m unittest discover -s services/garments/tests` |

All outputs go to the Git-ignored `outputs/`; personal ones must stay private. See [docs/sprint-1](../../docs/sprint-1/architecture.md).
