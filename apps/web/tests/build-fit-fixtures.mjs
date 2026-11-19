// Only writes generated neutral fixtures in the git-ignored scratch workspace.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fixtureEase } from "./fixture-ease.mjs";
const require = createRequire(new URL("../asset-compression/compress.mjs", import.meta.url));
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { MeshoptDecoder, MeshoptEncoder } = require("meshoptimizer");
const workspace = path.resolve(process.cwd(), "../..");
const root = process.env.FIT_FIXTURE_ROOT ? path.resolve(process.env.FIT_FIXTURE_ROOT) : path.join(workspace, ".codex-garment-check", "sprint3-fixtures"), output = path.join(root, "outputs", "garments", "sizes");
await mkdir(output, { recursive: true });
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
for (const [garment, source] of [["tshirt-v5.3", "garments/experiments/tshirt-v5.3-mhr-neutral.glb"], ["pants-v3", "garments/pants-basic-v3-mhr-neutral.glb"], ["tshirt-v5.2", "garments/experiments/tshirt-v5.2-mhr-neutral.glb"], ["pants-v2", "garments/pants-basic-v2-mhr-neutral.glb"]]) {
  const file = path.join(workspace, "outputs", source);
  const document = await io.readBinary(new Uint8Array(await readFile(file)));
  const buffer = document.getRoot().listBuffers()[0];
  const sidecar = await readFile(file.replace(/\.glb$/, ".correctives.json"));
  for (const size of ["S", "M", "L", "XL"]) {
    for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
      const positions = primitive.getAttribute("POSITION").getArray();
      const values = Float32Array.from({ length: positions.length / 3 }, (_, i) => fixtureEase(garment, size, positions[i * 3 + 1]));
      const previous = primitive.getAttribute("_EASE_MM");
      primitive.setAttribute("_EASE_MM", document.createAccessor().setType("SCALAR").setArray(values).setBuffer(buffer));
      if (previous) previous.dispose();
    }
    const glb = await io.writeBinary(document);
    const stem = `${garment}-${size}-neutral`;
    await writeFile(path.join(output, `${stem}.glb`), glb);
    await writeFile(path.join(output, `${stem}.correctives.json`), sidecar);
    const shirt = garment.startsWith("tshirt"), index = ["S", "M", "L", "XL"].indexOf(size);
    const status = index === 0 ? "tight" : index === 3 ? "loose" : "good";
    await writeFile(path.join(output, `${stem}.fit.json`), JSON.stringify({ version: 1, garment, size, body: "neutral", regions: { ...(shirt ? { chest: { ease_mm: [62, 100, 160, 220][index], status }, shoulders: { ease_mm: 18, status: "good" } } : {}), waist: { ease_mm: shirt ? [70, 100, 150, 220][index] : [-10, 20, 40, 60][index], status }, hips: { ease_mm: [40, 90, 120, shirt ? 220 : 170][index], status }, length: { delta_mm: -15, status: "good" } }, recommended: size === "M" }));
  }
}
console.log(`Generated neutral fixtures in ${root}`);
