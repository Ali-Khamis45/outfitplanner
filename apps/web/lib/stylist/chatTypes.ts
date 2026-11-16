import type { WardrobeItem } from "../wardrobe/schema";
export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ToolChip = { name: string; label: string; ok: boolean };
export type RecommendationItem = Pick<WardrobeItem, "id" | "name" | "category" | "photo" | "template" | "colors" | "texture">;
export type Recommendation = { url: string; items: RecommendationItem[]; reason: string };
export type ChatResult = { status: "ok" | "not_connected" | "limit" | "error"; message: string | null; calls: ToolChip[]; recommendations: Recommendation[]; error?: string };
