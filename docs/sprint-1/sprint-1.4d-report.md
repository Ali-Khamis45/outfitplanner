# Sprint 1.4D - sleeve pattern experiment

**FAIL / NO-GO.** The prototype is at `outputs/garments/experiments/tshirt-v6-sleeve-mhr-neutral.glb` (local, ignored). It binds to the neutral MHR rig, but fails every requested deformation/collision gate and has open shell boundaries. It is not a finished pattern-based sleeve and must not replace v2.

| Neutral garment | Both +90 max stretch (<= 8.7853) | Both +120 flips (<= 123) | Both +120 extra intersections (<= 186) | Both +90 vertices >3 mm inside: exact / approximate |
| --- | ---: | ---: | ---: | ---: |
| Original | 17.5707 | 123 | 186 | 0 / 0 |
| v2 | 10.9372 | 497 | 1,888 | 0 / 0 |
| v4 | 14.4555 | 504 | 1,895 | 0 / 0 |
| v6 prototype | 24.7306 | 884 | 3,033 | 93 / 130 |

**PASS** - Existing Three.js binding and evaluator loaded the prototype; collision sensitivity tests detect 2 mm, 5 mm and single-vertex 3 mm penetrations. At rest, exact collision found no penetrating vertices.

**FAIL** - The v6 exact collision checker found 436 inside vertices at both +90 (93 beyond 3 mm, max depth 5.17 mm) and 858 at both +120 (483 beyond 3 mm, max depth 7.49 mm). Left +90 had 44 beyond 3 mm; torso twist had none. The v6 shell is not watertight, and rest self-intersection count is 659. The quality suite exits 1 on its gates. Inversion and intersection measurements are per the existing test, not exact cloth simulation.

**NOT TESTED** - Browser appearance, wearability and independently verified sleeve-cap construction. The experiment extracts a cut from the v2 torso, derives 2D circumference/cap coordinates from that 3D seam, maps ruled panels along the arm, and leaves the cuff shell open. It is not an independently drafted, properly closed 2D sleeve pattern; cap-height range 127.7-127.8 mm and minimum seam-to-cuff extension 110 mm do not establish garment fit or underarm clearance. The output is an exploratory artifact, not a completed version of the requested construction.

Commands from the repository root (generator refuses overwrite; use an empty v6 output path to regenerate):

```powershell
tools/collision/.venv/Scripts/python.exe -m unittest discover -s tools/collision -p test_collision.py -v
tools/collision/.venv/Scripts/python.exe experiments/sleeve-pattern/prototype.py
tools/collision/.venv/Scripts/python.exe experiments/sleeve-pattern/evaluate.py
tools/collision/.venv/Scripts/python.exe tools/collision/check.py outputs/avatars/mhr-neutral.glb outputs/garments/experiments/tshirt-v6-sleeve-mhr-neutral.glb both-90
tools/collision/.venv/Scripts/python.exe tools/collision/check.py outputs/avatars/mhr-neutral.glb outputs/garments/experiments/tshirt-v6-sleeve-mhr-neutral.glb both-120
```

The quality evaluator was run from a temporary copy of the existing test, with only its registry extended to include v6; the original test and source assets were not changed. The requested GPU task remains NOT TESTED in the 1.4C report.

## Coverage follow-up

**Provisional coverage PASS; overall FAIL / NO-GO.** The final coverage spec was not present in this worktree. Until it lands, the evaluator requires the existing side-ray coverage fraction to be strictly higher than v2 for each side at both +90 and +120. It is a proxy, not a measurement of visible skin: it ignores body occlusion, perspective and the full side silhouette. Formal spec compliance and browser visual acceptance remain **NOT TESTED**. Each side here contains 69 rest-selected axilla vertices.

| Garment | +90 left / right | +120 left / right | Provisional gate |
| --- | ---: | ---: | --- |
| v2 | 14.49% / 11.59% | 17.39% / 13.04% | baseline |
| Original v6 study | 15.94% / 14.49% | 17.39% / 14.49% | FAIL: left +120 ties |
| v6 lower-armhole study | 18.84% / 17.39% | 18.84% / 17.39% | PASS (proxy only) |

The lower-armhole study is the local, ignored `outputs/garments/experiments/tshirt-v6-coverage-floor127-mhr-neutral.glb`. It lowers the clip floor from 1.285 m to 1.270 m, retaining the original seam-to-cuff settings. It remains an open-shell ruled study, not a completed pattern sleeve. At both +90 it reached **27.0151x** maximum stretch and had **66** vertices over 3 mm inside (exact collision; max depth 4.734 mm); at both +120 it had **905** flipped triangles, **2,998** additional self-intersection pairs, and **450** vertices over 3 mm inside (max depth 7.094 mm). The approximate test reports 101 and 495 >3 mm at +90/+120 respectively. Neither the coverage proxy nor the other results establish visual acceptability.

Other isolated variants did not improve the original v6 coverage score at the tied +120 left side: 40 mm underarm drop, a quadratic arm-weight blend, and a more medial 0.18 m armhole cut. The larger 0.23 m cut tied v2 everywhere. None was promoted. The 40 mm drop and quadratic blend worsened collision counts; the medial cut had 1,160 and 1,436 exact penetrations beyond 3 mm at +90 and +120 respectively.

The existing quality test remains read-only; the evaluation wrapper now runs the provisional coverage check in addition to the unchanged quality calculations, using temporary copies. Commands:

```powershell
node --no-warnings experiments/sleeve-pattern/coverage.test.mjs
tools/collision/.venv/Scripts/python.exe experiments/sleeve-pattern/prototype.py --output outputs/garments/experiments/tshirt-v6-coverage-floor127-mhr-neutral.glb --armhole-floor 1.27
tools/collision/.venv/Scripts/python.exe experiments/sleeve-pattern/evaluate.py --candidate outputs/garments/experiments/tshirt-v6-coverage-floor127-mhr-neutral.glb
```

The generator refuses to overwrite an existing candidate. The full combined evaluation exited 1 on deformation/collision gates even though the provisional coverage check passed. Python and Node dependencies, and the v2/neutral assets, must be available as documented in the experiment README.
