import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { SkinnedMesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { bindGarment, rigFromSkinnedMesh } from "../lib/garment/binding.ts";
import { applyMeshInspection } from "../lib/garment/inspection.ts";
async function load(path) {
  const bytes = await readFile(new URL(path, import.meta.url));
  return await new Promise((resolve, reject) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "", resolve, reject));
}
function meshOf(scene) { let mesh; scene.traverse(item => { if (item instanceof SkinnedMesh) mesh = item; }); assert.ok(mesh); return mesh; }
const avatar = meshOf((await load("../../../outputs/avatars/mhr-neutral.glb")).scene);
const source = (await load("../../../outputs/garments/tshirt-v2-mhr-neutral.glb")).scene;
const upper = meshOf(clone(source)), lower = meshOf(clone(source));
upper.material = upper.material.clone(); lower.material = lower.material.clone();
const rig = rigFromSkinnedMesh(avatar);
bindGarment(upper, rig); bindGarment(lower, rig);
assert.notEqual(upper.skeleton, lower.skeleton);
assert.ok(upper.skeleton.bones.every((bone, i) => lower.skeleton.bones[i] === bone));
applyMeshInspection(upper, true, true); applyMeshInspection(lower, false, true);
assert.equal(upper.material.wireframe, true); assert.equal(lower.material.wireframe, false);
upper.visible = false; assert.equal(lower.visible, true);
console.log("Two garment instances bind to the same avatar with independent inspection state (shirt fixture used for both slots)");
const pantsFile = new URL("../../../outputs/garments/pants-basic-v1-mhr-neutral.glb", import.meta.url);
if (existsSync(pantsFile)) {
  const pants = meshOf((await load("../../../outputs/garments/pants-basic-v1-mhr-neutral.glb")).scene);
  const result = bindGarment(pants, rig);
  assert.equal(result.joints, rig.bones.size);
  assert.ok(pants.skeleton.bones.every(bone => rig.bones.get(bone.name) === bone));
  console.log("Neutral pants binds to the same avatar skeleton as the shirt");
} else console.log("Neutral pants binding skipped: asset not generated");
