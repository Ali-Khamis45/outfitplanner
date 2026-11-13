import path from "node:path";
import { compressedGlbResponse } from "../../../lib/garment/assetResponse.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A fixed local research demo, not a general file-serving API.
export async function GET(request: Request) {
  try {
    return await compressedGlbResponse(path.resolve(process.cwd(), "../../outputs/avatars/mhr-neutral.glb"), request);
  } catch (error) {
    console.error("Unable to read the local MHR demo asset:", error);
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    return Response.json({ error: missing ? "MHR demo asset not found. Generate outputs/avatars/mhr-neutral.glb first." : "Unable to prepare the demo avatar." }, { status: missing ? 404 : 500 });
  }
}
