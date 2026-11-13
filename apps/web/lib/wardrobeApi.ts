import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import { localRequest } from "./personalFit.ts";
import { exampleWardrobe, parseWardrobe } from "./wardrobe/schema.ts";

export function createWardrobeHandler(outputs = path.resolve(process.cwd(), "../../outputs"), environment = process.env.NODE_ENV) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    res.setHeader("Cache-Control", "no-store, private"); res.setHeader("X-Content-Type-Options", "nosniff");
    if (environment !== "development" || !localRequest(req)) return res.status(404).end();
    const root = path.join(outputs, "wardrobe"), photos = path.join(root, "photos"), file = path.join(root, "wardrobe.json");
    try {
      const checkedRoot = async () => { const outputRoot = await realpath(/*turbopackIgnore: true*/ outputs), actual = await realpath(root); if (path.dirname(actual) !== outputRoot) throw new Error("Wardrobe directory is outside outputs."); return actual; };
      const checkedPhotos = async () => { const actualRoot = await checkedRoot(), actual = await realpath(photos); if (path.dirname(actual) !== actualRoot) throw new Error("Photo directory is outside wardrobe."); return actual; };
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
        try { const actualRoot = await checkedRoot(), actualFile = await realpath(file); if (path.dirname(actualFile) !== actualRoot) throw new Error("Wardrobe file is outside wardrobe."); return res.status(200).json(parseWardrobe(JSON.parse(await readFile(actualFile, "utf8")))); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return res.status(200).json(exampleWardrobe()); throw error; }
      }
      if ((req.method !== "PUT" && req.method !== "POST") || !/^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? "")) return res.status(404).end();
      if (req.method === "POST") {
        const body: unknown = req.body;
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
      await mkdir(root, { recursive: true });
      const actualRoot = await checkedRoot(), temporary = path.join(actualRoot, `.${randomUUID()}.tmp`);
      await writeFile(temporary, `${JSON.stringify(wardrobe, null, 2)}\n`, { flag: "wx" });
      await rename(temporary, path.join(actualRoot, "wardrobe.json"));
      return res.status(200).json(wardrobe);
    } catch (error) {
      console.error("Local wardrobe request failed:", error);
      return res.status(500).json({ error: "Could not access the local wardrobe." });
    }
  };
}
