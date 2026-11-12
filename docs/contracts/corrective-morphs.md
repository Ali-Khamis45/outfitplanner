# Contract: pose-driven corrective morph targets (garment GLB)

**Status:** v1, Sprint 1.4A. **Producer:** `services/garments` (Python). **Consumer:** the web lab (Three.js). Both sides must implement exactly this; any change bumps `version`.

## 1. GLB

- The garment GLB is unchanged in every other respect: one skinned mesh, the full 127-joint MHR skeleton, the same inverse bind matrices and skin weights.
- The garment mesh's single primitive gains **POSITION-only** glTF morph targets. For the T-shirt these are four targets, in this order (other garments: see §2, "Target sets per garment"):

  | Index | Name |
  | --- | --- |
  | 0 | `corr_L_abd90` |
  | 1 | `corr_L_abd120` |
  | 2 | `corr_R_abd90` |
  | 3 | `corr_R_abd120` |

- Names are stored in `meshes[0].extras.targetNames`, which Three.js's GLTFLoader reads into `morphTargetDictionary`. `meshes[0].weights` is all zeros, one entry per target.
- No NORMAL or TANGENT deltas. Normals are the rest normals, skinned as usual.
- **Deltas are in bind (rest) space.** Three.js applies morphs **before** skinning:

  `posed = SkinMatrix(v) · (rest + Σ weight_k · delta_k)`, where `SkinMatrix(v) = Σ_j w_vj · (boneWorld_j · inverseBind_j)`.

  The producer therefore computes `delta = SkinMatrix(v)⁻¹ · desired_posed − rest`, evaluated at the target pose.

## 2. Sidecar: `<garment basename>.correctives.json`, next to the GLB

```json
{
  "version": 1,
  "correctives": [
    { "target": "corr_L_abd90",  "joint": "l_uparm", "child": "l_lowarm", "measure": "swing_deg", "ramp": [0, 90] },
    { "target": "corr_L_abd120", "joint": "l_uparm", "child": "l_lowarm", "measure": "swing_deg", "ramp": [90, 120] },
    { "target": "corr_R_abd90",  "joint": "r_uparm", "child": "r_lowarm", "measure": "swing_deg", "ramp": [0, 90] },
    { "target": "corr_R_abd120", "joint": "r_uparm", "child": "r_lowarm", "measure": "swing_deg", "ramp": [90, 120] }
  ]
}
```

Names are exact MHR joint names (glTF node names). `child` identifies the bone's end joint and is required to define the bone direction (§3).

### Target sets per garment (added in Sprint 2.0A; the format is unchanged)

The sidecar is the source of truth: a consumer drives whatever targets it lists, matching them by name through `morphTargetDictionary`. The GLB's morph target order equals the sidecar order. The T-shirt set is the one above. The basic pants (`pants-basic-v1-mhr-neutral.glb`) carry four flexion correctives:

| Index | Target | `joint` → `child` | `ramp` | Solved at (docs/contracts/leg-poses.md convention) |
| --- | --- | --- | --- | --- |
| 0 | `corr_L_hip90` | `l_upleg` → `l_lowleg` | [20, 90] | `l_upleg` [1,0,0] −90 |
| 1 | `corr_L_knee90` | `l_lowleg` → `l_foot` | [0, 90] | `l_lowleg` [1,0,0] +90 |
| 2 | `corr_R_hip90` | `r_upleg` → `r_lowleg` | [20, 90] | `r_upleg` [1,0,0] −90 |
| 3 | `corr_R_knee90` | `r_lowleg` → `r_foot` | [0, 90] | `r_lowleg` [1,0,0] +90 |

`swing_deg` has no direction. The hip ramps therefore start at 20°, so hip extension (15°) and abduction (20°), which swing the thigh as much as a small flexion, leave the hip targets at 0. Each target is solved alone. In combined poses (for example `step` = hip 90 + knee 90) the weights simply add, as §4 says.

## 3. `swing_deg`

For joint `J` with bone child `C`:

- `d` = `C`'s **rest** local translation, in `J`'s space. For `l_uparm` → `l_lowarm` this is `(0.2568, −0.0005, 0)`, essentially local +X.
- `R_rest` = `J`'s local rotation relative to its parent in the bind pose: the rotation part of the node's rest local transform, normalized for scale.
- `R_now` = `J`'s current local rotation relative to its parent: `bone.quaternion` in Three.js.
- `swing_deg = degrees(acos(clamp(dot(normalize(R_rest·d), normalize(R_now·d)), −1, 1)))`.

Both directions are in the parent's space. Twist about the bone axis does not change `swing_deg`. The rest pose gives exactly 0; the value is always in [0, 180].

**Epsilon at rest (added in Sprint 1.4A).** If `swing_deg < 0.01`, use 0. Round-off makes `acos` of two identical unit vectors return about 1e-6° instead of 0, and a pose reset rarely restores the rest quaternion bit-for-bit. This rule makes the rest weights exactly 0 regardless. The reference implementation is `services/garments/posing.py` `swing_deg` (`SWING_EPSILON_DEG`).

## 4. Weights

`weight = clamp((swing_deg − ramp[0]) / (ramp[1] − ramp[0]), 0, 1)`

- **Additive:** at 120° both targets of a side are fully on (1 + 1); `abd120` holds only the correction beyond `abd90`. At 90°: `abd90` = 1, `abd120` = 0. At 45°: `abd90` = 0.5.
- **Independence:** each side reads only its own joint. Both arms raised is the sum of the left and right targets, whose vertex supports do not overlap.
- **Rest:** all weights are 0, so the rest geometry equals the base garment's exactly.

## 5. Consumer checklist (Three.js)

1. After applying the pose, read each `joint` bone's `quaternion` and compute `swing_deg` with the rest local rotation captured at load. Treat `swing_deg < 0.01` as 0 (§3).
2. Set `mesh.morphTargetInfluences[mesh.morphTargetDictionary[target]] = weight`, then render. The default skinned-mesh shader already applies morphs before skinning.
3. If the sidecar is missing, or names don't match, leave all influences at 0 (base garment behaviour) and report it.

## 6. Producer guarantees

- Deltas are non-zero only in the shoulder/underarm region of their own side, and fade smoothly to 0 at the region boundary.
- Rest POSITION, NORMAL, indices, skin weights and inverse binds are byte-equal to the base garment's (v2 for v5).
