// Sprint 1.1 pose-suite deformation diagnostics for garment/avatar pairs, using the viewer's own binding and pose code.
// Usage: node --no-warnings tests/garment-quality.test.mjs [label ...]   (default: every pair whose files exist)
import assert from "node:assert/strict";
import { TARGETS, evaluateSupportedPoses } from "./garment-quality-gates.mjs";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createCorrectiveDriver, parseSidecar } from "../lib/garment/correctives.ts";
import { bindGarment, rigFromSkinnedMesh } from "../lib/garment/binding.ts";
import { bodyPenetration, countWhere, maxOf, minOf, percentile, selfIntersections, sideCoverage, triangleDeformation, weldIds } from "../lib/garment/diagnostics.ts";
import { TEST_POSES, applyPose, captureBindPose } from "../lib/garment/poses.ts";

const outputs = new URL("../../../outputs/", import.meta.url);
const stem = "sam3d-person-front-sprint03-run2";
// Sprint 1.4A's supported-pose acceptance gates; other measurements remain informational.
const TARGET_POSES = ["rest", "left-30", "left-60", "left-90", "right-90", "both-90", "torso-twist", "combined", "walk", "l-hip-60", "step", "squat", "wide"]; // both-120 is diagnostic only
const PAIRS = [
  { label: "v1-neutral", avatar: "avatars/mhr-neutral.glb", garment: "garments/tshirt-mhr-neutral.glb", gate: false },
  { label: "v2-neutral", avatar: "avatars/mhr-neutral.glb", garment: "garments/tshirt-v2-mhr-neutral.glb", gate: false, baseline: "v1-neutral" },
  { label: "v3-close1-neutral", avatar: "avatars/mhr-neutral.glb", garment: "garments/experiments/tshirt-v3-close1-mhr-neutral.glb", gate: false, baseline: "v1-neutral" },
  { label: "v5-neutral", avatar: "avatars/mhr-neutral.glb", garment: "garments/experiments/tshirt-v5-mhr-neutral.glb", sidecar: "garments/experiments/tshirt-v5-mhr-neutral.correctives.json", gate: true, baseline: "v1-neutral" },
  { label: "v4-gusset-neutral", avatar: "avatars/mhr-neutral.glb", garment: "garments/experiments/tshirt-v4-mhr-neutral.glb", gate: false, baseline: "v1-neutral" },
  { label: "ablation-separation-only", avatar: "avatars/mhr-neutral.glb", garment: "garments/experiments/tshirt-v2-separation-only-mhr-neutral.glb", gate: false },
  { label: "ablation-weights-only", avatar: "avatars/mhr-neutral.glb", garment: "garments/experiments/tshirt-v2-weights-only-mhr-neutral.glb", gate: false },
  { label: "v2-lod-neutral", avatar: "avatars/mhr-neutral.glb", garment: "garments/tshirt-v2-lod-mhr-neutral.glb", gate: false, baseline: "v1-neutral" },
  { label: "v1-personal-identity", avatar: `avatars/${stem}-rest-identity.glb`, garment: `garments/tshirt-${stem}-rest-identity.glb`, gate: false },
  { label: "v2-personal-identity", avatar: `avatars/${stem}-rest-identity.glb`, garment: `garments/tshirt-v2-${stem}-rest-identity.glb`, gate: false, baseline: "v1-personal-identity" },
  { label: "v1-personal-identity-scale", avatar: `avatars/${stem}-rest-identity-scale.glb`, garment: `garments/tshirt-${stem}-rest-identity-scale.glb`, gate: false },
  { label: "v2-personal-identity-scale-floor", avatar: `avatars/${stem}-rest-identity-scale-floor.glb`, garment: `garments/tshirt-v2-${stem}-rest-identity-scale-floor.glb`, gate: false, baseline: "v1-personal-identity-scale" },
];
const REGIONS = ["torso", "left_sleeve", "right_sleeve"];

