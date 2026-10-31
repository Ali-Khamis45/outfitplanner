// Binds the generated T-shirt to the real MHR avatar with the viewer's own binding/pose modules and
// measures deformation and approximate garment-body intersection in controlled test poses.
// Usage: node tests/garment-binding.test.mjs   (personal variants run only if their private files exist)
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GarmentBindingError, bindGarment, rigFromSkinnedMesh } from "../lib/garment/binding.ts";
import { TEST_POSES, applyPose, captureBindPose } from "../lib/garment/poses.ts";

const outputs = new URL("../../../outputs/", import.meta.url);
const stem = "sam3d-person-front-sprint03-run2";
const VARIANTS = [
  { name: "neutral", avatar: "avatars/mhr-neutral.glb", garment: "garments/tshirt-mhr-neutral.glb", personal: false },
  { name: "personal-identity", avatar: `avatars/${stem}-rest-identity.glb`, garment: `garments/tshirt-${stem}-rest-identity.glb`, personal: true },
  { name: "personal-identity-scale", avatar: `avatars/${stem}-rest-identity-scale.glb`, garment: `garments/tshirt-${stem}-rest-identity-scale.glb`, personal: true },
];
const REGIONS = ["torso", "left_sleeve", "right_sleeve"];
const PENETRATION_TOLERANCE_M = 0.003; // nearest-vertex signed distance is approximate (~edge length)

async function load(relative) {
  const bytes = await readFile(new URL(relative, outputs));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(buffer, "", resolve, reject));
  let mesh;
  gltf.scene.traverse((item) => { if (item instanceof SkinnedMesh) mesh = item; });
  assert.ok(mesh, `${relative} has no SkinnedMesh`);
  return { scene: gltf.scene, mesh };
}

function skinnedPositions(mesh) {
  const count = mesh.geometry.getAttribute("position").count;
  const out = new Float32Array(count * 3);
  const v = new Vector3();
  for (let i = 0; i < count; i++) { mesh.getVertexPosition(i, v); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; }
  return out;
}

function vertexNormals(positions, index) {
  const normals = new Float32Array(positions.length);
  for (let f = 0; f < index.length; f += 3) {
    const [a, b, c] = [index[f] * 3, index[f + 1] * 3, index[f + 2] * 3];
    const e1 = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
    const e2 = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const p of [a, b, c]) { normals[p] += n[0]; normals[p + 1] += n[1]; normals[p + 2] += n[2]; }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= length; normals[i + 1] /= length; normals[i + 2] /= length;
  }
  return normals;
}

/** Uniform-grid nearest-vertex search over the body (exact nearest vertex, not nearest surface point). */
function nearestIndex(body, queries, cell = 0.03) {
  const key = (x, y, z) => `${x},${y},${z}`;
  const grid = new Map();
  for (let i = 0; i < body.length / 3; i++) {
    const k = key(Math.floor(body[i * 3] / cell), Math.floor(body[i * 3 + 1] / cell), Math.floor(body[i * 3 + 2] / cell));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const result = new Int32Array(queries.length / 3);
  for (let q = 0; q < result.length; q++) {
    const [x, y, z] = [queries[q * 3], queries[q * 3 + 1], queries[q * 3 + 2]];
    const [cx, cy, cz] = [Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / cell)];
    let best = -1, bestDistance = Infinity;
    for (let radius = 1; radius <= 6 && best < 0; radius++) {
      for (let i = -radius; i <= radius; i++) for (let j = -radius; j <= radius; j++) for (let k = -radius; k <= radius; k++) {
        for (const index of grid.get(key(cx + i, cy + j, cz + k)) ?? []) {
          const d = (body[index * 3] - x) ** 2 + (body[index * 3 + 1] - y) ** 2 + (body[index * 3 + 2] - z) ** 2;
          if (d < bestDistance) { bestDistance = d; best = index; }
        }
      }
    }
    assert.ok(best >= 0, "No body vertex within 18 cm of a garment vertex");
    result[q] = best;
  }
  return result;
}

const percentile = (values, p) => { const sorted = Float64Array.from(values).sort(); return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]; };
const round = (value, digits = 5) => Number(value.toFixed(digits));
const minOf = (values) => { let m = Infinity; for (const v of values) if (v < m) m = v; return m; };
const maxOf = (values) => { let m = -Infinity; for (const v of values) if (v > m) m = v; return m; };

