import { readFile } from "node:fs/promises";
import { SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { bindGarment, rigFromSkinnedMesh } from "../../apps/web/lib/garment/binding.ts";
import { applyPose, captureBindPose, findPose } from "../../apps/web/lib/garment/poses.ts";
import { createCorrectiveDriver, parseSidecar } from "../../apps/web/lib/garment/correctives.ts";
import { bodyPenetration } from "../../apps/web/lib/garment/diagnostics.ts";

async function load(path) {
  const b = await readFile(path);
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), "", resolve, reject));
  let mesh; gltf.scene.traverse(item => { if (item instanceof SkinnedMesh) mesh = item; });
  if (!mesh) throw Error(`No skinned mesh in ${path}`);
  return { scene: gltf.scene, mesh };
}
function positions(mesh) {
  const result = [], v = new Vector3();
  for (let i = 0; i < mesh.geometry.attributes.position.count; i++) { mesh.getVertexPosition(i, v); result.push(v.x, v.y, v.z); }
  return result;
}
const [avatarPath, garmentPath, pose] = process.argv.slice(2);
if (!avatarPath || !garmentPath || !pose) throw Error("Expected avatar, garment, and pose");
const avatar = await load(avatarPath), garment = await load(garmentPath);
const rig = rigFromSkinnedMesh(avatar.mesh), rest = captureBindPose(rig.bones);
bindGarment(garment.mesh, rig);
let sidecar = null;
try { sidecar = parseSidecar(JSON.parse(await readFile(garmentPath.replace(/\.glb$/i, ".correctives.json"), "utf8"))); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const drive = createCorrectiveDriver(garment.mesh, rig.bones, rest, sidecar, warning => console.error(warning));
avatar.scene.add(garment.mesh);
applyPose(rig.bones, rest, findPose(pose));
drive(true);
avatar.scene.updateMatrixWorld(true);
avatar.mesh.skeleton.update(); garment.mesh.skeleton.update();
const body = positions(avatar.mesh), cloth = positions(garment.mesh), faces = Array.from(avatar.mesh.geometry.index.array);
const approx = Array.from(bodyPenetration(body, faces, cloth), x => Number.isFinite(x) ? x : null);
const indices = avatar.mesh.geometry.attributes.skinIndex, weights = avatar.mesh.geometry.attributes.skinWeight;
const names = avatar.mesh.skeleton.bones.map(b => b.name);
const regions = [];
for (let i = 0; i < indices.count; i++) {
  let dominant = 0;
  for (let k = 1; k < 4; k++) if (weights.getComponent(i, k) > weights.getComponent(i, dominant)) dominant = k;
  const name = names[indices.getComponent(i, dominant)].toLowerCase();
  regions.push(/clav|shoulder/.test(name) ? "shoulder" : /uparm|lowarm|hand|wrist/.test(name) ? "arm" : "torso");
}
process.stdout.write(JSON.stringify({ body, cloth, faces, approx, regions }));
