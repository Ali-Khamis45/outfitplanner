# Sprint 1.0 — T-shirt construction and rigging

## Skeleton facts (measured from the official MHR model)

- **Joints:** 127. The joints that matter for the shirt are `root`, `c_spine0` to `c_spine3`, `l/r_clavicle`, `l/r_uparm`, `l/r_lowarm`, `c_neck` and `c_head`. Arm chain: `c_spine3 → l_clavicle → l_uparm → l_lowarm → l_wrist`.
- **Twist joints:** MHR's body skin weights put most upper-arm and thigh influence on procedural twist joints (`l_uparm_twist0..4_proc`, `l_upleg_twist*_proc`). These are **children** of `l_uparm` / `l_upleg`, so rotating the parent joint moves them.
- **Frame:** meters, +Y up, +Z forward, +X the subject's left. The rest pose is an A-pose with upper arms about 48° below horizontal. Neutral landmarks: hips 0.906 m, `c_spine3` 1.348 m, shoulders (`uparm`) 1.419 m, `c_neck` 1.442 m.
- **Identity** coefficients do **not** move the rest skeleton (joint positions, rotations and scales are bit-identical to neutral).
- **SAM's scale parameters** (64 of 68 non-zero) move joints by up to 5.26 cm and set joint scales down to 0.939.
- **Pose correctives** are zero at the rest pose (≤ 1e-6 m), so a rest-pose evaluation has no baked corrective geometry.

## Construction ([`tshirt.py`](../../services/garments/tshirt.py))

This is a landmark-driven garment volume, not a copy of the body surface:

1. **Body field.** 400,000 surface samples with normals give an approximate signed distance and a joint-group label (torso, arm, forearm/hand, head, leg) on a 6 mm grid (1.49 M points).
2. **Garment core.** Body occupancy without forearms and hands, plus a **hang fill**: the torso silhouette at `c_spine3 − 5 cm` is swept straight down to the hem, so the shirt hangs from the chest instead of following the waist.
3. **Ease.** Outer surface = distance to core (Gaussian-blurred 1.2 voxels to remove distance-transform terraces) minus ease. Ease is 1.2 cm at the shoulders, 2.0 cm at the chest, 3.5 cm at the hem and 2.2 cm on the sleeves, blurred over 2 cm.
4. **Openings from joints.**
   - Hem: a plane 3 cm below the hip joints.
   - Sleeves: planes perpendicular to the upper arm, halfway from shoulder to elbow.
   - Neckline: a collar plane tilted forward (front drop, scoop) combined with a cone around the neck axis (9 cm radius at the base, widening upward) so it cuts transversely.
   - Top: everything 8 cm above `c_neck` is removed.
5. **Clean-up.** Binary closing (2 voxels) and opening (1 voxel) remove sub-voxel armpit gaps and slivers. The surface is extracted with a project-local surface-nets routine (scikit-image is not in the verified environment and was not installed). Cut caps are removed, leaving exactly four openings. Remaining non-manifold spots, where cuts graze the surface, are deleted locally (4 edges, 79 faces on the neutral body); no hole filling was needed.
6. **Smoothing.** 20 Taubin iterations, then hem and sleeve loops are snapped back onto their cut planes.
7. **Clearance rule.** Any vertex whose inner layer would be closer than 6 mm to the body is pushed out along the body normal. On the neutral body this moved 166 vertices, 120 of them on the neck opening (collar edge), maximum 1.6 cm at the front neckline.
8. **Thickness.** A 2 mm inner layer plus closed rims at all four openings, wound topologically (each outer boundary edge a→b appears as b→a in its rim). The result is a closed, consistently wound, outward-facing shell of genus 3 (Euler −4), exactly what a thickened surface with four openings should be.
9. **UVs.** Cylindrical per panel: torso island u ∈ [0, 0.6) around the neck axis with the seam at centre back; sleeves u ∈ [0.62, 0.79] and [0.81, 0.98] around the arm axes. Faces are unwrapped so none spans a seam, and seam vertices are split. Rims reuse an adjacent UV. The UVs are not texture-optimized (sleeve islands are stretched); the current material is a solid colour.
10. **Material.** PBR metallic-roughness: base colour (0.85, 0.85, 0.88), metallic 0, roughness 0.85, single-sided (the shell has thickness).

## Skin weights

- **Transfer.** Each garment vertex takes the inverse-distance-squared blend of the top-four influences of its 8 nearest body vertices. Head, jaw, eye and forearm/hand joints are excluded, then the row is renormalized.
- **Smoothing.** 12 iterations of uniform Laplacian smoothing over the garment surface, then reduction to the 4 largest influences and normalization. The worst vertex loses 17.4% of its weight mass in the top-4 reduction (shoulder and neck mixes).
- **Result.** 20 joints carry influence: `root`, `c_spine0..3`, both clavicles, `uparm_twist0..3` on each side, upper-thigh twist joints near the hem, and `c_neck_twist1_proc`. The inner layer and rims copy the outer vertex's weights, so thickness travels with the surface.

## Bind poses and coordinate systems

- **Matching inputs.** The garment GLB and avatar GLB are written from the same rest skeleton state by the same official rig code: inverse binds differ by at most 1.2e-7 (neutral) and 0 (personal).
- **Inverse bind check.** The validator recomposes every joint's world matrix from the garment GLB's own node hierarchy: world × inverse bind = I within 6e-8. Skinning at the bind pose moves vertices by at most 2.3e-7 m.
- **Same body.** The evaluated neutral body equals the served `mhr-neutral.glb` within 5.7e-8 m (vertices) and 1.0e-7 (inverse binds), so the garment is designed on exactly the body the viewer shows.
- **One skeleton.** At runtime the garment is rebound by name to the avatar's bones with an identity bind matrix. There is a single skeleton and no duplicated transform. In Three.js, bind drift after rebinding is 1.2e-7 m.

## Personal body shape (rest pose)

- **Evaluation.** Personal bodies are evaluated **from parameters** with the official model in the rest pose: zero pose parameters, identity from `shape_params`, and optionally SAM's scale parameters. The posed SAM GLB is never "reset": its bind pose *is* the estimated pose, and binding the neutral garment to it is refused by the inverse-bind check.
- **Variants.**
  - `personal-identity`: SAM identity (45 coefficients), pose 0, scales 0. Same skeleton as neutral.
  - `personal-identity-scale`: also SAM's 68 scale parameters, which gives its own skeleton. Its feet sit 5.2 cm above y = 0 because the root is unchanged; not corrected.
- **Retargeting.** The same garment (identical topology, UVs and weights) is moved by the body's own displacement field: an inverse-distance blend over the 8 nearest neutral-body vertices of the neutral→personal displacement (MHR topology is identical). The clearance rule then runs on the target body. The original SAM parameters are read-only; the NPZ checksum is unchanged (`77c0e41c…`).

## Reproduce

```powershell
cd services\garments
..\..\external\mhr-venv\Scripts\python.exe generate_tshirt.py                                   # neutral (≈17 s)
..\..\external\mhr-venv\Scripts\python.exe generate_tshirt.py --reconstruction ..\..\outputs\sam3d-person-front-sprint03-run2\reconstruction.npz
..\..\external\mhr-venv\Scripts\python.exe validate_garment.py ..\..\outputs\garments\tshirt-mhr-neutral.glb ..\..\outputs\avatars\mhr-neutral.glb
cd ..\..\apps\web; npm.cmd test
```

The generator refuses to overwrite existing outputs; delete a previous garment yourself to regenerate it.