function uniqueEdges(index) {
  const seen = new Set(), edges = [];
  for (let f = 0; f < index.length; f += 3) for (const [a, b] of [[index[f], index[f + 1]], [index[f + 1], index[f + 2]], [index[f + 2], index[f]]]) {
    const k = a < b ? a * 1e6 + b : b * 1e6 + a;
    if (!seen.has(k)) { seen.add(k); edges.push(a, b); }
  }
  return Int32Array.from(edges);
}

async function runVariant(variant) {
  const avatar = await load(variant.avatar);
  const garment = await load(variant.garment);
  const rig = rigFromSkinnedMesh(avatar.mesh);
  const binding = bindGarment(garment.mesh, rig);
  avatar.scene.add(garment.mesh); // one scene, one skeleton; the garment's own bone nodes are no longer used
  avatar.scene.updateMatrixWorld(true);
  const bind = captureBindPose(rig.bones);
  const garmentRest = garment.mesh.geometry.getAttribute("position").array;
  const bodyRest = avatar.mesh.geometry.getAttribute("position").array;
  const region = garment.mesh.geometry.getAttribute("_region").array;
  const openings = garment.mesh.userData.openingVertices;
  assert.ok(openings && openings.neck?.length > 0, "Garment GLB lacks opening vertex indices");
  const bodyIndex = avatar.mesh.geometry.index.array;
  const nearestAtRest = nearestIndex(bodyRest, garmentRest);
  const edges = uniqueEdges(garment.mesh.geometry.index.array);
  const restLength = new Float64Array(edges.length / 2);
  for (let e = 0; e < restLength.length; e++) { const [a, b] = [edges[e * 2] * 3, edges[e * 2 + 1] * 3]; restLength[e] = Math.hypot(garmentRest[a] - garmentRest[b], garmentRest[a + 1] - garmentRest[b + 1], garmentRest[a + 2] - garmentRest[b + 2]); }
  const results = {};
  const posedDir = new URL(`garment-tests/posed-${variant.name}/`, outputs);
  await mkdir(posedDir, { recursive: true });
  for (const pose of TEST_POSES) {
    applyPose(rig.bones, bind, pose);
    avatar.scene.updateMatrixWorld(true);
    const body = skinnedPositions(avatar.mesh);
    const cloth = skinnedPositions(garment.mesh);
    const normals = vertexNormals(body, bodyIndex);
    const nearest = nearestIndex(body, cloth);
    const perRegion = REGIONS.map(() => ({ vertices: 0, penetrating: 0, beyondTolerance: 0, deepest: 0, maxDisplacement: 0, followError: [] }));
    for (let i = 0; i < cloth.length / 3; i++) {
      const r = perRegion[Math.round(region[i])], b = nearest[i] * 3, p = i * 3;
      const signed = (cloth[p] - body[b]) * normals[b] + (cloth[p + 1] - body[b + 1]) * normals[b + 1] + (cloth[p + 2] - body[b + 2]) * normals[b + 2];
      r.vertices++;
      if (signed < 0) r.penetrating++;
      if (signed < -PENETRATION_TOLERANCE_M) r.beyondTolerance++;
      r.deepest = Math.min(r.deepest, signed);
      const move = [cloth[p] - garmentRest[p], cloth[p + 1] - garmentRest[p + 1], cloth[p + 2] - garmentRest[p + 2]];
      r.maxDisplacement = Math.max(r.maxDisplacement, Math.hypot(...move));
      const anchor = nearestAtRest[i] * 3;
      const bodyMove = [body[anchor] - bodyRest[anchor], body[anchor + 1] - bodyRest[anchor + 1], body[anchor + 2] - bodyRest[anchor + 2]];
      r.followError.push(Math.hypot(move[0] - bodyMove[0], move[1] - bodyMove[1], move[2] - bodyMove[2]));
    }
    const strain = new Float64Array(restLength.length);
    for (let e = 0; e < strain.length; e++) { const [a, b] = [edges[e * 2] * 3, edges[e * 2 + 1] * 3]; strain[e] = Math.hypot(cloth[a] - cloth[b], cloth[a + 1] - cloth[b + 1], cloth[a + 2] - cloth[b + 2]) / restLength[e]; }
    const neckJoint = rig.bones.get("c_neck").getWorldPosition(new Vector3());
    const neck = openings.neck;
    const neckCentroid = neck.reduce((sum, i) => sum.add(new Vector3(cloth[i * 3], cloth[i * 3 + 1], cloth[i * 3 + 2])), new Vector3()).divideScalar(neck.length);
    const neckBody = nearestIndex(body, Float32Array.from(neck.flatMap((i) => [cloth[i * 3], cloth[i * 3 + 1], cloth[i * 3 + 2]])));
    const neckClearance = minOf(neck.map((i, n) => { const b = neckBody[n] * 3; return (cloth[i * 3] - body[b]) * normals[b] + (cloth[i * 3 + 1] - body[b + 1]) * normals[b + 1] + (cloth[i * 3 + 2] - body[b + 2]) * normals[b + 2]; }));
    results[pose.name] = {
      regions: Object.fromEntries(REGIONS.map((name, k) => [name, { vertices: perRegion[k].vertices, penetrating: perRegion[k].penetrating, beyond3mm: perRegion[k].beyondTolerance, deepestM: round(perRegion[k].deepest), maxDisplacementM: round(perRegion[k].maxDisplacement), followErrorP95M: round(percentile(perRegion[k].followError, 0.95)), followErrorMaxM: round(maxOf(perRegion[k].followError)) }])),
      edgeStrain: { p01: round(percentile(strain, 0.01), 4), p99: round(percentile(strain, 0.99), 4), min: round(minOf(strain), 4), max: round(maxOf(strain), 4) },
      neck: { centroidToNeckJointHorizontalM: round(Math.hypot(neckCentroid.x - neckJoint.x, neckCentroid.z - neckJoint.z)), centroidBelowNeckJointM: round(neckJoint.y - neckCentroid.y), minClearanceM: round(neckClearance) },
    };
    await writeFile(new URL(`${pose.name}.body.f32`, posedDir), Buffer.from(body.buffer));
    await writeFile(new URL(`${pose.name}.garment.f32`, posedDir), Buffer.from(cloth.buffer));
  }
  applyPose(rig.bones, bind, TEST_POSES[0]);
  avatar.scene.updateMatrixWorld(true);
  const restCloth = skinnedPositions(garment.mesh);
  const bindDrift = maxOf(restCloth.map((value, i) => Math.abs(value - garmentRest[i])));
  return { binding, bindDriftM: bindDrift, garmentVertices: garmentRest.length / 3, poses: results };
}

