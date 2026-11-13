# Contract: pose-driven corrective morph targets (garment GLB)

**Status:** v2, Sprint 2.2A (v1: Sprint 1.4A). v2 adds the signed measure (§3b) and ramps in either direction (§4); every v1 sidecar stays valid. **Producer:** `services/garments` (Python). **Consumer:** the web lab (Three.js). Both sides must implement exactly this; any change bumps `version`.

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

### Sidecar versions (v2, Sprint 2.2A)

- `"version": 1`: every entry uses `"measure": "swing_deg"`. This is the format above; v1 sidecars remain valid and keep their meaning.
- `"version": 2`: an entry may use `"measure": "swing_deg"` or `"measure": "signed_swing_deg"`. A signed entry also carries `"axis": [x, y, z]`, a direction in the **parent joint's space** (§3b). Ramps may run in either direction (§4).
- Consumers must accept versions 1 and 2. They must reject other versions and unknown measures, leaving all influences at 0 and reporting the problem (§5).

```json
{ "target": "corr_L_add20", "joint": "l_uparm", "child": "l_lowarm", "measure": "signed_swing_deg",
  "axis": [0.6731, 0.4009, -0.6214], "ramp": [0, -20] }
```

### Target sets per garment (added in Sprint 2.0A; the format is unchanged)

The sidecar is the source of truth: a consumer drives whatever targets it lists, matching them by name through `morphTargetDictionary`. The GLB's morph target order equals the sidecar order. The T-shirt set is the one above. The basic pants (`pants-basic-v1-mhr-neutral.glb`) carry four flexion correctives:

| Index | Target | `joint` → `child` | `ramp` | Solved at (docs/contracts/leg-poses.md convention) |
| --- | --- | --- | --- | --- |
| 0 | `corr_L_hip90` | `l_upleg` → `l_lowleg` | [20, 90] | `l_upleg` [1,0,0] −90 |
| 1 | `corr_L_knee90` | `l_lowleg` → `l_foot` | [0, 90] | `l_lowleg` [1,0,0] +90 |
| 2 | `corr_R_hip90` | `r_upleg` → `r_lowleg` | [20, 90] | `r_upleg` [1,0,0] −90 |
| 3 | `corr_R_knee90` | `r_lowleg` → `r_foot` | [0, 90] | `r_lowleg` [1,0,0] +90 |

Pants v2 (`pants-basic-v2-mhr-neutral.glb`, Sprint 2.1A) uses the same four names and ramps. Since Sprint 2.2A its sidecar is **version 2**: every entry is `signed_swing_deg` with the hip- or knee-flexion `axis` from §3b. Hip extension and abduction now give 0, and the ramps are unchanged. The 20° hip start remains a tuning choice: the target is solved at 90°, and from 0° it over-corrects at `squat`. The GLB is unchanged.

The T-shirt **v5.1** (`tshirt-v5.1-mhr-neutral.glb`, Sprint 2.1A) has the four shoulder targets above, followed by two hem correctives (indices 4 and 5). They lift the front hem off the raised thigh:

| Index | Target | `joint` → `child` | `ramp` | Solved at |
| --- | --- | --- | --- | --- |
| 4 | `corr_L_hip90` | `l_upleg` → `l_lowleg` | [20, 90] | `l_upleg` [1,0,0] −90 |
| 5 | `corr_R_hip90` | `r_upleg` → `r_lowleg` | [20, 90] | `r_upleg` [1,0,0] −90 |

Since Sprint 2.2A the v5.1 sidecar is **version 2**: the shoulder targets are `signed_swing_deg` with the abduction `axis` (ramps unchanged), and the hip targets are `signed_swing_deg` with the hip-flexion `axis` (ramp [20, 90]). The GLB is unchanged.

The T-shirt **v5.2** (`tshirt-v5.2-mhr-neutral.glb`, Sprint 2.2A, version 2 sidecar) is v5.1 plus two arm-down targets for arms lowered towards the body (the /try-on Stand and Walk poses):

| Index | Target | `joint` → `child` | `measure`, `axis` | `ramp` | Solved at |
| --- | --- | --- | --- | --- | --- |
| 6 | `corr_L_add20` | `l_uparm` → `l_lowarm` | `signed_swing_deg`, left abduction axis | [0, −20] | `l_uparm` [0,0,1] −20, also clearing the arm at ±10° about X |
| 7 | `corr_R_add20` | `r_uparm` → `r_lowarm` | `signed_swing_deg`, right abduction axis | [0, −20] | `r_uparm` [0,0,1] +20, also clearing the arm at ±10° about X |

In version 1 sidecars (v5, pants v1), `swing_deg` has no direction. The hip ramps therefore start at 20°, so hip extension (15°) and abduction (20°), which swing the thigh as much as a small flexion, leave the hip targets at 0. Each target is solved alone. In combined poses (for example `step` = hip 90 + knee 90) the weights simply add, as §4 says.

## 3. `swing_deg`

For joint `J` with bone child `C`:

