import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { bindGarment, rigFromSkinnedMesh } from "../../apps/web/lib/garment/binding.ts";
import { applyPose, captureBindPose, findPose } from "../../apps/web/lib/garment/poses.ts";
import { sideCoverage } from "../../apps/web/lib/garment/diagnostics.ts";

export function coverageGate(baseline, candidate) {
  return ["both-90", "both-120"].every(pose => ["left", "right"].every(side =>
    Number.isFinite(baseline[pose]?.[side]) && Number.isFinite(candidate[pose]?.[side]) && candidate[pose][side] > baseline[pose][side]));
}
async function load(path) {
  const bytes = await readFile(path);
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "", resolve, reject));
  let mesh; gltf.scene.traverse(child => { if (child instanceof SkinnedMesh) mesh = child; });
  if (!mesh) throw new Error(`No skinned mesh: ${path}`);
  return { scene: gltf.scene, mesh };
}
function positions(mesh) {
  const out = new Float64Array(mesh.geometry.attributes.position.count * 3), v = new Vector3();
  for (let i = 0; i < out.length / 3; i++) { mesh.getVertexPosition(i, v); out.set(v.toArray(), i * 3); }
  return out;
}
async function measure(avatarPath, garmentPath) {
  const avatar = await load(avatarPath), garment = await load(garmentPath);
  const rig = rigFromSkinnedMesh(avatar.mesh), bind = captureBindPose(rig.bones);
  bindGarment(garment.mesh, rig); avatar.scene.add(garment.mesh);
  const rest = avatar.mesh.geometry.attributes.position.array;
  const selection = {left: [], right: []};
  for (let v = 0; v < rest.length / 3; v++) {
    for (const [side, x] of [["left", 0.2], ["right", -0.2]])
      if (Math.hypot(rest[v * 3] - x, rest[v * 3 + 1] - 1.303, rest[v * 3 + 2] + 0.036) < 0.07) selection[side].push(v);
  }
  if (!selection.left.length || !selection.right.length) throw new Error("Empty armpit selection");
  const result = {};
  for (const pose of ["both-90", "both-120"]) {
    applyPose(rig.bones, bind, findPose(pose)); avatar.scene.updateMatrixWorld(true);
    avatar.mesh.skeleton.update(); garment.mesh.skeleton.update();
    const body = positions(avatar.mesh), shirt = positions(garment.mesh), index = garment.mesh.geometry.index.array;
    result[pose] = Object.fromEntries(Object.entries(selection).map(([side, selected]) => [side, sideCoverage(body, selected, shirt, index)]));
    const region = garment.mesh.geometry.getAttribute("_region");
    const sleeveIndex = [];
    for (let t = 0; t < index.length; t += 3) if ([0, 1, 2].some(k => region.getX(index[t+k]) > 0.5)) sleeveIndex.push(index[t], index[t+1], index[t+2]);
    result[pose].sleeveOnly = Object.fromEntries(Object.entries(selection).map(([side, selected]) => [side, sideCoverage(body, selected, shirt, sleeveIndex)]));
  }
  return result;
}
async function main() {
  const [avatar, baselinePath, candidatePath] = process.argv.slice(2);
  if (!avatar || !baselinePath || !candidatePath) throw new Error("Usage: node coverage.mjs avatar.glb v2.glb candidate.glb");
  const baseline = await measure(avatar, baselinePath), candidate = await measure(avatar, candidatePath);
  const pass = coverageGate(baseline, candidate);
  console.log(JSON.stringify({ metric: "provisional armpit side-ray coverage fraction per side", baseline, candidate, pass }, null, 2));
  if (!pass) process.exitCode = 1;
}
if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) await main();
