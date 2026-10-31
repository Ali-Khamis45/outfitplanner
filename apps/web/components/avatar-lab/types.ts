export type CameraView = "front" | "back" | "left" | "right" | "reset";
export type AssetStatus = "loading" | "ready" | "error";
export interface ModelInfo { vertices: number; triangles: number; joints: number; skinnedMeshes: number; hasSkinning: boolean; size: [number, number, number]; center: [number, number, number]; }
export interface RenderStats { fps: number | null; calls: number; triangles: number; }
/** Neutral is served by the fixed demo route; personal GLBs are read from a local file into a browser-only blob URL. */
export type AvatarSource =
  | { kind: "neutral"; url: string; label: string }
  | { kind: "personal"; url: string; label: string; fileName: string; bytes: number; sha256: string | null };
export type PersonalSource = Extract<AvatarSource, { kind: "personal" }>;
/** Neutral demo T-shirts are served by a fixed whitelisted route; any other garment is a local file read in the browser. */
export type DemoGarmentVariant = "v1" | "v2" | "v2-lod";
export type GarmentSource =
  | { kind: "demo"; variant: DemoGarmentVariant; url: string; label: string }
  | { kind: "local"; url: string; label: string; fileName: string; bytes: number; sha256: string | null };
export interface GarmentInfo { garmentId: string; vertices: number; triangles: number; joints: number; maxInverseBindDelta: number; bodyVariant: string }
export type GarmentStatus = { state: "off" | "loading" } | { state: "ready"; info: GarmentInfo } | { state: "error"; message: string };
