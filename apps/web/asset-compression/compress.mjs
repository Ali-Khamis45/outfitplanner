import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Matrix4 } from "three";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { meshopt } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

// Include the transform settings in the key so updates cannot reuse older encodings.
const FORMAT = "meshopt-v3-uv-high";
const inFlight = new Map();

export async function compressGlb(input) {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
  const document = await io.readBinary(new Uint8Array(input));
  const nodes = document.getRoot().listNodes().filter(node => node.getMesh() && node.getSkin()?.getInverseBindMatrices());
  const originals = nodes.map(node => node.getSkin().getInverseBindMatrices().getElement(0, []));
  // Garments may receive an external albedo after loading, even when the GLB
  // itself has no embedded texture. Preserve their UVs through compression.
  await document.transform(meshopt({ encoder: MeshoptEncoder, level: "high", quantizePosition: 14, quantizeNormal: 8, quantizeWeight: 12 }));
  nodes.forEach((node, index) => {
    const updated = node.getSkin().getInverseBindMatrices().getElement(0, []);
    const compensation = new Matrix4().fromArray(originals[index]).invert().multiply(new Matrix4().fromArray(updated));
    node.setExtras({ ...node.getExtras(), vwMeshoptBindCompensation: compensation.toArray() });
  });
  return io.writeBinary(document);
}

export async function compressedAsset(source, cacheDir = path.resolve(process.cwd(), ".asset-cache"), gzip = false) {
  const info = await stat(source);
  const hash = createHash("sha256").update(`${path.resolve(source instanceof URL ? fileURLToPath(source) : source)}:${info.size}:${info.mtimeMs}`).digest("hex");
  const destination = path.join(cacheDir, `${FORMAT}-${hash}.glb${gzip ? ".gz" : ""}`);
  try { return await readFile(destination); } catch (error) { if (error.code !== "ENOENT") throw error; }
  let task = inFlight.get(destination);
  if (!task) {
    task = (async () => {
      const glb = gzip ? await compressedAsset(source, cacheDir, false) : await compressGlb(await readFile(source));
      const result = gzip ? gzipSync(glb, { level: 9 }) : glb;
      await mkdir(cacheDir, { recursive: true });
      const temporary = path.join(cacheDir, `${FORMAT}-${hash}-${randomUUID()}.tmp`);
      try { await writeFile(temporary, result); await rename(temporary, destination); }
      finally { await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
      return result;
    })();
    inFlight.set(destination, task);
    task.finally(() => inFlight.delete(destination)).catch(() => {});
  }
  return task;
}
