import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MathUtils, SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createCorrectiveDriver, parseSidecar } from "../lib/garment/correctives.ts";
const bytes = await readFile(new URL("fixtures/corrective.glb", import.meta.url));
const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "", resolve, reject));
let mesh; gltf.scene.traverse(node => { if (node instanceof SkinnedMesh) mesh = node; });
assert.ok(mesh);
const bones = new Map(mesh.skeleton.bones.map(b => [b.name, b]));
const rest = new Map([...bones].map(([n, b]) => [n, b.quaternion.clone()]));
const sidecar = parseSidecar(JSON.parse(await readFile(new URL("fixtures/corrective.correctives.json", import.meta.url), "utf8")));
const drive = createCorrectiveDriver(mesh, bones, rest, sidecar);
for (const [angle, expected] of [[0,0],[45,0],[90,0],[105,0.5],[120,1]]) {
  bones.get("arm").quaternion.setFromAxisAngle(new Vector3(0,0,1), MathUtils.degToRad(angle));
  assert.ok(Math.abs(drive(true).corr_L_abd90 - expected) < 1e-6);
  assert.ok(Math.abs(mesh.morphTargetInfluences[0] - expected) < 1e-6);
}
// The [0, 90] ramp exposes tiny residual swing after a pose reset.
const restRamp = createCorrectiveDriver(mesh, bones, rest, { version: 1, correctives: [{ ...sidecar.correctives[0], ramp: [0, 90] }] });
bones.get("arm").quaternion.setFromAxisAngle(new Vector3(0, 0, 1), MathUtils.degToRad(90));
assert.ok(Math.abs(restRamp(true).corr_L_abd90 - 1) < 1e-6);
bones.get("arm").quaternion.setFromAxisAngle(new Vector3(0, 0, 1), MathUtils.degToRad(0.005));
assert.equal(restRamp(true).corr_L_abd90, 0);
assert.equal(mesh.morphTargetInfluences[0], 0);
bones.get("arm").quaternion.setFromAxisAngle(new Vector3(0, 0, 1), MathUtils.degToRad(0.011));
assert.ok(Math.abs(restRamp(true).corr_L_abd90 - 0.011 / 90) < 1e-8);
// Rotation around the rest bone direction is twist and must not trigger the morph.
bones.get("arm").quaternion.setFromAxisAngle(new Vector3(0,1,0), MathUtils.degToRad(120));
assert.ok(drive(true).corr_L_abd90 < 1e-6);
assert.equal(drive(false).corr_L_abd90, 0);
mesh.morphTargetInfluences[0] = 1;
createCorrectiveDriver(mesh, bones, rest, null)(true);
assert.equal(mesh.morphTargetInfluences[0], 0);
const warnings = [];
createCorrectiveDriver(mesh, bones, rest, {version:1, correctives:[{...sidecar.correctives[0], target:"missing"}]}, message => warnings.push(message))(true);
assert.equal(warnings.length, 1); assert.match(warnings[0], /missing/);
const arm = bones.get("arm");
arm.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), MathUtils.degToRad(120));
const second = createCorrectiveDriver(mesh, bones, rest, { version: 1, correctives: [{ ...sidecar.correctives[0], child: "tip2" }] });
assert.ok(second(true).corr_L_abd90 < 1e-6);
const fallbackWarnings = [];
const legacy = createCorrectiveDriver(mesh, bones, rest, { version: 1, correctives: [{ target: "corr_L_abd90", joint: "arm", measure: "swing_deg", ramp: [90, 120] }] }, message => fallbackWarnings.push(message));
assert.ok(Math.abs(legacy(true).corr_L_abd90 - 1) < 1e-6);
assert.match(fallbackWarnings[0], /no child/);
const badWarnings = [];
const invalid = createCorrectiveDriver(mesh, bones, rest, {version:1, correctives:[{...sidecar.correctives[0], child:"not-a-child"}]}, message => badWarnings.push(message));
assert.deepEqual(invalid(true), {}); assert.equal(mesh.morphTargetInfluences[0], 0); assert.equal(badWarnings.length, 1);

console.log("Corrective driver fixture tests passed");
