import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { compressGlb } from "../../../asset-compression/compress.mjs";
import { parseFitMap, SIZES, type Size } from "../../../lib/garment/fitMap.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" };
const missing = () => new Response(null, { status: 404, headers });

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const body = params.get("body"), slot = params.get("slot"), size = params.get("size"), asset = params.get("asset");
  const fixtures = params.get("fixtures") === "1";
  if (!body || !/^[a-zA-Z0-9_-]+$/.test(body) || (slot !== "top" && slot !== "bottom")) return missing();
  if (fixtures && (process.env.NODE_ENV !== "development" || body !== "neutral")) return missing();
  if (body !== "neutral") {
    if (process.env.NODE_ENV !== "development") return missing();
    // The Pages handler has the socket address needed for its existing local-only check.
    return new Response(null, { status: 307, headers: { ...headers, Location: `/api/personal-size-garment?${params}` } });
  }
  try {
    const directory = path.resolve(/*turbopackIgnore: true*/ process.cwd(), fixtures ? "../../.codex-garment-check/sprint3-fixtures/outputs/garments/sizes" : "../../outputs/garments/sizes"), root = await realpath(/*turbopackIgnore: true*/ directory);
    const files = await readdir(root), suffix = `-${body}.fit.json`, options = [];
    for (const name of files.sort()) {
      if (!name.endsWith(suffix)) continue;
      const stem = name.slice(0, -suffix.length), match = stem.match(/^(.*)-(S|M|L|XL)$/);
      if (!match || match[1] !== (slot === "top" ? "tshirt-v5.2" : "pants-v2")) continue;
      const fileBase = `${stem}-${body}`;
      if (!files.includes(`${fileBase}.glb`) || !files.includes(`${fileBase}.correctives.json`)) continue;
      const fitFile = await realpath(path.join(root, name));
      if (path.dirname(fitFile) !== root) continue;
      let fit;
      try { fit = parseFitMap(JSON.parse(await readFile(fitFile, "utf8"))); } catch { continue; }
      if (fit.body !== body || fit.size !== match[2] || fit.garment !== match[1]) continue;
      const safe = new URLSearchParams({ slot, body, size: fit.size });
      if (fixtures) safe.set("fixtures", "1");
      options.push({ size: fit.size, fit, glb: `/api/size-garment?${safe}&asset=glb`, sidecar: `/api/size-garment?${safe}&asset=sidecar`, fileBase });
    }
    options.sort((a, b) => SIZES.indexOf(a.size) - SIZES.indexOf(b.size));
    if (size === null && asset === null) return Response.json(options.map(option => ({ size: option.size, fit: option.fit, glb: option.glb, sidecar: option.sidecar })), { headers });
    if (!size || !SIZES.includes(size as Size) || (asset !== "glb" && asset !== "sidecar")) return missing();
    const option = options.find(item => item.size === size);
    if (!option) return missing();
    const filename = await realpath(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ root, `${option.fileBase}.${asset === "glb" ? "glb" : "correctives.json"}`));
    if (path.dirname(filename) !== root) return missing();
    const bytes = await readFile(filename);
    return new Response(new Uint8Array(asset === "glb" ? await compressGlb(bytes) : bytes), { headers: { ...headers, "Content-Type": asset === "glb" ? "model/gltf-binary" : "application/json" } });
  } catch { return missing(); }
}
