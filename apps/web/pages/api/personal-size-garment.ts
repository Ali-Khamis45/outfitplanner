import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import { compressGlb } from "../../asset-compression/compress.mjs";
import { localRequest } from "../../lib/personalFit.ts";
import { parseFitMap, SIZES, type Size, type Slot } from "../../lib/garment/fitMap.ts";
import { GENERATIONS, generationQuery, parseGeneration } from "../../lib/garment/generation.ts";
import { withheldSizes } from "../../lib/garment/withheldSizes.ts";

// Neutral sizes are public demo assets. Personal sizes retain the local-only,
// development-only boundary used for the personal-fit endpoint.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") return res.status(404).end();
  const { body, slot, size, asset } = req.query;
  const generation = parseGeneration(req.query.gen, req.query.pants), { top, bottom, topSizesDir, bottomSizesDir } = GENERATIONS[generation], sizesDir = slot === "top" ? topSizesDir : bottomSizesDir;
  if (typeof body !== "string" || !/^[a-zA-Z0-9_-]+$/.test(body) || (slot !== "top" && slot !== "bottom")) return res.status(404).end();
  if (body !== "neutral" && (process.env.NODE_ENV !== "development" || !localRequest(req))) return res.status(404).end();
  try {
    const directory = path.resolve(/*turbopackIgnore: true*/ process.cwd(), `../../outputs/garments/${sizesDir}`), root = await realpath(/*turbopackIgnore: true*/ directory);
    const files = await readdir(root);
    const suffix = `-${body}.fit.json`;
    const options = [];
    for (const name of files.sort()) {
      if (!name.endsWith(suffix)) continue;
      const stem = name.slice(0, -suffix.length), match = stem.match(/^(.*)-(S|M|L|XL)$/);
      if (!match || match[1] !== (slot === "top" ? top : bottom)) continue;
      const fileBase = `${stem}-${body}`;
      if (!files.includes(`${fileBase}.glb`) || !files.includes(`${fileBase}.correctives.json`)) continue;
      const fitFile = await realpath(path.join(root, name));
      if (path.dirname(fitFile) !== root) continue;
      let fit;
      try { fit = parseFitMap(JSON.parse(await readFile(fitFile, "utf8"))); } catch { continue; }
      if (fit.body !== body || fit.size !== match[2] || fit.garment !== match[1]) continue;
      const safe = new URLSearchParams({ slot: slot as Slot, body, size: fit.size });
      for (const [key, value] of Object.entries(generationQuery(generation))) safe.set(key, value);
      options.push({ size: fit.size, fit, glb: `/api/size-garment?${safe}&asset=glb`, sidecar: `/api/size-garment?${safe}&asset=sidecar`, fileBase });
    }
    options.sort((a, b) => SIZES.indexOf(a.size) - SIZES.indexOf(b.size));
    if (size === undefined && asset === undefined) return res.status(200).json([...options.map(option => ({ size: option.size, fit: option.fit, glb: option.glb, sidecar: option.sidecar })), ...await withheldSizes(root, slot === "top" ? top : bottom, body, files)]);
    if (typeof size !== "string" || !SIZES.includes(size as Size) || (asset !== "glb" && asset !== "sidecar")) return res.status(404).end();
    const option = options.find(item => item.size === size);
    if (!option) return res.status(404).end();
    // Runtime outputs are deliberately excluded from deployment tracing.
    const filename = await realpath(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ root, `${option.fileBase}.${asset === "glb" ? "glb" : "correctives.json"}`));
    if (path.dirname(filename) !== root) return res.status(404).end();
    const bytes = await readFile(filename);
    if (asset === "sidecar") { res.setHeader("Content-Type", "application/json"); return res.status(200).send(bytes); }
    res.setHeader("Content-Type", "model/gltf-binary");
    return res.status(200).send(Buffer.from(await compressGlb(bytes)));
  } catch { return res.status(404).end(); }
}
