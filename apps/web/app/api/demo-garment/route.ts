import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { compressedGlbResponse } from "../../../lib/garment/assetResponse.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Fixed local research demos (procedural T-shirts fitted to the neutral MHR body), not a general file-serving API.
// Only these non-personal files can be returned; personal garment fits are read from a local file in the browser.
const VARIANTS: Record<string, string> = {
  v1: "tshirt-mhr-neutral.glb",
  v2: "tshirt-v2-mhr-neutral.glb",
  "v2-lod": "tshirt-v2-lod-mhr-neutral.glb",
  v3: "experiments/tshirt-v3-close1-mhr-neutral.glb",
  v4: "experiments/tshirt-v4-mhr-neutral.glb",
  v5: "experiments/tshirt-v5-mhr-neutral.glb",
  "v5.1": "experiments/tshirt-v5.1-mhr-neutral.glb",
  "v5.2": "experiments/tshirt-v5.2-mhr-neutral.glb",
  pants: "pants-basic-v1-mhr-neutral.glb",
  "pants-v2": "pants-basic-v2-mhr-neutral.glb",
};
export async function HEAD(request: Request) {
  const variant = new URL(request.url).searchParams.get("variant") ?? "v1";
  const file = Object.hasOwn(VARIANTS, variant) ? VARIANTS[variant] : null;
  if (!file) return new Response(null, { status: 400 });
  const sidecar = new URL(request.url).searchParams.get("sidecar") === "1";
  try {
    await stat(path.resolve(process.cwd(), "../../outputs/garments", sidecar ? file.replace(/\.glb$/, ".correctives.json") : file));
    return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch { return new Response(null, { status: 404 }); }
}
export async function GET(request: Request) {
  const variant = new URL(request.url).searchParams.get("variant") ?? "v1";
  const file = Object.hasOwn(VARIANTS, variant) ? VARIANTS[variant] : null;
  if (!file) return Response.json({ error: "Unknown demo garment variant." }, { status: 400 });
  const sidecar = new URL(request.url).searchParams.get("sidecar") === "1";
  try {
    const source = path.resolve(process.cwd(), "../../outputs/garments", sidecar ? file.replace(/\.glb$/, ".correctives.json") : file);
    if (!sidecar) return await compressedGlbResponse(source, request);
    const bytes = await readFile(source);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    if (!missing || (!sidecar && variant !== "pants" && variant !== "pants-v2")) console.error("Unable to read the local demo garment:", error);
    return Response.json({ error: missing ? (variant === "pants" || variant === "pants-v2" ? "Pants not generated yet." : "Demo garment not found.") : "Unable to prepare the demo garment." }, { status: missing ? 404 : 500 });
  }
}
