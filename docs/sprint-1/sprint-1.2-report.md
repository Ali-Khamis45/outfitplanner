# Sprint 1.2 — underarm engineering investigation

**Decision: NO-GO for pants.** The underarm remains unresolved; this is not a successful Sprint 1.2. The isolated v3 topology sensitivity test fails the stretch and +120 collision/inversion gates. The v2 default and reconstruction pipeline remain in place. An actual gusset, raised-pose pattern, pose-aware correction, collar/cuff repair and their visual acceptance are outstanding.

## Findings and approach

Existing evidence points to short underarm web edges across differing arm/torso motion and folding of the thin shell. See [underarm-pattern-analysis.md](underarm-pattern-analysis.md). v3-close1 reduces the existing morphological closing setting from two voxels to one; it is not an added panel. It uses the existing v2 local weight pipeline and unchanged MHR inverse binds; no new global weight-smoothing experiments, corrective morphs, collar or cuff modifications were made. The closed shell has 65,618 vertices, 122,068 triangles, four openings, nominal 2 mm thickness, UVs and normals. Validator: weight-sum error 1.44e-7, inverse-bind delta 1.19e-7, bind drift 2.36e-7 m, approximate rest clearance 5.99 mm and zero penetrations. Three.js GLTFLoader and the shared rig were exercised by the pose diagnostic.

At both +90 maximum stretch is v1 17.571x, v2 10.94x, v3 10.872x; v3 improves 38.1%, below the 50% requirement. At both +120 v1/v2/v3 have 123/497/497 flips and 186/1,888/1,892 self-intersections above rest. No approximate body penetrations beyond 3 mm were detected in the tested poses. Numerical and visual gates are independent: v3 visual quality is NOT TESTED. Full comparison and caveats: [quality-comparison.md](quality-comparison.md), [visual-qa.md](visual-qa.md).

## Acceptance

| Criterion | Status | Evidence |
| --- | --- | --- |
| Existing baseline preserved | PASS | hashes below matched before/after |
| Rig, topology, UV and rest fit of v3 | PASS | `validate_garment.py`; approximate clearance only |
| +90 maximum-stretch target | FAIL | 10.872 > 8.785 |
| +120 inversion and self-intersection regression | FAIL | 497 flips and 1,892 additional pairs |
| Underarm coverage, fins, collar and cuffs | NOT TESTED for v3 | browser host unavailable; previous v2 side view failed |
| New panel, raised-pose construction or corrective | NOT TESTED | not implemented; topology sensitivity alone is insufficient |
| Personal v3 | NOT TESTED | no personal candidate created |
| Existing default and personal local-file path | PASS by code inspection | v2 remains default; personal file path unchanged |

## Session safety and commands

The working tree was inspected, including pre-existing changes; the other Codex server had no active editor subprocess and the most recent relevant source write preceded this task. Existing dev and MHR servers were left running. No process was stopped. No push, paid service, personal asset publication or model inference occurred.

Commands run from the project root unless noted:

- `external/mhr-venv/Scripts/python.exe services/garments/generate_tshirt.py --rules v2 --name v3-close1 --override close_voxels=1 --out-dir outputs/garments/experiments`: PASS with host permissions; initial sandbox export failed with permission denied. The generator refuses to overwrite existing outputs.
- `external/mhr-venv/Scripts/python.exe services/garments/validate_garment.py outputs/garments/experiments/tshirt-v3-close1-mhr-neutral.glb outputs/avatars/mhr-neutral.glb`: PASS, structural/rest checks only.
- `python -m unittest discover -s services/garments/tests -v` in the MHR venv: 10 PASS. `python -m unittest discover -s services/reconstruction/tests -v`: 19 PASS.
- In `external/MHR/web-viewer`, the MHR venv `python -m pytest tests -q`: 26 PASS; pytest could not write its cache. An initial unittest discovery found zero tests and is not counted as a pass.
- `npm.cmd test` in `apps/web`: PASS with host permissions, including loader, binding and inspection. Initial sandbox run failed with EPERM on an existing generated test file.
- `node --no-warnings tests/garment-quality.test.mjs v1-neutral v3-close1-neutral`: FAIL as expected on quality limits. The JSON report lives under ignored `outputs/garment-tests/`. The +120 gate was added after the first run and rerun separately.
- `npm.cmd run test:garment-quality`: FAIL across the complete available asset suite, including the explicit +120 checks and existing stretch/collision gates. The full generated report is `outputs/garment-tests/quality.json` (private local diagnostic data; do not publish).
- `npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd run build` in `apps/web`: PASS after the viewer changes. Build used host permissions.
- HTTP GET `/api/demo-garment?variant=v3`: 200, 5,456,908 bytes. This is a fixed non-personal demo path; browser rendering was not tested.
- Browser host and native pipe both unavailable. Manual steps: [visual-qa.md](visual-qa.md).

## Baseline SHA-256 (before and after)

| File | SHA-256 |
| --- | --- |
| `outputs/avatars/mhr-neutral.glb` | `6A1050B05C4345D8244FC1F66399776D1982D88F67FE4FF08C86295041686FB3` |
| `outputs/garments/tshirt-mhr-neutral.glb` | `2D8076B8CF988CBAC1D334030CEC26AA88A8329FC74AF9E157C69B573FAABF1C` |
| `outputs/garments/tshirt-v2-mhr-neutral.glb` | `83D9D9C214227853DB60F1E052601435182ABB2C072BCCA2D7D436C91BF5BE92` |
| `outputs/garments/tshirt-v2-lod-mhr-neutral.glb` | `E4686280B58AAC3D13D15F284CD07DA8FFCCE347DAB9018AAB14A5534720EB9D` |
| `services/reconstruction/reconstruct.py` | `9D2EDF5101EA054F243FB38AF7530B9F63B250AAB720F79C8CFBB1C15B936FA6` |
| `services/reconstruction/sam3d_mhr_adapter.py` | `9662ABDAB6D023A5D90A7BA96A38AD9B34304922C5C70C19AAB8F48E6EE6E855` |

Personal outputs were not altered; this session did not checksum every reconstruction output, so whole-pipeline checksum verification remains NOT TESTED. Investigate an explicit seam/gusset or a carefully validated partially raised authoring pose next; test morph-before-skin behavior and asymmetry only if geometry alone fails. Do not promote until all numerical and real visual gates pass.
