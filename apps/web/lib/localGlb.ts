/** Reads a user-chosen .glb entirely in the browser: no upload, no server route, only a revocable blob URL. */
export interface LocalGlb { url: string; fileName: string; bytes: number; sha256: string | null }

export const MAX_LOCAL_GLB_BYTES = 64 * 1024 * 1024;
const GLB_MAGIC = 0x46546c67; // "glTF" read as a little-endian uint32

export class LocalGlbError extends Error {
  name = "LocalGlbError";
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null; // Only available in secure contexts such as http://localhost.
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function readLocalGlb(file: File): Promise<LocalGlb> {
  if (!/\.glb$/i.test(file.name) || file.size < 12 || file.size > MAX_LOCAL_GLB_BYTES) throw new LocalGlbError("Choose a binary .glb file under 64 MB.");
  const buffer = await file.arrayBuffer();
  if (new DataView(buffer).getUint32(0, true) !== GLB_MAGIC) throw new LocalGlbError("This file is not a binary glTF (missing the glTF header).");
  const sha256 = await sha256Hex(buffer);
  return { url: URL.createObjectURL(new Blob([buffer], { type: "model/gltf-binary" })), fileName: file.name, bytes: file.size, sha256 };
}
