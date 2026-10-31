# Sprint 1.0 — Garment engine architecture

Sprint 1.0 adds a first, experimental garment layer: one procedural T-shirt, generated offline in Python, rebound at runtime in React Three Fiber to the avatar's existing MHR skeleton, and deformed by linear blend skinning. It is deliberately modular, with no cloth simulation, product ingestion or storage. Results are in [experiment-results.md](experiment-results.md), binding details in [garment-rigging.md](garment-rigging.md), and the acceptance matrix in [acceptance-criteria.md](acceptance-criteria.md).

## Boundaries

| Concern | Owner | Notes |
| --- | --- | --- |
| Avatar geometry | Official MHR model → official exporter (`external/MHR/web-viewer/exporters.py`, unmodified) | Neutral: `outputs/avatars/mhr-neutral.glb`. Personal rest-pose bodies are evaluated from parameters by [`services/garments/body.py`](../../services/garments/body.py). |
| Avatar skeleton | MHR, 127 joints | One skeleton drives body and garment at runtime. Neither file is ever re-rigged. |
| Garment geometry | [`services/garments/tshirt.py`](../../services/garments/tshirt.py) | A separate mesh with its own topology, thickness, rims and UVs. |
| Garment skin weights | `tshirt.transfer_weights` | Transferred from the body, then smoothed and reduced to 4 influences. |
| Garment materials | Garment GLB (PBR metallic-roughness) and the viewer | Base colour is adjustable at runtime; roughness and metalness come from the asset. |
| Fitting rules | `tshirt.FitRules` (frozen dataclass) | Every parameter is recorded in the garment metadata. |
| Garment-to-body binding | [`apps/web/lib/garment/binding.ts`](../../apps/web/lib/garment/binding.ts) | Binds by joint name, guarded by inverse-bind equality. The same module runs in the viewer and in Node tests. |
| Test poses | [`apps/web/lib/garment/poses.ts`](../../apps/web/lib/garment/poses.ts) | World-axis joint rotations about each pivot. Shared by the viewer and tests. |
| Garment asset loading | [`GarmentModel.tsx`](../../apps/web/components/avatar-lab/GarmentModel.tsx), `/api/demo-garment`, [`lib/localGlb.ts`](../../apps/web/lib/localGlb.ts) | The neutral demo is a fixed route; any other garment is a local file read in the browser. |
| Metadata contract | `GarmentAssetMetadata` in [`packages/contracts`](../../packages/contracts/src/index.ts) | Embedded in each GLB at `asset.extras.garment`. |

## Data flow

```text
Official MHR model ──evaluate rest pose──▶ RestBody (neutral | personal-identity | personal-identity-scale)
        │                                         │
        │                       design_tshirt(neutral) ── retarget(neutral → personal) ── clearance rule
        │                                         │
official exporter ─▶ avatar GLB          assemble (thickness, rims, UV seams) ─▶ garment GLB
        │                                         │   (own copy of the skeleton; official inverse binds)
        ▼                                         ▼
   AvatarModel ── rig (bones by name) ──▶ bindGarment ──▶ GarmentModel (SkinnedMesh sharing the avatar's bones)
        ▲                                                        ▲
     applyPose (test poses) ────────── same bones ───────────────┘
```

## Garment GLB format (schema 1)

- **One `SkinnedMesh`** with `POSITION`, `NORMAL`, `TEXCOORD_0`, `JOINTS_0` (u16), `WEIGHTS_0` (4 influences, normalized) and a custom `_REGION` attribute (0 torso, 1 left sleeve, 2 right sleeve).
- **The full 127-joint MHR skeleton** as nodes. Local transforms and inverse bind matrices are computed by the official exporter's `_validated_rig` from the target body's rest skeleton state, so they are identical to that body's avatar GLB.
- **Metadata at `asset.extras.garment`:** `GarmentAssetMetadata`, covering units, axes, skeleton hash, regions, openings, thickness, material, fit rules and provenance. `meshes[0].extras.openingVertices` lists the outer rim vertices of the hem, neck and sleeve openings, which the tests use.

## Runtime binding rules

1. Each garment joint name must exist on the avatar.
2. The garment's inverse bind matrices must equal the avatar's within 1e-4, or the garment is refused with `GarmentBindingError`. This rejects garments fitted to another skeleton (for example personal proportions on the neutral body) and the posed SAM GLB, whose bind pose is the estimated pose.
3. The garment keeps its own inverse binds but points at the avatar's bones. Its private bone nodes are discarded, and its bind matrix is identity because both meshes sit at the scene origin. No transform is applied twice.
4. Poses change only bone rotations: the body and garment deform together, and resetting restores the stored bind rotations.

## Privacy and assets

- The neutral garment derives only from the Apache-2.0 MHR model and procedural rules, so `/api/demo-garment` serves it from one fixed path.
- Personal rest-pose bodies and personal garment fits are written under the Git-ignored `outputs/`. They are never served; the lab loads them through a browser file picker (`blob:` URL, SHA-256 shown).
- `next dev` should be run on `127.0.0.1` (the server used here listens on loopback only).

## Out of scope (by design)

There is no cloth simulation, collision response, sizing, garment upload or storage, authentication, payments, scraping or AI garment generation.
