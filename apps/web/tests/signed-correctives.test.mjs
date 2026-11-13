import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SkinnedMesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createCorrectiveDriver, parseSidecar } from "../lib/garment/correctives.ts";
import { applyPose, captureBindPose, findPose } from "../lib/garment/poses.ts";

const bytes = await readFile(new URL("../../../outputs/avatars/mhr-neutral.glb", import.meta.url));
const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "", resolve, reject));
let body; gltf.scene.traverse(node => { if (node instanceof SkinnedMesh) body = node; });
assert.ok(body);
const bones = new Map(body.skeleton.bones.map(bone => [bone.name, bone]));
const rest = captureBindPose(bones);
const mesh = new SkinnedMesh();
mesh.morphTargetDictionary = { raise: 0, lower: 1, hip: 2, knee: 3 };
mesh.morphTargetInfluences = [0, 0, 0, 0];
const sidecar = parseSidecar({ version: 2, correctives: [
  { target: "raise", joint: "l_uparm", child: "l_lowarm", measure: "signed_swing_deg", axis: [0.6731, 0.4009, -0.6214], ramp: [0, 120] },
  { target: "lower", joint: "l_uparm", child: "l_lowarm", measure: "signed_swing_deg", axis: [0.6731, 0.4009, -0.6214], ramp: [0, -20] },
  { target: "hip", joint: "l_upleg", child: "l_lowleg", measure: "signed_swing_deg", axis: [0, -0.0581, 0.9983], ramp: [0, 90] },
  { target: "knee", joint: "l_lowleg", child: "l_foot", measure: "signed_swing_deg", axis: [-0.0262, 0.9992, 0.0312], ramp: [0, 90] },
] });
const drive = createCorrectiveDriver(mesh, bones, rest, sidecar);
applyPose(bones, rest, findPose("both-90"));
assert.ok(Math.abs(drive(true).raise * 120 - 89.84) < 0.08);
assert.equal(drive(true).lower, 0);
applyPose(bones, rest, { name: "rest", label: "lower", rotations: [{ joint: "l_uparm", axis: [0, 0, 1], degrees: -20 }] });
assert.ok(Math.abs(drive(true).lower * 20 - 19.97) < 0.08);
assert.equal(drive(true).raise, 0);
applyPose(bones, rest, findPose("step"));
assert.ok(Math.abs(drive(true).hip * 90 - 89.18) < 0.08);
assert.ok(Math.abs(drive(true).knee * 90 - 89.25) < 0.08);
applyPose(bones, rest, findPose("rest"));
assert.ok(Object.values(drive(true)).every(weight => weight === 0));
console.log("Signed corrective angles match neutral MHR contract sanity values");
