# Sleeve pattern experiment

Run from the repository root after installing `tools/collision/requirements.txt` and web dependencies:

```powershell
tools/collision/.venv/Scripts/python.exe experiments/sleeve-pattern/prototype.py
tools/collision/.venv/Scripts/python.exe experiments/sleeve-pattern/evaluate.py
tools/collision/.venv/Scripts/python.exe tools/collision/check.py outputs/avatars/mhr-neutral.glb outputs/garments/experiments/tshirt-v6-sleeve-mhr-neutral.glb both-90
```

The generator refuses to overwrite its output. The evaluator copies the unchanged quality test and source assets into a temporary directory, adds a v6 registry entry only to the copy, and removes it on exit. It returns the test's exit code.

This is a failed early construction study, not a finished sewn garment. It clips the v2 shell, unfolds each resulting 3D boundary into a circumference/cap-height coordinate system and maps a ruled 2D panel along a straight arm axis to a planar extended cuff. It does not construct a separately drafted sleeve cap with a closed double-sided cuff; the result has open shell boundaries. It retains the shared skeleton and interpolates seam skin weights toward the upper arm. It must not be promoted as a garment. See the Sprint 1.4D report for numeric failures and the lack of visual verification.

## Coverage studies

`coverage.mjs` runs the existing side-ray approximation separately for the left and right rest-selected axilla regions at both +90 and both +120. `evaluate.py` now fails if any of those four coverage fractions is not strictly greater than v2, independently of the existing deformation and collision gates. This is a provisional operational interpretation of reduced side exposure; Claude's detailed coverage spec has not landed in this worktree. It is not a visibility or visual-acceptance test: it does not account for body occlusion, camera perspective or the full side silhouette. Check the final spec and browser views before promotion.

```powershell
node --no-warnings experiments/sleeve-pattern/coverage.test.mjs
tools/collision/.venv/Scripts/python.exe experiments/sleeve-pattern/prototype.py --output outputs/garments/experiments/tshirt-v6-coverage-floor127-mhr-neutral.glb --armhole-floor 1.27
tools/collision/.venv/Scripts/python.exe experiments/sleeve-pattern/evaluate.py --candidate outputs/garments/experiments/tshirt-v6-coverage-floor127-mhr-neutral.glb
```

All generated candidate names are new and the generator refuses overwrites. `--length-m`, `--underarm-drop-m`, `--blend-power`, `--armhole-x`, and `--armhole-floor` vary the ruled study; these are not a replacement for a real 2D pattern with a closed cuff.
