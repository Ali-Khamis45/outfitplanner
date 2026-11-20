import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { clearPersonalAssetMemory, compressedAsset, compressedPersonalAsset, prepareAssetCache } from "../../asset-compression/compress.mjs";
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
  const generation = parseGeneration(req.query.gen), { top, bottom, topSizesDir, bottomSizesDir } = GENERATIONS[generation], sizesDir = slot === "top" ? topSizesDir : bottomSizesDir;
  if (typeof body !== "string" || !/^[a-zA-Z0-9_-]+$/.test(body) || (slot !== "top" && slot !== "bottom")) return res.status(404).end();
  const fixtures = req.query.fixtures === "1";
  if (fixtures && (process.env.NODE_ENV !== "development" || body !== "neutral")) return res.status(404).end();
  if (body !== "neutral" && (process.env.NODE_ENV !== "development" || !localRequest(req))) return res.status(404).end();
  try {
    if (body !== "neutral") await prepareAssetCache();
    const directory = path.resolve(/*turbopackIgnore: true*/ process.cwd(), fixtures ? "../../.codex-garment-check/sprint3-fixtures/outputs/garments/sizes" : `../../outputs/garments/${sizesDir}`), root = await realpath(/*turbopackIgnore: true*/ directory);
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
      if (fixtures) safe.set("fixtures", "1");
      const info = await stat(path.join(root, `${fileBase}.glb`));
      const version = `${info.size}-${Math.trunc(info.mtimeMs)}`;
      options.push({ size: fit.size, fit, glb: `/api/personal-size-garment?${safe}&asset=glb&v=${version}`, sidecar: `/api/size-garment?${safe}&asset=sidecar`, fileBase });
    }
    options.sort((a, b) => SIZES.indexOf(a.size) - SIZES.indexOf(b.size));
    if (size === undefined && asset === undefined) return res.status(200).json([...options.map(option => ({ size: option.size, fit: option.fit, glb: option.glb, sidecar: option.sidecar })), ...await withheldSizes(root, slot === "top" ? top : bottom, body, files)]);
    if (typeof size !== "string" || !SIZES.includes(size as Size) || (asset !== "glb" && asset !== "sidecar")) return res.status(404).end();
    const option = options.find(item => item.size === size);
    if (!option) return res.status(404).end();
    // Runtime outputs are deliberately excluded from deployment tracing.
    const filename = await realpath(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ root, `${option.fileBase}.${asset === "glb" ? "glb" : "correctives.json"}`));
    if (path.dirname(filename) !== root) return res.status(404).end();
    if (asset === "sidecar") { res.setHeader("Content-Type", "application/json"); return res.status(200).send(await readFile(filename)); }
    const info = await stat(filename), version = `${info.size}-${Math.trunc(info.mtimeMs)}`;
    if (req.query.v !== undefined && req.query.v !== version) return res.status(404).end();
    const encoding = (req.headers["accept-encoding"] ?? "").split(",").map(x => x.trim()).find(x => /^gzip(?:\s*;|$)/i.test(x));
    const quality = encoding?.match(/;\s*q=([\d.]+)/i);
    const gzip = !!encoding && (!quality || Number(quality[1]) > 0);
    const bytes = Buffer.from(body === "neutral" ? await compressedAsset(filename, undefined, gzip) : await compressedPersonalAsset(filename, gzip));
    const etag = `"${createHash("sha256").update(bytes).digest("hex")}"`;
    res.setHeader("ETag", etag); res.setHeader("Vary", "Accept-Encoding");
    res.setHeader("Cache-Control", body === "neutral" && req.query.v === version ? "public, max-age=31536000, immutable, no-transform" : "private, no-store, no-transform");
    if ((req.headers["if-none-match"] ?? "").split(",").some(tag => tag.trim() === etag || tag.trim() === "*")) { res.status(304).end(); return; }
    res.setHeader("Content-Type", "model/gltf-binary");
    res.setHeader("Content-Length", String(bytes.length));
    if (gzip) res.setHeader("Content-Encoding", "gzip");
    res.status(200).end(bytes);
    return;
  } catch { if (body !== "neutral") clearPersonalAssetMemory(); return res.status(404).end(); }
}
