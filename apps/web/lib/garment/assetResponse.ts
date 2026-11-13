import { compressedAsset } from "../../asset-compression/compress.mjs";

export async function compressedGlbResponse(source: string, request: Request): Promise<Response> {
  const accepted = request.headers.get("accept-encoding") ?? "";
  const match = accepted.split(",").map(value => value.trim()).find(value => /^gzip(?:\s*;|$)/i.test(value));
  const quality = match?.match(/;\s*q=([\d.]+)/i);
  const gzip = Boolean(match) && (!quality || Number(quality[1]) > 0);
  const bytes = await compressedAsset(source, undefined, gzip);
  const headers: Record<string, string> = { "Content-Type": "model/gltf-binary", "Content-Length": String(bytes.byteLength), "Cache-Control": "no-store", "Vary": "Accept-Encoding", "X-Content-Type-Options": "nosniff" };
  if (gzip) headers["Content-Encoding"] = "gzip";
  return new Response(new Uint8Array(bytes), { headers });
}
