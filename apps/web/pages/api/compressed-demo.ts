import { createHash } from "node:crypto";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import { compressedAsset } from "../../asset-compression/compress.mjs";

const files: Record<string, string> = {
  avatar: "avatars/mhr-neutral.glb", v1: "garments/tshirt-mhr-neutral.glb", v2: "garments/tshirt-v2-mhr-neutral.glb", "v2-lod": "garments/tshirt-v2-lod-mhr-neutral.glb",
  v3: "garments/experiments/tshirt-v3-close1-mhr-neutral.glb", v4: "garments/experiments/tshirt-v4-mhr-neutral.glb", v5: "garments/experiments/tshirt-v5-mhr-neutral.glb",
  "v5.1": "garments/experiments/tshirt-v5.1-mhr-neutral.glb", "v5.2": "garments/experiments/tshirt-v5.2-mhr-neutral.glb", "v5.3": "garments/experiments/tshirt-v5.3-mhr-neutral.glb",
  pants: "garments/pants-basic-v1-mhr-neutral.glb", "pants-v2": "garments/pants-basic-v2-mhr-neutral.glb", "pants-v3": "garments/pants-basic-v3-mhr-neutral.glb", "pants-v3.1": "garments/pants-basic-v3.1-mhr-neutral.glb",
};
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const key = req.query.asset;
  if (req.method !== "GET" || typeof key !== "string" || !Object.hasOwn(files, key)) { res.status(404).end(); return; }
  try {
    const entry = (req.headers["accept-encoding"] ?? "").split(",").map(x => x.trim()).find(x => /^gzip(?:\s*;|$)/i.test(x));
    const quality = entry?.match(/;\s*q=([\d.]+)/i);
    const gzip = !!entry && (!quality || Number(quality[1]) > 0);
    const bytes = Buffer.from(await compressedAsset(path.resolve(process.cwd(), "../../outputs", files[key]), undefined, gzip));
    const etag = `"${createHash("sha256").update(bytes).digest("hex")}"`;
    res.setHeader("ETag", etag); res.setHeader("Vary", "Accept-Encoding"); res.setHeader("Cache-Control", "private, no-cache, no-transform"); res.setHeader("X-Content-Type-Options", "nosniff");
    if ((req.headers["if-none-match"] ?? "").split(",").some(tag => tag.trim() === etag || tag.trim() === "*")) { res.status(304).end(); return; }
    res.setHeader("Content-Type", "model/gltf-binary"); res.setHeader("Content-Length", String(bytes.length));
    if (gzip) res.setHeader("Content-Encoding", "gzip");
    res.status(200).end(bytes);
  } catch { res.status(404).end(); }
}
