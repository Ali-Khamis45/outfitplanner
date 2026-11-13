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

// Version 2 measures a signed angle in the rest-direction/axis plane.
const signedEntry = { target: "corr_L_abd90", joint: "arm", child: "tip", measure: "signed_swing_deg", axis: [-1, 0, 0], ramp: [0, 90] };
const signed = parseSidecar({ version: 2, correctives: [signedEntry] });
const signedDriver = createCorrectiveDriver(mesh, bones, rest, signed);
for (const [degrees, expected] of [[0, 0], [45, 0.5], [90, 1], [-20, 0]]) {
  arm.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), MathUtils.degToRad(degrees));
  assert.ok(Math.abs(signedDriver(true).corr_L_abd90 - expected) < 1e-6, `signed raising/lowering ${degrees}`);
}
const reverse = createCorrectiveDriver(mesh, bones, rest, parseSidecar({ version: 2, correctives: [{ ...signedEntry, ramp: [0, -20] }] }));
for (const [degrees, expected] of [[0, 0], [-10, 0.5], [-20, 1], [45, 0], [-0.005, 0]]) {
  arm.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), MathUtils.degToRad(degrees));
  assert.ok(Math.abs(reverse(true).corr_L_abd90 - expected) < 1e-6, `reverse ramp ${degrees}`);
}
arm.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), MathUtils.degToRad(45));
assert.equal(reverse(true).corr_L_abd90, 0, "out-of-plane swing should not activate this target");
assert.throws(() => parseSidecar({ version: 1, correctives: [signedEntry] }), /Invalid/);
assert.throws(() => parseSidecar({ version: 3, correctives: [] }), /Invalid/);
assert.throws(() => parseSidecar({ version: 2, correctives: [{ ...signedEntry, measure: "unknown" }] }), /Invalid/);
assert.throws(() => parseSidecar({ version: 2, correctives: [{ ...signedEntry, axis: [0, 0, 0] }] }), /Invalid/);
assert.throws(() => parseSidecar({ version: 2, correctives: [{ ...signedEntry, ramp: [0, 0] }] }), /Invalid/);
const parallelWarnings = [];
const parallel = createCorrectiveDriver(mesh, bones, rest, parseSidecar({ version: 2, correctives: [{ ...signedEntry, axis: [0, 1, 0] }] }), message => parallelWarnings.push(message));
assert.deepEqual(parallel(true), {}); assert.equal(mesh.morphTargetInfluences[0], 0); assert.match(parallelWarnings[0], /parallel/);

console.log("Corrective driver fixture tests passed");
