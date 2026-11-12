import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { LEG_JOINTS, LEG_POSE_NAMES, TEST_POSES, applyPose, captureBindPose, findPose } from "../lib/garment/poses.ts";
const bytes = await readFile(new URL("../../../outputs/avatars/mhr-neutral.glb", import.meta.url));
const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "", resolve, reject));
let mesh; gltf.scene.traverse(child => { if (child instanceof SkinnedMesh) mesh = child; });
assert.ok(mesh);
const bones = new Map(mesh.skeleton.bones.map(b => [b.name, b]));
for (const config of Object.values(LEG_JOINTS)) assert.ok(bones.has(config.joint), `Missing ${config.joint}`);
const expected = {
  walk: [["l_upleg", 30], ["r_upleg", -15], ["l_lowleg", 20], ["r_lowleg", 20]],
  "l-hip-60": [["l_upleg", 60]], step: [["l_upleg", 90], ["l_lowleg", 90]],
  squat: [["l_upleg", 45], ["r_upleg", 45], ["l_lowleg", 60], ["r_lowleg", 60]],
  wide: [["l_upleg", 20], ["r_upleg", 20]],
};
for (const [name, rotations] of Object.entries(expected)) assert.deepEqual(findPose(name).rotations.map(({ joint, degrees }) => [joint, degrees]), rotations);
const bind = captureBindPose(bones);
const position = name => { gltf.scene.updateMatrixWorld(true); return bones.get(name).getWorldPosition(new Vector3()); };
const kneeRest = position(LEG_JOINTS.leftKnee.joint);
const footRest = position("l_foot");
const leftRest = kneeRest.clone(), rightRest = position(LEG_JOINTS.rightKnee.joint);
for (const name of LEG_POSE_NAMES) { applyPose(bones, bind, findPose(name)); assert.ok(findPose(name).rotations.length > 0); }
applyPose(bones, bind, findPose("l-hip-60"));
assert.ok(position(LEG_JOINTS.leftKnee.joint).z > kneeRest.z + 0.1, "left hip flex moves the knee forward");
applyPose(bones, bind, { name: "step", label: "knee direction check", rotations: [{ joint: LEG_JOINTS.leftKnee.joint, axis: LEG_JOINTS.leftKnee.flexAxis, degrees: 60 }] });
assert.ok(position("l_foot").z < footRest.z - 0.05, "knee flex moves the foot backward");
applyPose(bones, bind, findPose("wide"));
assert.ok(position(LEG_JOINTS.leftKnee.joint).x > leftRest.x, "left leg moves outward");
assert.ok(position(LEG_JOINTS.rightKnee.joint).x < rightRest.x, "right leg moves outward");
applyPose(bones, bind, findPose("rest"));
assert.ok(position(LEG_JOINTS.leftKnee.joint).distanceTo(kneeRest) < 1e-6, "rest restores the bind pose");
assert.equal(TEST_POSES.filter(p => p.name === "both-120").length, 1);
console.log("Leg pose joint, motion and reset checks passed (axes provisional)");
