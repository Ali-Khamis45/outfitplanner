import { compressedAsset } from "../../asset-compression/compress.mjs";

export async function compressedGlbResponse(source: string, request: Request): Promise<Response> {
  // Next's production route adapter strips Content-Encoding from Web Response
  // objects. Return meshopt-compressed GLB bytes, never a pre-gzipped body.
  void request;
  const bytes = await compressedAsset(source, undefined, false);
  const headers: Record<string, string> = { "Content-Type": "model/gltf-binary", "Content-Length": String(bytes.byteLength), "Cache-Control": "no-store, no-transform", "Vary": "Accept-Encoding", "X-Content-Type-Options": "nosniff" };
  return new Response(new Uint8Array(bytes), { headers });
}
