export type CameraView = "front" | "back" | "left" | "right" | "reset";
export type AssetStatus = "loading" | "ready" | "error";
export interface ModelInfo { vertices: number; triangles: number; joints: number; skinnedMeshes: number; hasSkinning: boolean; size: [number, number, number]; center: [number, number, number]; }
export interface RenderStats { fps: number | null; calls: number; triangles: number; }
