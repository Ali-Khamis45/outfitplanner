// Only writes generated neutral fixtures in the git-ignored scratch workspace.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(new URL("../asset-compression/compress.mjs", import.meta.url));
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { MeshoptDecoder, MeshoptEncoder } = require("meshoptimizer");
const workspace = path.resolve(process.cwd(), "../..");
const root = process.env.FIT_FIXTURE_ROOT ? path.resolve(process.env.FIT_FIXTURE_ROOT) : path.join(workspace, ".codex-garment-check", "sprint3-fixtures"), output = path.join(root, "outputs", "garments", "sizes");
await mkdir(output, { recursive: true });
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
for (const [garment, source] of [["tshirt-v5.2", "garments/experiments/tshirt-v5.2-mhr-neutral.glb"], ["pants-v2", "garments/pants-basic-v2-mhr-neutral.glb"]]) {
  const file = path.join(workspace, "outputs", source);
  const document = await io.readBinary(new Uint8Array(await readFile(file)));
  const buffer = document.getRoot().listBuffers()[0];
  for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
    const count = primitive.getAttribute("POSITION").getCount();
    primitive.setAttribute("_EASE_MM", document.createAccessor().setType("SCALAR").setArray(Float32Array.from({ length: count }, (_, i) => (i % 61) - 20)).setBuffer(buffer));
  }
  const glb = await io.writeBinary(document);
  const sidecar = await readFile(file.replace(/\.glb$/, ".correctives.json"));
  for (const size of ["S", "M", "L", "XL"]) {
    const stem = `${garment}-${size}-neutral`;
    await writeFile(path.join(output, `${stem}.glb`), glb);
    await writeFile(path.join(output, `${stem}.correctives.json`), sidecar);
    const shirt = garment.startsWith("tshirt"), small = size === "S";
    await writeFile(path.join(output, `${stem}.fit.json`), JSON.stringify({ version: 1, garment, size, body: "neutral", regions: { ...(shirt ? { chest: { ease_mm: small ? 62 : 100, status: small ? "tight" : "good" }, shoulders: { ease_mm: 18, status: "good" } } : {}), waist: { ease_mm: shirt ? 80 : small ? -10 : 20, status: !shirt && small ? "tight" : "good" }, hips: { ease_mm: 90, status: "good" }, length: { delta_mm: -15, status: "good" } }, recommended: size === "M" }));
  }
}
console.log(`Generated neutral fixtures in ${root}`);
