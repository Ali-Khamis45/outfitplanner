import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import type { NextApiRequest, NextApiResponse } from "next";
import { compressGlb } from "../asset-compression/compress.mjs";

type Asset = "body" | "shirt" | "pants" | "shirtSidecar" | "pantsSidecar";
type Entries = Record<Asset, string | null>;
const assets: Asset[] = ["body", "shirt", "pants", "shirtSidecar", "pantsSidecar"];
const loopback = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function localRequest(req: NextApiRequest): boolean {
  if (!loopback.has(req.socket.remoteAddress ?? "")) return false;
  // Next adds these headers itself; reject forwarded chains or hosts that differ
  // from the actual socket and Host rather than trusting proxy-supplied values.
  if (req.headers.forwarded || req.headers["x-real-ip"]) return false;
  if (req.headers["x-forwarded-for"] && req.headers["x-forwarded-for"] !== req.socket.remoteAddress) return false;
  if (req.headers["x-forwarded-host"] && req.headers["x-forwarded-host"] !== req.headers.host) return false;
  try {
    const host = new URL(`http://${req.headers.host}`).hostname;
    if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) return false;
    if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return false;
    return true;
  } catch { return false; }
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
// The manifest stays server-side; clients receive only fixed resource URLs.
function manifestEntries(value: unknown): Entries | null {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.primary)) return null;
  const fit = value.primary;
  if (!isRecord(fit.top) || !isRecord(fit.bottom)) return null;
  const values = [fit.body, fit.top.glb, fit.bottom.glb, fit.top.sidecar, fit.bottom.sidecar];
  if (!values.every(item => typeof item === "string" && item.length > 0)) return null;
  const [body, shirt, pants, shirtSidecar, pantsSidecar] = values as string[];
  return { body, shirt, pants, shirtSidecar, pantsSidecar };
}

async function listedFile(outputsRoot: string, entry: string, type: Asset): Promise<string> {
  const root = await realpath(outputsRoot);
  if (!entry.startsWith("outputs/") || entry.includes("\\") || entry.split("/").some(part => part === "." || part === ".." || !part)) throw new Error("Invalid asset path");
  const resolved = await realpath(/*turbopackIgnore: true*/ path.resolve(outputsRoot, "..", entry));
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) throw new Error("Asset outside outputs");
  if (!resolved.toLowerCase().endsWith(type.endsWith("Sidecar") ? ".json" : ".glb")) throw new Error("Invalid asset type");
  return resolved;
}

export function createPersonalFitHandler(outputsRoot = path.resolve(process.cwd(), "../../outputs"), environment = process.env.NODE_ENV) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (environment !== "development" || !localRequest(req) || (req.method !== "GET" && req.method !== "HEAD")) return res.status(404).end();
    try {
      const personalRoot = path.join(outputsRoot, "garments", "personal");
      const entries = manifestEntries(JSON.parse(await readFile(path.join(personalRoot, "manifest.json"), "utf8")));
      if (!entries) return res.status(404).end();
      const requested = req.query.asset;
      if (requested === undefined) {
        // Ensure the three core files actually exist before advertising a fit.
        await Promise.all(assets.map(name => listedFile(outputsRoot, entries[name]!, name)));
        const urls = Object.fromEntries(assets.map(name => [name, entries[name] ? `/api/personal-fit?asset=${name}` : null]));
        return res.status(200).json(urls);
      }
      if (typeof requested !== "string" || !assets.includes(requested as Asset)) return res.status(404).end();
      const asset = requested as Asset, entry = entries[asset];
      if (!entry) return res.status(404).end();
      const file = await listedFile(outputsRoot, entry, asset);
      res.setHeader("Content-Type", asset.endsWith("Sidecar") ? "application/json" : "model/gltf-binary");
      if (req.method === "HEAD") return res.status(200).end();
      const bytes = await readFile(file);
      if (asset.endsWith("Sidecar")) return res.status(200).send(bytes);
      // Personal GLBs are compressed per request in memory, never written to a cache.
      const compressed = Buffer.from(await compressGlb(bytes));
      const accepts = req.headers["accept-encoding"] ?? "";
      const gzip = accepts.split(",").map(value => value.trim()).find(value => /^gzip(?:\s*;|$)/i.test(value));
      const quality = gzip?.match(/;\s*q=([\d.]+)/i);
      res.setHeader("Vary", "Accept-Encoding");
      if (gzip && (!quality || Number(quality[1]) > 0)) {
        res.setHeader("Content-Encoding", "gzip");
        return res.status(200).send(gzipSync(compressed));
      }
      return res.status(200).send(compressed);
    } catch { return res.status(404).end(); }
  };
}
