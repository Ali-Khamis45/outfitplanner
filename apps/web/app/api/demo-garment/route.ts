import { readFile } from "node:fs/promises";
import path from "node:path";
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
};
export async function GET(request: Request) {
  const variant = new URL(request.url).searchParams.get("variant") ?? "v1";
  const file = Object.hasOwn(VARIANTS, variant) ? VARIANTS[variant] : null;
  if (!file) return Response.json({ error: "Unknown demo garment variant." }, { status: 400 });
  const sidecar = new URL(request.url).searchParams.get("sidecar") === "1";
  try {
    const bytes = await readFile(path.resolve(process.cwd(), "../../outputs/garments", sidecar ? file.replace(/\.glb$/, ".correctives.json") : file));
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": sidecar ? "application/json" : "model/gltf-binary", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if (!sidecar) console.error("Unable to read the local demo garment:", error);
    return Response.json({ error: "Demo garment not found. Run services/garments/generate_tshirt.py first." }, { status: 404 });
  }
}
