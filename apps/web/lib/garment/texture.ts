import { CanvasTexture, SRGBColorSpace } from "three";

/** Bake alpha over the producer's fallback colour in sRGB, leaving the garment opaque. */
export async function loadGarmentTexture(path: string): Promise<CanvasTexture> {
  const name = path.split("/").pop() ?? "";
  const fixture = path.startsWith("fixture:");
  const url = `/api/wardrobe?texture=${encodeURIComponent(name)}${fixture ? "&fixture=1" : ""}`;
  const response = await fetch(`${url}&metadata=1`, { cache: "no-store" });
  if (!response.ok) throw new Error("Texture metadata unavailable");
  const { fallback_hex } = await response.json() as { fallback_hex: string };
  const image = new Image(); image.src = url; await image.decode();
  const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d"); if (!context) throw new Error("Texture canvas unavailable");
  context.fillStyle = fallback_hex; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.flipY = false; texture.needsUpdate = true; return texture;
}
