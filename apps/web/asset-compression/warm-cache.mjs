import { access } from "node:fs/promises";
import path from "node:path";
import { compressedAsset } from "./compress.mjs";

for (const relative of ["avatars/mhr-neutral.glb", "garments/experiments/tshirt-v5.2-mhr-neutral.glb", "garments/pants-basic-v2-mhr-neutral.glb"]) {
  const source = path.resolve(process.cwd(), "../../outputs", relative);
  try { await access(source); }
  catch (error) { if (error.code === "ENOENT") { console.log(`Compression cache skipped: ${relative} is unavailable`); continue; } throw error; }
  const data = await compressedAsset(source, undefined, true);
  console.log(`Compression cache ready: ${relative} (${data.byteLength} bytes gzip)`);
}
