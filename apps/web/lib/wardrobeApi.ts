import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import { localRequest } from "./personalFit.ts";
import { parseWardrobe } from "./wardrobe/schema.ts";
import { loadWardrobe, serializeWardrobeWrite, wardrobeVersion, writeWardrobe } from "./wardrobe/storage.ts";

export function createWardrobeHandler(outputs = path.resolve(process.cwd(), "../../outputs"), environment = process.env.NODE_ENV) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    res.setHeader("Cache-Control", "no-store, private"); res.setHeader("X-Content-Type-Options", "nosniff");
    if (environment !== "development" || !localRequest(req)) return res.status(404).end();
    const root = path.join(outputs, "wardrobe"), photos = path.join(root, "photos");
    try {
      const checkedRoot = async () => { const outputRoot = await realpath(/*turbopackIgnore: true*/ outputs), actual = await realpath(root); if (path.dirname(actual) !== outputRoot) throw new Error("Wardrobe directory is outside outputs."); return actual; };
      const checkedPhotos = async () => { const actualRoot = await checkedRoot(), actual = await realpath(photos); if (path.dirname(actual) !== actualRoot) throw new Error("Photo directory is outside wardrobe."); return actual; };
      if (req.method === "GET" && typeof req.query.texture === "string") {
        const name = req.query.texture;
        if (!/^[a-zA-Z0-9_-]{1,80}\.png$/.test(name)) return res.status(404).end();
        const actualRoot = await checkedRoot(), directory = await realpath(path.join(actualRoot, req.query.fixture === "1" ? "test-textures" : "textures"));
        if (path.dirname(directory) !== actualRoot) return res.status(404).end();
        const image = await realpath(path.join(directory, name)), metadata = await realpath(path.join(directory, name.replace(/\.png$/, ".texture.json")));
        if (path.dirname(image) !== directory || path.dirname(metadata) !== directory) return res.status(404).end();
        const info = JSON.parse(await readFile(metadata, "utf8"));
        if (info.version !== 1 || info.item !== name.slice(0, -4) || !/^#[0-9a-fA-F]{6}$/.test(info.fallback_hex)) return res.status(404).end();
        if (req.query.metadata === "1") return res.status(200).json(info);
        res.setHeader("Content-Type", "image/png"); return res.status(200).send(await readFile(image));
      }
      if (req.method === "GET" && typeof req.query.photo === "string") {
        const name = req.query.photo;
        if (!/^[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(name)) return res.status(404).end();
        const realRoot = await checkedPhotos(), resolved = await realpath(path.join(realRoot, name));
        if (path.dirname(resolved) !== realRoot) return res.status(404).end();
        const extension = path.extname(name);
        res.setHeader("Content-Type", extension === ".jpg" ? "image/jpeg" : extension === ".png" ? "image/png" : "image/webp");
        return res.status(200).send(await readFile(resolved));
      }
      if (req.method === "GET") {
        const wardrobe = await loadWardrobe(outputs);
        res.setHeader("X-Wardrobe-Version", wardrobeVersion(wardrobe));
        return res.status(200).json(wardrobe);
      }
      if ((req.method !== "PUT" && req.method !== "POST") || !/^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? "")) return res.status(404).end();
      if (req.method === "POST") {
        const body: unknown = req.body;
        if (body && typeof body === "object" && "view" in body && "item" in body && "alignment" in body && "data" in body) {
          const { item, view, alignment, data } = body;
          if (typeof item !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(item) || (view !== "front" && view !== "back") || !Array.isArray(alignment) || alignment.length !== 6 || !alignment.every(v => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 100000) || typeof data !== "string" || data.length > 13333360 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(data)) return res.status(400).json({ error: "Invalid capture." });
          const bytes = Buffer.from(data.split(",")[1], "base64");
          if (bytes.length > 10000000 || !bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return res.status(400).json({ error: "Invalid JPEG." });
          await mkdir(photos, { recursive: true }); const directory = await checkedPhotos();
          const photoTemp = path.join(directory, `.${randomUUID()}.tmp`), alignmentTemp = path.join(directory, `.${randomUUID()}.tmp`);
          await writeFile(photoTemp, bytes, { flag: "wx" });
          await writeFile(alignmentTemp, JSON.stringify({ version: 1, item, view, matrix: alignment, convention: "guide-normalized-to-photo-normalized; x'=a*x+c*y+e, y'=b*x+d*y+f" }, null, 2) + "\n", { flag: "wx" });
          await rename(photoTemp, path.join(directory, `${item}-${view}.jpg`));
          await rename(alignmentTemp, path.join(directory, `${item}-${view}.align.json`));
          return res.status(201).json({ ok: true });
        }
        if (!body || typeof body !== "object" || !("data" in body) || typeof body.data !== "string" || body.data.length > 13_333_360) return res.status(400).json({ error: "Choose a JPEG, PNG or WebP photo of 10 MB or less." });
        const match = body.data.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
        if (!match) return res.status(400).json({ error: "Choose a JPEG, PNG or WebP photo of 10 MB or less." });
        const bytes = Buffer.from(match[2], "base64"), kind = match[1];
        const valid = kind === "jpeg" ? bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) : kind === "png" ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
        if (!valid || bytes.length > 10_000_000) return res.status(400).json({ error: "Invalid photo or photo larger than 10 MB." });
        await mkdir(photos, { recursive: true });
        const realPhotos = await checkedPhotos();
        const name = `${randomUUID()}.${kind === "jpeg" ? "jpg" : kind}`;
        await writeFile(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ realPhotos, name), bytes, { flag: "wx" });
        return res.status(201).json({ photo: `outputs/wardrobe/photos/${name}` });
      }
      let wardrobe;
      try { wardrobe = parseWardrobe(req.body); } catch { return res.status(400).json({ error: "The wardrobe contains invalid fields. Check values and try again." }); }
      const saved = await serializeWardrobeWrite(async () => {
        const current = await loadWardrobe(outputs);
        if (req.headers["if-match"] && req.headers["if-match"] !== wardrobeVersion(current)) return false;
        await writeWardrobe(outputs, wardrobe);
        return true;
      });
      if (!saved) return res.status(409).json({ error: "Wardrobe changed since it was loaded. Reload before saving your changes." });
      res.setHeader("X-Wardrobe-Version", wardrobeVersion(wardrobe));
      return res.status(200).json(wardrobe);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && req.method === "GET" && (req.query.texture || req.query.photo)) return res.status(404).end();
      console.error("Local wardrobe request failed:", error);
      return res.status(500).json({ error: "Could not access the local wardrobe." });
    }
  };
}
