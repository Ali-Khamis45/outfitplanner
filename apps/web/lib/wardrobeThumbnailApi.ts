import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import { localRequest } from "./personalFit.ts";

const assets: Record<string, string> = { "tshirt-v5.3": "garments/experiments/tshirt-v5.3-mhr-neutral.glb", "pants-v3": "garments/pants-basic-v3-mhr-neutral.glb", "tshirt-v5.2": "garments/experiments/tshirt-v5.2-mhr-neutral.glb", "pants-v2": "garments/pants-basic-v2-mhr-neutral.glb", "pants-basic-v2": "garments/pants-basic-v2-mhr-neutral.glb" };
export function createThumbnailHandler(outputs = path.resolve(process.cwd(), "../../outputs"), environment = process.env.NODE_ENV) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    res.setHeader("Cache-Control", "no-store, private"); res.setHeader("X-Content-Type-Options", "nosniff");
    if (environment !== "development" || !localRequest(req)) return res.status(404).end();
    const { template, color } = req.query;
    if (typeof template !== "string" || !Object.hasOwn(assets, template) || typeof color !== "string" || !/^[0-9a-fA-F]{6}$/.test(color)) return res.status(404).end();
    if (req.method !== "GET" && req.method !== "POST") return res.status(404).end();
    try {
      const outputRoot = await realpath(/*turbopackIgnore: true*/ outputs);
      const assetPath = await realpath(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ outputRoot, assets[template]));
      if (!assetPath.startsWith(`${outputRoot}${path.sep}`)) return res.status(404).end();
      const asset = await stat(assetPath);
      const key = createHash("sha256").update(`v2-editorial:${assetPath}:${asset.size}:${asset.mtimeMs}:${color.toLowerCase()}`).digest("hex");
      const wardrobeDir = path.join(outputRoot, "wardrobe");
      if (req.method === "POST") await mkdir(wardrobeDir, { recursive: true });
      const wardrobeRoot = await realpath(wardrobeDir);
      if (path.dirname(wardrobeRoot) !== outputRoot) return res.status(404).end();
      const cacheDir = path.join(wardrobeRoot, "thumbnails");
      if (req.method === "POST") await mkdir(cacheDir, { recursive: true });
      const cacheRoot = await realpath(cacheDir);
      if (path.dirname(cacheRoot) !== wardrobeRoot) return res.status(404).end();
      const file = path.join(cacheRoot, `${key}.png`);
      if (req.method === "GET") {
        const resolved = await realpath(file); if (path.dirname(resolved) !== cacheRoot) return res.status(404).end();
        res.setHeader("Content-Type", "image/png"); return res.status(200).send(await readFile(resolved));
      }
      if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? "")) return res.status(404).end();
      const data = req.body?.data;
      if (typeof data !== "string" || data.length > 1_000_000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(data)) return res.status(400).end();
      const bytes = Buffer.from(data.slice("data:image/png;base64,".length), "base64");
      if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return res.status(400).end();
      // Write a unique file first; a rename gives readers a complete image.
      const temp = path.join(cacheRoot, `.${randomUUID()}.tmp`);
      await writeFile(temp, bytes, { flag: "wx" });
      const { rename } = await import("node:fs/promises"); await rename(temp, file);
      return res.status(201).end();
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("Thumbnail cache error:", error); return res.status(404).end(); }
  };
}
