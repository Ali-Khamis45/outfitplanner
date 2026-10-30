import { readFile } from "node:fs/promises";
import path from "node:path";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A fixed local research demo, not a general file-serving API.
export async function GET() {
  try {
    const bytes = await readFile(path.resolve(process.cwd(), "../../outputs/avatars/mhr-neutral.glb"));
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "model/gltf-binary", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    console.error("Unable to read the local MHR demo asset:", error);
    return Response.json({ error: "MHR demo asset not found. Generate outputs/avatars/mhr-neutral.glb first." }, { status: 404 });
  }
}
