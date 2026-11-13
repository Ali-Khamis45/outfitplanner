import { Matrix4, Skeleton } from "three";
import type { Bone, Object3D, SkinnedMesh } from "three";

/** The avatar's live bones and bind data, keyed by MHR joint name. */
export interface AvatarRig {
  bones: ReadonlyMap<string, Bone>;
  inverseBinds: ReadonlyMap<string, Matrix4>;
}

export interface BindingReport {
  joints: number;
  maxInverseBindDelta: number;
}

export class GarmentBindingError extends Error {
  name = "GarmentBindingError";
}

/** Inverse bind matrices are compared element-wise; anything above this means a different skeleton or bind pose. */
export const INVERSE_BIND_TOLERANCE = 1e-4;

/** Meshopt quantization postmultiplies every inverse bind by this mesh's
 * dequantization transform. Compare the original bind matrices, while keeping
 * the encoded matrices on the rendered skeleton. */
function inverseBindCompensation(mesh: SkinnedMesh): Matrix4 {
  let node: Object3D | null = mesh;
  while (node) {
    const value: unknown = node.userData.vwMeshoptBindCompensation;
    if (value !== undefined) {
      if (!Array.isArray(value) || value.length !== 16 || !value.every(Number.isFinite)) throw new GarmentBindingError("Invalid mesh compression bind transform.");
      const matrix = new Matrix4().fromArray(value);
      if (Math.abs(matrix.determinant()) < 1e-12) throw new GarmentBindingError("Invalid mesh compression bind transform.");
      return matrix.invert();
    }
    node = node.parent;
  }
  return new Matrix4();
}

export function rigFromSkinnedMesh(mesh: SkinnedMesh): AvatarRig {
  const bones = new Map<string, Bone>();
  const inverseBinds = new Map<string, Matrix4>();
  const inverseCompensation = inverseBindCompensation(mesh);
  mesh.skeleton.bones.forEach((bone, index) => {
    if (bones.has(bone.name)) throw new GarmentBindingError(`Avatar skeleton has a duplicate joint name: ${bone.name}`);
    bones.set(bone.name, bone);
    inverseBinds.set(bone.name, mesh.skeleton.boneInverses[index].clone().multiply(inverseCompensation));
  });
  return { bones, inverseBinds };
}

/**
 * Rebinds a garment SkinnedMesh to the avatar's bones by joint name, keeping the garment's own inverse
 * bind matrices after proving they equal the avatar's. The garment's private copy of the skeleton is
 * dropped, so one set of bones drives body and garment and no transform is applied twice.
 */
export function bindGarment(garment: SkinnedMesh, rig: AvatarRig, tolerance = INVERSE_BIND_TOLERANCE): BindingReport {
  const source = garment.skeleton;
  const inverseCompensation = inverseBindCompensation(garment);
  let maxInverseBindDelta = 0;
  const bones = source.bones.map((bone, index) => {
    const target = rig.bones.get(bone.name);
    const avatarInverse = rig.inverseBinds.get(bone.name);
    if (!target || !avatarInverse) throw new GarmentBindingError(`Avatar skeleton has no joint named "${bone.name}".`);
    const garmentInverse = source.boneInverses[index].clone().multiply(inverseCompensation).elements;
    avatarInverse.elements.forEach((value, element) => { maxInverseBindDelta = Math.max(maxInverseBindDelta, Math.abs(value - garmentInverse[element])); });
    return target;
  });
  if (maxInverseBindDelta > tolerance) {
    throw new GarmentBindingError(`Garment was fitted to a different skeleton or bind pose (inverse bind matrices differ by ${maxInverseBindDelta.toExponential(2)}).`);
  }
  // The garment and avatar meshes both sit at the scene origin, so the bind matrix is identity.
  garment.bind(new Skeleton(bones, source.boneInverses.map((matrix) => matrix.clone())), new Matrix4());
  return { joints: bones.length, maxInverseBindDelta };
}
