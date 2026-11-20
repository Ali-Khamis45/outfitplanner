import type { WardrobeItem } from "../wardrobe/schema";
import type { EvaluationContext, EvaluationTrace } from "./evaluation";
import type { ExtractedIntent } from "./intent";
import type { StructuredLook } from "./pipeline";
export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ToolChip = { name: string; label: string; ok: boolean };
export type RecommendationItem = Pick<WardrobeItem, "id" | "name" | "category" | "photo" | "template" | "colors" | "texture">;
export type Recommendation = { url: string; items: RecommendationItem[]; reason: string };
export type ChatResult = { status: "ok" | "not_connected" | "limit" | "error"; message: string | null; calls: ToolChip[]; recommendations: Recommendation[]; structured?: StructuredLook; intent?: ExtractedIntent; action?: "plan" | "log_worn" | "none"; keep_alive_status?: "unavailable"; error?: string; evaluation?: { context: EvaluationContext; trace: EvaluationTrace[]; tool_validity: { valid: number; invalid: number }; pipeline?: "v2" | "v2.1"; intent?: unknown; first_intent?: unknown; intent_attempts?: number; validation_attempts?: number; first_draft?: unknown; first_validation_pass?: boolean; forecast?: unknown } };
