import { createHash } from "node:crypto";
import { compressedAsset } from "../../asset-compression/compress.mjs";

export async function compressedGlbResponse(source: string, request: Request): Promise<Response> {
  const bytes = await compressedAsset(source, undefined, false);
  const etag = `"${createHash("sha256").update(bytes).digest("hex")}"`;
  const headers: Record<string, string> = { "Content-Type": "model/gltf-binary", "Content-Length": String(bytes.byteLength), "Cache-Control": "private, no-cache, no-transform", "ETag": etag, "X-Content-Type-Options": "nosniff" };
  if ((request.headers.get("if-none-match") ?? "").split(",").some(tag => tag.trim() === etag || tag.trim() === "*")) { delete headers["Content-Length"]; return new Response(null, { status: 304, headers }); }
  return new Response(new Uint8Array(bytes), { headers });
}