async function load(relative) {
  const bytes = await readFile(new URL(relative, outputs));
  const started = performance.now();
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "", resolve, reject));
  const parseMs = performance.now() - started;
  let mesh;
  gltf.scene.traverse((item) => { if (item instanceof SkinnedMesh) mesh = item; });
  assert.ok(mesh, `${relative} has no SkinnedMesh`);
  return { scene: gltf.scene, mesh, parseMs, bytes: bytes.length, regions: gltf.parser.json.asset?.extras?.garment?.regions ?? REGIONS };
}

function skinned(mesh) {
  const count = mesh.geometry.getAttribute("position").count, out = new Float64Array(count * 3), v = new Vector3();
  for (let i = 0; i < count; i++) { mesh.getVertexPosition(i, v); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; }
  return out;
}

const r = (value, digits = 4) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : value);

function influences(mesh, vertices) {
  const joints = mesh.geometry.getAttribute("skinIndex"), weights = mesh.geometry.getAttribute("skinWeight"), total = new Map();
  for (const v of vertices) for (let k = 0; k < 4; k++) {
    const w = weights.getComponent(v, k);
    if (w > 1e-4) { const name = mesh.skeleton.bones[joints.getComponent(v, k)].name; total.set(name, (total.get(name) ?? 0) + w / vertices.length); }
  }
  return Object.fromEntries([...total].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, w]) => [name, r(w, 3)]));
}

/** Triangles whose vertices mix torso and arm influences: the shoulder/underarm transition band. */
function transitionTriangles(mesh) {
  const joints = mesh.geometry.getAttribute("skinIndex"), weights = mesh.geometry.getAttribute("skinWeight"), index = mesh.geometry.index.array;
  const armMass = new Float64Array(joints.count);
  for (let v = 0; v < joints.count; v++) for (let k = 0; k < 4; k++) if (/_(uparm|lowarm)/.test(mesh.skeleton.bones[joints.getComponent(v, k)].name)) armMass[v] += weights.getComponent(v, k);
  const result = new Uint8Array(index.length / 3);
  for (let t = 0; t < result.length; t++) {
    const masses = [armMass[index[t * 3]], armMass[index[t * 3 + 1]], armMass[index[t * 3 + 2]]];
    result[t] = Math.max(...masses) > 0.05 && Math.min(...masses) < 0.95 ? 1 : 0;
  }
  return result;
}

