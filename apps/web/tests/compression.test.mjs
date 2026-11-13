import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Matrix3, Matrix4, SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { compressedAsset } from "../asset-compression/compress.mjs";
import { bindGarment, rigFromSkinnedMesh } from "../lib/garment/binding.ts";
import { createCorrectiveDriver, parseSidecar } from "../lib/garment/correctives.ts";
import { applyPose, captureBindPose, findPose } from "../lib/garment/poses.ts";
import { tryOnPose } from "../lib/garment/poseTransition.ts";

const outputs = new URL("../../../outputs/", import.meta.url);
const avatarPath = new URL("avatars/mhr-neutral.glb", outputs);
const shirtPath = new URL("garments/experiments/tshirt-v5.2-mhr-neutral.glb", outputs);
const sidecarPath = new URL("garments/experiments/tshirt-v5.2-mhr-neutral.correctives.json", outputs);
if (![avatarPath, shirtPath, sidecarPath].every(existsSync)) {
  console.log("Compression integration skipped: neutral avatar or v5.2 assets unavailable");
} else {
  async function load(bytes) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await new Promise((resolve, reject) => loader.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "", resolve, reject));
    let mesh; gltf.scene.traverse(node => { if (node instanceof SkinnedMesh) mesh = node; });
    assert.ok(mesh); gltf.scene.updateMatrixWorld(true); return mesh;
  }
  const baseAvatar = await readFile(avatarPath), baseShirt = await readFile(shirtPath);
  const tempRoot = path.resolve(os.tmpdir()), cache = await mkdtemp(path.join(tempRoot, "vw-compression-test-"));
  assert.ok(cache.startsWith(`${tempRoot}${path.sep}vw-compression-test-`));
  try {
    const [packedAvatar, packedShirt, again] = await Promise.all([compressedAsset(avatarPath, cache), compressedAsset(shirtPath, cache), compressedAsset(shirtPath, cache)]);
    assert.deepEqual(packedShirt, again, "concurrent requests share the same bytes");
    assert.equal((await readdir(cache)).filter(file => file.endsWith(".glb")).length, 2, "different source hashes have separate cache entries");
    const originalBody = await load(baseAvatar), compressedBody = await load(packedAvatar);
    const originalShirt = await load(baseShirt), compressedShirt = await load(packedShirt);
    assert.deepEqual(Object.keys(compressedShirt.morphTargetDictionary), Object.keys(originalShirt.morphTargetDictionary));
    assert.deepEqual(compressedBody.skeleton.bones.map(bone => bone.name), originalBody.skeleton.bones.map(bone => bone.name));
    assert.deepEqual(compressedShirt.skeleton.bones.map(bone => bone.name), originalShirt.skeleton.bones.map(bone => bone.name));
    const weightTotals = mesh => {
      const index = mesh.geometry.getAttribute("skinIndex"), weight = mesh.geometry.getAttribute("skinWeight"), totals = new Map();
      assert.equal(index.count, weight.count);
      for (let i = 0; i < index.count; i++) for (let j = 0; j < 4; j++) {
        const joint = index.getComponent(i, j), influence = weight.getComponent(i, j);
        if (influence > 0) totals.set(joint, (totals.get(joint) ?? 0) + influence);
      }
      return totals;
    };
    assert.equal(originalShirt.geometry.getAttribute("skinWeight").count, compressedShirt.geometry.getAttribute("skinWeight").count);
    const rawWeights = weightTotals(originalShirt), packedWeights = weightTotals(compressedShirt);
    for (const [joint, total] of rawWeights) assert.ok(Math.abs((packedWeights.get(joint) ?? 0) - total) < Math.max(0.03, total * 0.002), `aggregate weight for joint ${joint}`);
    for (const [joint, total] of packedWeights) assert.ok(Math.abs((rawWeights.get(joint) ?? 0) - total) < Math.max(0.03, total * 0.002), `unexpected weight for joint ${joint}`);
    // Meshopt reorders vertices. Match samples spatially after undoing position
    // quantization and compare their joint/weight pairs and morph deltas.
    const rawPositions = originalShirt.geometry.getAttribute("position"), packedPositions = compressedShirt.geometry.getAttribute("position");
    const cellSize = 0.001, grid = new Map(), cell = n => Math.floor(n / cellSize), key = (x, y, z) => `${x},${y},${z}`;
    for (let i = 0; i < rawPositions.count; i++) {
      const k = key(cell(rawPositions.getX(i)), cell(rawPositions.getY(i)), cell(rawPositions.getZ(i)));
      if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
    }
    const influences = (mesh, i) => {
      const indices = mesh.geometry.getAttribute("skinIndex"), weights = mesh.geometry.getAttribute("skinWeight"), out = new Map();
      for (let j = 0; j < 4; j++) { const w = weights.getComponent(i, j); if (w > 0) { const joint = indices.getComponent(i, j); out.set(joint, (out.get(joint) ?? 0) + w); } }
      return out;
    };
    const transform = new Matrix4().fromArray(compressedShirt.userData.vwMeshoptBindCompensation), linear = new Matrix3().setFromMatrix4(transform);
    for (let i = 0; i < packedPositions.count; i += 67) {
      const position = new Vector3().fromBufferAttribute(packedPositions, i).applyMatrix4(transform), packedInfluences = influences(compressedShirt, i);
      let best = null, bestDifference = Infinity;
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
        for (const candidate of grid.get(key(cell(position.x) + x, cell(position.y) + y, cell(position.z) + z)) ?? []) {
          const distance = position.distanceTo(new Vector3().fromBufferAttribute(rawPositions, candidate));
          if (distance > 0.0003) continue;
          const rawInfluences = influences(originalShirt, candidate);
          const joints = new Set([...rawInfluences.keys(), ...packedInfluences.keys()]);
          let difference = 0; for (const joint of joints) difference += Math.abs((rawInfluences.get(joint) ?? 0) - (packedInfluences.get(joint) ?? 0));
          if (difference < bestDifference) { best = candidate; bestDifference = difference; }
        }
      }
      assert.ok(best !== null && bestDifference < 0.002, `sample ${i} retains per-vertex skin weights`);
      for (let target = 0; target < originalShirt.geometry.morphAttributes.position.length; target++) {
        const raw = new Vector3().fromBufferAttribute(originalShirt.geometry.morphAttributes.position[target], best);
        const compressed = new Vector3().fromBufferAttribute(compressedShirt.geometry.morphAttributes.position[target], i).applyMatrix3(linear);
        assert.ok(raw.distanceTo(compressed) < 0.0004, `sample ${i}, target ${target} retains its morph delta`);
      }
    }
    // Either encoded asset must remain compatible with an uncompressed local counterpart.
    bindGarment(await load(packedShirt), rigFromSkinnedMesh(await load(baseAvatar)));
    bindGarment(await load(baseShirt), rigFromSkinnedMesh(await load(packedAvatar)));
    const sourceRig = rigFromSkinnedMesh(originalBody), packedRig = rigFromSkinnedMesh(compressedBody);
    bindGarment(originalShirt, sourceRig); bindGarment(compressedShirt, packedRig);
    const sourceRest = captureBindPose(sourceRig.bones), packedRest = captureBindPose(packedRig.bones);
    const sidecarText = await readFile(sidecarPath, "utf8"), sidecar = parseSidecar(JSON.parse(sidecarText));
    const sourceDrive = createCorrectiveDriver(originalShirt, sourceRig.bones, sourceRest, sidecar);
    const packedDrive = createCorrectiveDriver(compressedShirt, packedRig.bones, packedRest, sidecar);
    for (const [label, pose] of [["both-90", findPose("both-90")], ["walk", tryOnPose("walk")]]) {
      applyPose(sourceRig.bones, sourceRest, pose); applyPose(packedRig.bones, packedRest, pose);
      const original = sourceDrive(true), compressed = packedDrive(true);
      assert.deepEqual(Object.keys(compressed), Object.keys(original));
      for (const name of Object.keys(original)) assert.ok(Math.abs(original[name] - compressed[name]) < 1e-6, `${label} ${name}`);
    }
    assert.equal(await readFile(sidecarPath, "utf8"), sidecarText, "compression does not modify sidecars");
    console.log("Compressed v5.2 preserves morphs, joints, skin weights, binding and corrective weights");
  } finally { await rm(cache, { recursive: true, force: true }); }
}
