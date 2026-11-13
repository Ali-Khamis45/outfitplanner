import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { Matrix4 } from "three";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { meshopt } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

// Include the transform settings in the key so updates cannot reuse older encodings.
const FORMAT = "meshopt-v2-high";
const inFlight = new Map();

export async function compressGlb(input) {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
  const document = await io.readBinary(new Uint8Array(input));
  const nodes = document.getRoot().listNodes().filter(node => node.getMesh() && node.getSkin()?.getInverseBindMatrices());
  const originals = nodes.map(node => node.getSkin().getInverseBindMatrices().getElement(0, []));
  // The demo assets have no textures; omit their unused UVs but retain region,
  // skin, and morph attributes. Textured files keep their UV coordinates.
  if (document.getRoot().listTextures().length === 0) {
    for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
      for (const semantic of primitive.listSemantics()) if (semantic.startsWith("TEXCOORD_")) primitive.setAttribute(semantic, null);
    }
  }
  await document.transform(meshopt({ encoder: MeshoptEncoder, level: "high", quantizePosition: 14, quantizeNormal: 8, quantizeWeight: 12 }));
  nodes.forEach((node, index) => {
    const updated = node.getSkin().getInverseBindMatrices().getElement(0, []);
    const compensation = new Matrix4().fromArray(originals[index]).invert().multiply(new Matrix4().fromArray(updated));
    node.setExtras({ ...node.getExtras(), vwMeshoptBindCompensation: compensation.toArray() });
  });
  return io.writeBinary(document);
}

export async function compressedAsset(source, cacheDir = path.resolve(process.cwd(), ".asset-cache"), gzip = false) {
  const bytes = await readFile(source);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const destination = path.join(cacheDir, `${FORMAT}-${hash}.glb${gzip ? ".gz" : ""}`);
  try { return await readFile(destination); } catch (error) { if (error.code !== "ENOENT") throw error; }
  let task = inFlight.get(destination);
  if (!task) {
    task = (async () => {
      const glb = await compressGlb(bytes);
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
