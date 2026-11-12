import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { Bone, Object3D, SkinnedMesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DEFAULT_DEMO_VARIANT, createPantsChecker, createSidecarLoader, sidecarUrlForSelection } from "../lib/garment/demoResources.ts";
import { createCorrectiveDriver } from "../lib/garment/correctives.ts";
import { bindGarment, rigFromSkinnedMesh } from "../lib/garment/binding.ts";
import { applyPose, captureBindPose, findPose } from "../lib/garment/poses.ts";

const sidecar = { version: 1, correctives: ["L", "R"].map(side => ({ target: `corr_${side}_abd90`, joint: `${side.toLowerCase()}_uparm`, child: `${side.toLowerCase()}_lowarm`, measure: "swing_deg", ramp: [0, 90] })) };
const calls = [];
const fetcher = async url => {
  calls.push(url);
  return url.includes("sidecar") ? new Response(JSON.stringify(sidecar)) : new Response(null, { status: 404 });
};
const select = variant => ({ kind: "demo", variant, url: `/api/demo-garment?variant=${variant}` });
const load = createSidecarLoader(fetcher);
const pants = createPantsChecker("/api/demo-garment?variant=pants", fetcher);
const root = new Object3D();
const bones = new Map();
for (const side of ["l", "r"]) {
  const arm = new Bone(), child = new Bone();
  arm.name = `${side}_uparm`; child.name = `${side}_lowarm`; child.position.y = -1;
  root.add(arm); arm.add(child); bones.set(arm.name, arm); bones.set(child.name, child);
}
const bind = captureBindPose(bones);
const mesh = new SkinnedMesh();
mesh.morphTargetDictionary = { corr_L_abd90: 0, corr_R_abd90: 1 };
mesh.morphTargetInfluences = [0, 0];
async function verifyV5(selection) {
  const url = sidecarUrlForSelection(selection);
  const request = load(url);
  assert.equal(load(url), request, "effect replay should share the request");
  const driver = createCorrectiveDriver(mesh, bones, bind, await request);
  applyPose(bones, bind, findPose("both-90"));
  const weights = driver(true);
  assert.ok(Math.abs(weights.corr_L_abd90 - 1) < 1e-6);
  assert.ok(Math.abs(weights.corr_R_abd90 - 1) < 1e-6);
}
assert.equal(DEFAULT_DEMO_VARIANT, "v5");
await Promise.all([verifyV5(select(DEFAULT_DEMO_VARIANT)), pants(), pants()]);
assert.equal(calls.filter(url => url.includes("variant=pants")).length, 1);
assert.equal(calls.filter(url => url.includes("variant=v5&sidecar=1")).length, 1);
assert.equal(await load(sidecarUrlForSelection(select("v2"))), null);
await verifyV5(select("v5"));
assert.equal(calls.filter(url => url.includes("variant=v5&sidecar=1")).length, 2);
assert.equal(calls.filter(url => url.includes("variant=v2")).length, 0);
// A standalone pants fixture exercises separate loading and influence buffers even
// when the optional generated garment assets are absent.
const legBones = new Map();
for (const side of ["l", "r"]) {
  const hip = new Bone(), knee = new Bone(), foot = new Bone();
  hip.name = `${side}_upleg`; knee.name = `${side}_lowleg`; foot.name = `${side}_foot`;
  knee.position.y = -1; foot.position.y = -1; root.add(hip); hip.add(knee); knee.add(foot);
  for (const bone of [hip, knee, foot]) legBones.set(bone.name, bone);
}
const legBind = captureBindPose(legBones);
const pantsMesh = new SkinnedMesh();
pantsMesh.morphTargetDictionary = { corr_L_hip90: 0, corr_L_knee90: 1, corr_R_hip90: 2, corr_R_knee90: 3 };
pantsMesh.morphTargetInfluences = [0, 0, 0, 0];
const pantsFixture = { version: 1, correctives: ["L", "R"].flatMap(side => [
  { target: `corr_${side}_hip90`, joint: `${side.toLowerCase()}_upleg`, child: `${side.toLowerCase()}_lowleg`, measure: "swing_deg", ramp: [20, 90] },
  { target: `corr_${side}_knee90`, joint: `${side.toLowerCase()}_lowleg`, child: `${side.toLowerCase()}_foot`, measure: "swing_deg", ramp: [0, 90] },
]) };
let pantsRequests = 0;
const loadPantsSidecar = createSidecarLoader(async url => { assert.equal(url, "/api/demo-garment?variant=pants&sidecar=1"); pantsRequests++; return new Response(JSON.stringify(pantsFixture)); });
const pantsRequest = loadPantsSidecar("/api/demo-garment?variant=pants");
assert.equal(loadPantsSidecar("/api/demo-garment?variant=pants"), pantsRequest);
const drivePants = createCorrectiveDriver(pantsMesh, legBones, legBind, await pantsRequest);
applyPose(legBones, legBind, findPose("step"));
const legWeights = drivePants(true);
assert.ok(legWeights.corr_L_hip90 > 0.999 && legWeights.corr_L_knee90 > 0.999);
assert.equal(legWeights.corr_R_hip90, 0);
assert.equal(pantsRequests, 1);
const shirtBefore = [...mesh.morphTargetInfluences];
assert.ok(Object.values(drivePants(false)).every(weight => weight === 0));
assert.deepEqual(mesh.morphTargetInfluences, shirtBefore);
createCorrectiveDriver(pantsMesh, legBones, legBind, null)(true);
assert.ok(pantsMesh.morphTargetInfluences.every(weight => weight === 0));
// When the optional generated v5 is present, also exercise its real targets and the MHR rig.
const outputs = new URL("../../../outputs/", import.meta.url);
const avatarPath = new URL("avatars/mhr-neutral.glb", outputs);
const shirtPath = new URL("garments/experiments/tshirt-v5-mhr-neutral.glb", outputs);
const sidecarPath = new URL("garments/experiments/tshirt-v5-mhr-neutral.correctives.json", outputs);
if ([avatarPath, shirtPath, sidecarPath].every(existsSync)) {
  async function readMesh(path) {
    const bytes = await readFile(path);
    const scene = await new Promise((resolve, reject) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "", resolve, reject));
    let result; scene.scene.traverse(node => { if (node instanceof SkinnedMesh) result = node; });
    assert.ok(result); return result;
  }
  const avatar = await readMesh(avatarPath), shirt = await readMesh(shirtPath);
  const rig = rigFromSkinnedMesh(avatar), rest = captureBindPose(rig.bones);
  bindGarment(shirt, rig);
  const file = await readFile(sidecarPath, "utf8");
  const loadReal = createSidecarLoader(async () => new Response(file));
  for (let i = 0; i < 2; i++) {
    if (i) await loadReal(sidecarUrlForSelection(select("v2")));
    const driver = createCorrectiveDriver(shirt, rig.bones, rest, await loadReal(sidecarUrlForSelection(select("v5"))));
    applyPose(rig.bones, rest, findPose("both-90"));
    const actual = driver(true);
    assert.equal(actual.corr_L_abd90.toFixed(2), "1.00");
    assert.equal(actual.corr_R_abd90.toFixed(2), "1.00");
  }
  console.log("Generated v5 and neutral MHR rig passed default/re-selection checks");
} else console.log("Generated v5 integration check skipped: optional assets unavailable");
console.log("Default and re-selected v5 correctives and request lifecycle passed");