async function runPair(pair) {
  const avatar = await load(pair.avatar), garment = await load(pair.garment);
  const rig = rigFromSkinnedMesh(avatar.mesh);
  const binding = bindGarment(garment.mesh, rig);
  avatar.scene.add(garment.mesh);
  const bind = captureBindPose(rig.bones);
  let drive = null;
  if (pair.sidecar) {
    const sidecar = parseSidecar(JSON.parse(await readFile(new URL(pair.sidecar, outputs), "utf8")));
    const expected = ["corr_L_abd90", "corr_L_abd120", "corr_R_abd90", "corr_R_abd120"];
    for (const name of expected) {
      assert.ok(sidecar.correctives.some(entry => entry.target === name && entry.child), `v5 sidecar lacks ${name} or its child`);
      assert.notEqual(garment.mesh.morphTargetDictionary?.[name], undefined, `v5 mesh lacks ${name}`);
    }
    drive = createCorrectiveDriver(garment.mesh, rig.bones, bind, sidecar, message => { throw new Error(message); });
  }
  const index = garment.mesh.geometry.index.array, bodyIndex = avatar.mesh.geometry.index.array;
  const region = garment.mesh.geometry.getAttribute("_region").array;
  const restGarment = Float64Array.from(garment.mesh.geometry.getAttribute("position").array);
  const restBody = Float64Array.from(avatar.mesh.geometry.getAttribute("position").array);
  const welded = weldIds(restGarment);
  const regionNames = garment.regions;
  // Armpit skin for the side-coverage metric: body vertices within 7 cm of either axilla at rest (same set for every garment).
  const axillae = [[0.2, 1.303, -0.036], [-0.2, 1.303, -0.036]];
  const armpit = []; for (let v = 0; v < restBody.length / 3; v++) if (axillae.some(([x, y, z]) => Math.hypot(restBody[v * 3] - x, restBody[v * 3 + 1] - y, restBody[v * 3 + 2] - z) < 0.07)) armpit.push(v);
  const sharedBones = garment.mesh.skeleton.bones.every((bone) => rig.bones.get(bone.name) === bone);
  const transition = transitionTriangles(garment.mesh);
  const restSelf = selfIntersections(restGarment, index, welded);
  const poses = {};
  for (const pose of TEST_POSES) {
    applyPose(rig.bones, bind, pose);
    const correctiveWeights = drive ? drive(true) : {};
    avatar.scene.updateMatrixWorld(true);
    garment.mesh.skeleton.update();
    avatar.mesh.skeleton.update();
    const posed = skinned(garment.mesh), posedBody = skinned(avatar.mesh);
    const skin = { joints: garment.mesh.geometry.getAttribute("skinIndex").array, weights: garment.mesh.geometry.getAttribute("skinWeight").array, boneMatrices: garment.mesh.skeleton.boneMatrices };
    const bodySkin = { joints: avatar.mesh.geometry.getAttribute("skinIndex").array, weights: avatar.mesh.geometry.getAttribute("skinWeight").array, boneMatrices: avatar.mesh.skeleton.boneMatrices };
    const d = triangleDeformation(restGarment, posed, index, skin);
    const body = triangleDeformation(restBody, posedBody, bodyIndex, bodySkin);
    const self = selfIntersections(posed, index, welded);
    const signed = bodyPenetration(posedBody, bodyIndex, posed);
    const transitionStretch = d.stretch.filter((_, t) => transition[t]);
    const worst = [...d.stretch.keys()].sort((a, b) => d.stretch[b] - d.stretch[a]).slice(0, 6).map((t) => {
      const verts = [index[t * 3], index[t * 3 + 1], index[t * 3 + 2]];
      const centre = [0, 1, 2].map((axis) => r(verts.reduce((s, v) => s + restGarment[v * 3 + axis], 0) / 3, 3));
      return { face: t, region: regionNames[Math.round(region[verts[0]])], stretch: r(d.stretch[t], 2), areaRatio: r(d.areaRatio[t], 2), restCentre: centre, vertices: verts, influences: influences(garment.mesh, verts) };
    });
    const penetration = Object.fromEntries(regionNames.map((name, k) => { const values = signed.filter((_, v) => Math.round(region[v]) === k); return [name, { beyond3mm: countWhere(values, (x) => x < -0.003), deepestM: r(Math.min(0, minOf(values)), 4) }]; }));
    const coverage = sideCoverage(posedBody, armpit, posed, index);
    poses[pose.name] = {
      stretch: { p95: r(percentile(d.stretch, 0.95)), p99: r(percentile(d.stretch, 0.99)), max: r(maxOf(d.stretch)), minCompression: r(minOf(d.compression)) },
      transitionBand: { triangles: transitionStretch.length, p99: r(percentile(transitionStretch, 0.99)), max: r(maxOf(transitionStretch)) },
      area: { p01: r(percentile(d.areaRatio, 0.01)), p99: r(percentile(d.areaRatio, 0.99)), max: r(maxOf(d.areaRatio)) },
      flipped: countWhere(d.flipped, (x) => x > 0), degenerate: countWhere(d.degenerate, (x) => x > 0), normalDeviationOver60: countWhere(d.normalDeviationDeg, (x) => x > 60),
      selfIntersectingPairs: self.pairs, selfIntersectingPairsAboveRest: Math.max(0, self.pairs - restSelf.pairs),
      penetration, penetratingBeyond3mm: Object.values(penetration).reduce((s, x) => s + x.beyond3mm, 0), deepestPenetrationM: Math.min(...Object.values(penetration).map((x) => x.deepestM)),
      armpitSideCoverage: r(coverage, 3), correctiveWeights,
      bodyReference: { p99: r(percentile(body.stretch, 0.99)), max: r(maxOf(body.stretch)), flipped: countWhere(body.flipped, (x) => x > 0) },
      worst,
    };
  }
  applyPose(rig.bones, bind, TEST_POSES[0]);
  if (drive) drive(true);
  avatar.scene.updateMatrixWorld(true);
  const after = skinned(garment.mesh);
  let drift = 0;
  for (let i = 0; i < after.length; i++) drift = Math.max(drift, Math.abs(after[i] - restGarment[i]));
  return { avatar: pair.avatar, garment: pair.garment, glbBytes: garment.bytes, parseMs: r(garment.parseMs, 1), vertices: restGarment.length / 3, triangles: index.length / 3, binding, sharedBones, bindDriftM: drift, restSelfIntersectingPairs: restSelf.pairs, poses };
}