async function expectRefusal(avatarPath, garmentPath) {
  const avatar = await load(avatarPath);
  const garment = await load(garmentPath);
  assert.throws(() => bindGarment(garment.mesh, rigFromSkinnedMesh(avatar.mesh)), GarmentBindingError);
  return `${garmentPath} refused on ${avatarPath}`;
}

const summary = { variants: {}, refusals: [], skipped: [] };
for (const variant of VARIANTS) {
  if (!existsSync(new URL(variant.avatar, outputs)) || !existsSync(new URL(variant.garment, outputs))) {
    assert.ok(variant.personal, `Required non-personal asset missing for ${variant.name}; run services/garments/generate_tshirt.py`);
    summary.skipped.push(variant.name);
    continue;
  }
  const result = await runVariant(variant);
  assert.ok(result.binding.maxInverseBindDelta < 1e-5, "Inverse binds must match");
  assert.ok(result.bindDriftM < 1e-5, `Garment drifts at bind pose (${result.bindDriftM})`);
  const rest = result.poses.rest.regions;
  for (const name of REGIONS) assert.equal(rest[name].beyond3mm, 0, `${variant.name}: ${name} penetrates the body at rest`);
  for (const [pose, moved, still] of [["left-90", "left_sleeve", "right_sleeve"], ["right-90", "right_sleeve", "left_sleeve"]]) {
    assert.ok(result.poses[pose].regions[moved].maxDisplacementM > 0.05, `${variant.name}: ${moved} must follow ${pose}`);
    assert.ok(result.poses[pose].regions[still].maxDisplacementM < 1e-5, `${variant.name}: ${still} must not move in ${pose}`);
  }
  assert.ok(result.poses["torso-twist"].regions.torso.maxDisplacementM > 0.02, `${variant.name}: torso must follow the spine rotation`);
  summary.variants[variant.name] = result;
}
summary.refusals.push(await expectRefusal("avatars/mhr-neutral.glb", `garments/tshirt-${stem}-rest-identity-scale.glb`).catch((error) => { if (error.code === "ENOENT") return "skipped (personal files absent)"; throw error; }));
summary.refusals.push(await expectRefusal(`avatars/${stem}.glb`, "garments/tshirt-mhr-neutral.glb").catch((error) => { if (error.code === "ENOENT") return "skipped (personal files absent)"; throw error; }));
await writeFile(new URL("garment-tests/deformation-summary.json", outputs), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, (key, value) => (key === "followError" ? undefined : value), 2));
