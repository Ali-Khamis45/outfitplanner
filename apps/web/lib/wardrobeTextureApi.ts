import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import { canCreatePhotoTexture } from "./garment/photoTexture.ts";
import { localOutputs } from "./localOutputs.ts";
import { localRequest } from "./personalFit.ts";
import { loadWardrobe, serializeWardrobeWrite, writeWardrobe } from "./wardrobe/storage.ts";

/** Runs the producer with these arguments and resolves with its standard output (the texture metadata as JSON). */
export type ProducerRun = (args: string[]) => Promise<string>;

/** services/texture/produce.py in the repository's Python environment (external/mhr-venv). */
export function producerRun(repository: string): ProducerRun {
  const python = path.join(repository, "external", "mhr-venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  const script = path.join(repository, "services", "texture", "produce.py");
  return args => new Promise((resolve, reject) => execFile(python, [script, ...args], { timeout: 300_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
    (error, stdout, stderr) => error ? reject(new Error(stderr.trim().split("\n").slice(-3).join(" ") || error.message)) : resolve(stdout)));
}

const runningKey = Symbol.for("virtual-wardrobe.texture-producer-running");
type RunningGlobal = typeof globalThis & { [runningKey]?: boolean };

/**
 * Sprint 4A, development and localhost only: POST {item} turns the item's saved front (and back) photo captures into its
 * texture with the photo-to-texture producer, then sets the item's texture in the wardrobe through the same serialized
 * writer as every other wardrobe change. One producer run at a time.
 */
export function createWardrobeTextureHandler(outputs = localOutputs(), environment = process.env.NODE_ENV, run: ProducerRun = producerRun(path.resolve(outputs, ".."))) {
  return async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (environment !== "development" || !localRequest(req) || req.method !== "POST" || !/^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? "")) return res.status(404).end();
    const item = (req.body as { item?: unknown } | undefined)?.item;
    if (typeof item !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(item)) return res.status(400).json({ error: "Invalid item." });
    const entry = (await loadWardrobe(outputs)).items.find(candidate => candidate.id === item);
    if (!entry) return res.status(404).json({ error: "Item not found in your wardrobe." });
    if (!canCreatePhotoTexture(entry.template)) return res.status(400).json({ error: "Photo textures are available for the T-shirt (tshirt-v5.3) and pants (pants-v3) templates." });
    try { await access(path.join(outputs, "wardrobe", "photos", `${item}-front.jpg`)); } catch { return res.status(400).json({ error: "Save a front photo capture for this piece first." }); }
    const shared = globalThis as RunningGlobal;
    if (shared[runningKey]) return res.status(409).json({ error: "A texture is being created. Try again when it has finished." });
    shared[runningKey] = true;
    try {
      const metadata = JSON.parse(await run([item, "--template", entry.template as string, "--wardrobe", path.join(outputs, "wardrobe")])) as { coverage: number; views: string[]; fallback_hex: string };
      const texture = `outputs/wardrobe/textures/${item}.png`;
      await serializeWardrobeWrite(async () => {
        const current = await loadWardrobe(outputs);
        await writeWardrobe(outputs, { ...current, items: current.items.map(candidate => candidate.id === item ? { ...candidate, texture } : candidate) });
      });
      return res.status(200).json({ texture, coverage: metadata.coverage, views: metadata.views, fallback_hex: metadata.fallback_hex });
    } catch (error) {
      return res.status(500).json({ error: `The texture could not be created: ${error instanceof Error ? error.message : "unknown error"}` });
    } finally { shared[runningKey] = false; }
  };
}