const garmentFlag = process.argv.indexOf("--garment");
if (garmentFlag > 0) { // ad-hoc experiment on the neutral avatar: --garment garments/experiments/<file>.glb
  const garment = process.argv[garmentFlag + 1];
  PAIRS.push({ label: garment.split("/").pop().replace(".glb", ""), avatar: "avatars/mhr-neutral.glb", garment, gate: false });
  process.argv.splice(garmentFlag, 2, PAIRS.at(-1).label);
}
const requested = process.argv.slice(2);
const report = { targets: TARGETS, targetPoses: TARGET_POSES, pairs: {}, skipped: [], failures: [] };
for (const pair of PAIRS) {
  if (requested.length && !requested.includes(pair.label)) continue;
  if (!existsSync(new URL(pair.avatar, outputs)) || !existsSync(new URL(pair.garment, outputs))) { if (pair.gate) report.failures.push(`${pair.label}: required v5 asset or avatar missing`); else report.skipped.push(pair.label); continue; }
  const result = await runPair(pair);
  report.pairs[pair.label] = result;
  if (pair.gate && !result.sharedBones) report.failures.push(`${pair.label}: garment is not driven by the avatar bones`);
  if (pair.gate && result.bindDriftM >= 1e-5) report.failures.push(`${pair.label}: bind drift ${result.bindDriftM}`);
}
report.gates = {};
for (const pair of PAIRS) {
  const result = report.pairs[pair.label];
  if (!pair.gate || !result) continue;
  const evaluated = evaluateSupportedPoses(result.poses, TARGET_POSES);
  report.gates[pair.label] = evaluated.gates;
  report.failures.push(...evaluated.failures.map(failure => `${pair.label} ${failure}`));
}
await mkdir(new URL("garment-tests/", outputs), { recursive: true });
await writeFile(new URL(`garment-tests/quality${requested.length ? "-" + requested.join("+") : ""}.json`, outputs), JSON.stringify(report, null, 2));
for (const [label, result] of Object.entries(report.pairs)) {
  console.log(`\n${label}: ${result.vertices} v / ${result.triangles} t, ${(result.glbBytes / 1e6).toFixed(2)} MB, parse ${result.parseMs} ms, IBM Δ ${result.binding.maxInverseBindDelta.toExponential(1)}, rest self-pairs ${result.restSelfIntersectingPairs}`);
  console.log("pose         stretch p95/p99/max   band p99/max   area p01-p99   flip degen n>60  self(+rest) pen>3mm | body p99/max");
  for (const [name, p] of Object.entries(result.poses)) console.log(`${name.padEnd(12)} ${`${p.stretch.p95}/${p.stretch.p99}/${p.stretch.max}`.padEnd(21)} ${`${p.transitionBand.p99}/${p.transitionBand.max}`.padEnd(14)} ${`${p.area.p01}-${p.area.p99}`.padEnd(14)} ${String(p.flipped).padStart(4)} ${String(p.degenerate).padStart(5)} ${String(p.normalDeviationOver60).padStart(5)}  ${`${p.selfIntersectingPairs}(+${p.selfIntersectingPairsAboveRest})`.padEnd(11)} ${String(p.penetratingBeyond3mm).padStart(6)} | ${p.bodyReference.p99}/${p.bodyReference.max}`);
}
if (report.skipped.length) console.log("\nskipped (files absent):", report.skipped.join(", "));
if (report.failures.length) { console.log("\nTARGET FAILURES:\n  " + report.failures.join("\n  ")); process.exitCode = 1; }
