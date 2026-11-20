import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Matrix4 } from "three";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { meshopt } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

// Include the transform settings in the key so updates cannot reuse older encodings.
const FORMAT = "meshopt-v4-uv-high";
const LEGACY_FILE = /^meshopt-(?:v1-medium|v2-high|v3-uv-high)-[a-f0-9]{64}(?:\.glb(?:\.gz)?|-[a-f0-9-]{36}\.tmp)$/;
const inFlight = new Map();
const migrations = new Map();
const personal = new Map();

// The former cache mixed anonymous demo meshes and personal meshes under
// irreversible hashes. We cannot identify orphaned personal entries, so
// remove the old format once and rebuild demo entries under a new format.
export async function prepareAssetCache(cacheDir = path.resolve(process.cwd(), ".asset-cache")) {
  const directory = path.resolve(/*turbopackIgnore: true*/ cacheDir);
  let task = migrations.get(directory);
  if (!task) {
    task = (async () => {
      let entries;
      try { entries = await readdir(/*turbopackIgnore: true*/ directory, { withFileTypes: true }); }
      catch (error) { if (error.code === "ENOENT") return; throw error; }
      await Promise.all(entries.filter(entry => entry.isFile() && LEGACY_FILE.test(entry.name)).map(async entry => {
        try { await unlink(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ directory, entry.name)); }
        catch (error) { if (error.code !== "ENOENT") throw error; }
      }));
    })();
    migrations.set(directory, task);
    task.catch(() => migrations.delete(directory));
  }
  await task;
}

export function clearPersonalAssetMemory() { personal.clear(); }

// Personal meshes are never written to disk. Cache only the current source
// signature in memory, including gzip, and bound the number of retained files.
export async function compressedPersonalAsset(source, gzip = false) {
  const filename = path.resolve(source instanceof URL ? fileURLToPath(source) : source);
  let info;
  try { info = await stat(filename); }
  catch (error) { personal.delete(filename); throw error; }
  const signature = `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
  let entry = personal.get(filename);
  if (!entry || entry.signature !== signature) {
    entry = { signature, raw: readFile(/*turbopackIgnore: true*/ filename).then(compressGlb), gzip: null };
    personal.delete(filename);
    personal.set(filename, entry);
    if (personal.size > 8) personal.delete(personal.keys().next().value);
  }
  try {
    const raw = await entry.raw;
    if (!gzip) return raw;
    if (!entry.gzip) entry.gzip = gzipSync(raw, { level: 9 });
    return entry.gzip;
  } catch (error) {
    if (personal.get(filename) === entry) personal.delete(filename);
    throw error;
  }
}

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
  await prepareAssetCache(cacheDir);
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
