import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { SkinnedMesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { bindGarment, rigFromSkinnedMesh } from "../lib/garment/binding.ts";
import { applyMeshInspection } from "../lib/garment/inspection.ts";
import { createCorrectiveDriver, parseSidecar } from "../lib/garment/correctives.ts";
import { createSidecarLoader } from "../lib/garment/demoResources.ts";
import { applyPose, captureBindPose, findPose } from "../lib/garment/poses.ts";
import { tryOnPose } from "../lib/garment/poseTransition.ts";
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
const rest = captureBindPose(rig.bones);
for (const [shirtVersion, pantsVersion] of [["v5", "v1"], ["v5.1", "v2"], ["v5.2", "v2"]]) {
  const shirtPath = `../../../outputs/garments/experiments/tshirt-${shirtVersion}-mhr-neutral.glb`;
  const pantsPath = `../../../outputs/garments/pants-basic-${pantsVersion}-mhr-neutral.glb`;
  const shirtFile = new URL(shirtPath, import.meta.url), pantsAsset = new URL(pantsPath, import.meta.url);
  const shirtSidecarPath = new URL(shirtPath.replace(/\.glb$/, ".correctives.json"), import.meta.url);
  const pantsSidecarPath = new URL(pantsPath.replace(/\.glb$/, ".correctives.json"), import.meta.url);
  if (![pantsAsset, pantsSidecarPath, shirtFile, shirtSidecarPath].every(existsSync)) { console.log(`${shirtVersion} / pants ${pantsVersion} corrective check skipped: optional assets unavailable`); continue; }
  applyPose(rig.bones, rest, findPose("rest"));
  const shirt = meshOf((await load(shirtPath)).scene);
  const pants = meshOf((await load(pantsPath)).scene);
  bindGarment(shirt, rig); bindGarment(pants, rig);
  const shirtJson = await readFile(shirtSidecarPath, "utf8"), pantsJson = await readFile(pantsSidecarPath, "utf8");
  const requests = [];
  const fetcher = async url => { requests.push(url); return new Response(url.includes("variant=pants") ? pantsJson : shirtJson); };
  const shirtLoader = createSidecarLoader(fetcher), pantsLoader = createSidecarLoader(fetcher);
  const shirtUrl = `/api/demo-garment?variant=${shirtVersion}`, pantsUrl = `/api/demo-garment?variant=${pantsVersion === "v1" ? "pants" : "pants-v2"}`;
  const shirtSidecar = await shirtLoader(shirtUrl);
  const pantsSidecar = await pantsLoader(pantsUrl);
  assert.deepEqual(requests, [`${shirtUrl}&sidecar=1`, `${pantsUrl}&sidecar=1`]);
  assert.deepEqual(pantsSidecar, parseSidecar(JSON.parse(pantsJson)));
  const driveShirt = createCorrectiveDriver(shirt, rig.bones, rest, shirtSidecar);
  const drivePants = createCorrectiveDriver(pants, rig.bones, rest, pantsSidecar);
  applyPose(rig.bones, rest, findPose("step"));
  const shirtWeights = driveShirt(true), pantsWeights = drivePants(true);
  assert.ok(pantsWeights.corr_L_hip90 > 0.95 && pantsWeights.corr_L_knee90 > 0.95);
  assert.equal(shirtWeights.corr_L_abd90, 0);
  if (shirtVersion !== "v5") assert.ok(shirtWeights.corr_L_hip90 > 0.95, `${shirtVersion} hem corrective responds to step`);
  assert.ok(Object.values(drivePants(false)).every(weight => weight === 0));
  applyPose(rig.bones, rest, findPose("both-90"));
  assert.equal(driveShirt(true).corr_L_abd90.toFixed(2), "1.00");
  assert.ok(Object.values(drivePants(true)).every(weight => weight === 0));
  assert.ok(shirt.morphTargetInfluences.some(weight => weight > 0.99));
  assert.ok(pants.morphTargetInfluences.every(weight => weight === 0));
  if (shirtVersion !== "v5") {
    assert.equal(shirtSidecar.version, 2); assert.equal(pantsSidecar.version, 2);
    applyPose(rig.bones, rest, tryOnPose("walk"));
    const walking = driveShirt(true);
    assert.equal(walking.corr_L_abd90, 0); assert.equal(walking.corr_R_abd90, 0);
    if (shirtVersion === "v5.2") {
      assert.ok(walking.corr_L_add20 > 0.95 && walking.corr_R_add20 > 0.95, `v5.2 adduction correctives engage on walk: ${JSON.stringify(walking)}`);
    }
  }
  console.log(`${shirtVersion} / pants ${pantsVersion} sidecars drive their real targets independently`);
}
