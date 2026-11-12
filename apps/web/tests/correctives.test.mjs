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
console.log("Corrective driver fixture tests passed");