- `d` = `C`'s **rest** local translation, in `J`'s space. For `l_uparm` → `l_lowarm` this is `(0.2568, −0.0005, 0)`, essentially local +X.
- `R_rest` = `J`'s local rotation relative to its parent in the bind pose: the rotation part of the node's rest local transform, normalized for scale.
- `R_now` = `J`'s current local rotation relative to its parent: `bone.quaternion` in Three.js.
- `swing_deg = degrees(acos(clamp(dot(normalize(R_rest·d), normalize(R_now·d)), −1, 1)))`.

Both directions are in the parent's space. Twist about the bone axis does not change `swing_deg`. The rest pose gives exactly 0; the value is always in [0, 180].

**Epsilon at rest (added in Sprint 1.4A).** If `swing_deg < 0.01`, use 0. Round-off makes `acos` of two identical unit vectors return about 1e-6° instead of 0, and a pose reset rarely restores the rest quaternion bit-for-bit. This rule makes the rest weights exactly 0 regardless. The reference implementation is `services/garments/posing.py` `swing_deg` (`SWING_EPSILON_DEG`).

## 3b. `signed_swing_deg` (v2)

`swing_deg` has no direction: lowering an arm 15° gives the same value as raising it 15°. `signed_swing_deg` measures the swing within one plane, with a sign:

- `r = normalize(R_rest·d)` and `n = normalize(R_now·d)`: the rest and current bone directions in the parent's space, as in §3.
- `a` = the entry's `axis`, also in the parent's space. It must not be parallel to `r`.
- `e = normalize(a − (a·r)·r)`: the axis made perpendicular to the rest direction. `r` and `e` span the measurement plane.
- `signed_swing_deg = degrees(atan2(n·e, n·r))`, in (−180, 180]. It is positive when the bone has turned towards `axis` and negative when it has turned away. Motion out of the plane (for example a forward arm swing measured against an abduction axis) changes it very little, and twist does not change it at all.
- **Epsilon:** if `|signed_swing_deg| < 0.01`, use 0.

**Producer convention.** `axis` is the direction the bone tip starts to move in for the target's key motion, `ω × r_world`, expressed in the parent's rest frame, where `ω` is the key rotation's world axis signed by its angle. With the neutral MHR rig, the values are:

| Joint → child | Positive direction | `axis` (parent space) | Sanity values on the neutral avatar |
| --- | --- | --- | --- |
| `l_uparm` → `l_lowarm` | abduction (poses.ts `raise`) | [0.6731, 0.4009, −0.6214] | raise 90 → +89.84; raise 120 → +119.83; lower 20 → −19.97; lower 20 + walk swing 10 → −20.04; swing 10 alone → +0.08 |
| `r_uparm` → `r_lowarm` | abduction | [−0.6731, −0.4009, 0.6214] | as left |
| `l_upleg` / `r_upleg` → `*_lowleg` | hip flexion | [0, −0.0581, 0.9983] | flex 90 → +89.18; extension 15 → −14.89; abduction 20 → −0.36 |
| `l_lowleg` → `l_foot` | knee flexion | [−0.0262, 0.9992, 0.0312] | flex 90 → +89.25 |
| `r_lowleg` → `r_foot` | knee flexion | [0.0262, −0.9992, −0.0312] | flex 90 → +89.25 |

The reference implementation is `services/garments/posing.py` `signed_swing_deg`.

## 4. Weights

`weight = clamp((s − ramp[0]) / (ramp[1] − ramp[0]), 0, 1)`, where `s` is the entry's measure.

- **v2:** `ramp[0] ≠ ramp[1]`, in either order. `[0, -20]` means "0 at rest, 1 when the bone has turned 20° away from `axis`" (an arm lowered towards the body). `[0, 90]` means 0 at rest and 1 at +90°. Negative values are reached only by `signed_swing_deg`.

- **Additive:** at 120° both targets of a side are fully on (1 + 1); `abd120` holds only the correction beyond `abd90`. At 90°: `abd90` = 1, `abd120` = 0. At 45°: `abd90` = 0.5.
- **Independence:** each side reads only its own joint. Both arms raised is the sum of the left and right targets, whose vertex supports do not overlap.
- **Rest:** all weights are 0, so the rest geometry equals the base garment's exactly.

## 5. Consumer checklist (Three.js)

1. After applying the pose, read each `joint` bone's `quaternion` and compute the entry's measure with the rest local rotation captured at load: `swing_deg` (§3) or `signed_swing_deg` (§3b, `axis` from the sidecar). Apply the epsilon (|value| < 0.01 → 0). Accept sidecar versions 1 and 2 (§2).
2. Set `mesh.morphTargetInfluences[mesh.morphTargetDictionary[target]] = weight`, then render. The default skinned-mesh shader already applies morphs before skinning.
3. If the sidecar is missing, or names don't match, leave all influences at 0 (base garment behaviour) and report it.

## 6. Producer guarantees

- Deltas are non-zero only in the shoulder/underarm region of their own side, and fade smoothly to 0 at the region boundary.
- Rest POSITION, NORMAL, indices, skin weights and inverse binds are byte-equal to the base garment's (v2 for v5).
