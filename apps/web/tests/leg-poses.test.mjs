import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MathUtils, Quaternion, SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { LEG_JOINTS, LEG_POSE_NAMES, TEST_POSES, applyPose, captureBindPose, findPose } from "../lib/garment/poses.ts";
const bytes = await readFile(new URL("../../../outputs/avatars/mhr-neutral.glb", import.meta.url));
const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "", resolve, reject));
let mesh; gltf.scene.traverse(child => { if (child instanceof SkinnedMesh) mesh = child; });
assert.ok(mesh);
const bones = new Map(mesh.skeleton.bones.map(b => [b.name, b]));
for (const config of Object.values(LEG_JOINTS)) assert.ok(bones.has(config.joint), `Missing ${config.joint}`);
const expected = {
  walk: [["l_upleg", -30], ["r_upleg", 15], ["l_lowleg", 20], ["r_lowleg", 20]],
  "l-hip-60": [["l_upleg", -60]], step: [["l_upleg", -90], ["l_lowleg", 90]],
  squat: [["l_upleg", -45], ["r_upleg", -45], ["l_lowleg", 60], ["r_lowleg", 60]],
  wide: [["l_upleg", 20], ["r_upleg", -20]],
};
for (const [name, rotations] of Object.entries(expected)) assert.deepEqual(findPose(name).rotations.map(({ joint, degrees }) => [joint, degrees]), rotations);
const expectedAxes = {
  rest: [], walk: [[1,0,0],[1,0,0],[1,0,0],[1,0,0]], "l-hip-60": [[1,0,0]],
  step: [[1,0,0],[1,0,0]], squat: [[1,0,0],[1,0,0],[1,0,0],[1,0,0]], wide: [[0,0,1],[0,0,1]],
};
for (const [name, axes] of Object.entries(expectedAxes)) assert.deepEqual(findPose(name).rotations.map(rotation => rotation.axis), axes);
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
const expectedDirections = {
  rest: [[0.119,-0.991,-0.058], [0.114,-0.988,-0.102]],
  walk: [[0.119,-0.887,0.445], [0.114,-0.991,0.071]],
  "l-hip-60": [[0.119,-0.546,0.830], [0.114,-0.583,0.805]],
  step: [[0.119,-0.058,0.991], [0.114,-0.988,-0.102]],
  squat: [[0.119,-0.742,0.660], [0.114,-0.928,-0.355]],
  wide: [[0.451,-0.891,-0.058], [0.445,-0.890,-0.102]],
};
for (const [name, vectors] of Object.entries(expectedDirections)) {
  applyPose(bones, bind, findPose(name));
  const thigh = position("l_lowleg").sub(position("l_upleg")).normalize();
  const shank = position("l_foot").sub(position("l_lowleg")).normalize();
  assert.ok(thigh.distanceTo(new Vector3(...vectors[0])) < 0.002, `${name} thigh differs from contract`);
  assert.ok(shank.distanceTo(new Vector3(...vectors[1])) < 0.002, `${name} shank differs from contract`);
}
// Independently derive both knees and feet from rest-space positions and the
// contract's world axes. This catches applying a knee axis in its parent's local space.
applyPose(bones, bind, findPose("rest"));
const restPositions = Object.fromEntries(["l_upleg", "l_lowleg", "l_foot", "r_upleg", "r_lowleg", "r_foot"].map(name => [name, position(name)]));
const rotationsByPose = {
  rest: [[0, 0, "x"], [0, 0, "x"]], walk: [[-30, 20, "x"], [15, 20, "x"]],
  "l-hip-60": [[-60, 0, "x"], [0, 0, "x"]], step: [[-90, 90, "x"], [0, 0, "x"]],
  squat: [[-45, 60, "x"], [-45, 60, "x"]], wide: [[20, 0, "z"], [-20, 0, "z"]],
};
for (const [name, sides] of Object.entries(rotationsByPose)) {
  applyPose(bones, bind, findPose(name));
  for (const [i, side] of ["l", "r"].entries()) {
    const [hipDegrees, kneeDegrees, axis] = sides[i];
    const hip = restPositions[`${side}_upleg`], knee = restPositions[`${side}_lowleg`], foot = restPositions[`${side}_foot`];
    const hipRotation = new Quaternion().setFromAxisAngle(new Vector3(axis === "x" ? 1 : 0, 0, axis === "z" ? 1 : 0), MathUtils.degToRad(hipDegrees));
    const kneeRotation = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), MathUtils.degToRad(kneeDegrees));
    const expectedKnee = knee.clone().sub(hip).applyQuaternion(hipRotation).add(hip);
    const expectedFoot = foot.clone().sub(knee).applyQuaternion(hipRotation).applyQuaternion(kneeRotation).add(expectedKnee);
    assert.ok(position(`${side}_lowleg`).distanceTo(expectedKnee) < 1e-5, `${name}: ${side} knee position`);
    assert.ok(position(`${side}_foot`).distanceTo(expectedFoot) < 1e-5, `${name}: ${side} foot position`);
  }
}
console.log("Leg pose table, directions, motion and reset checks passed");
