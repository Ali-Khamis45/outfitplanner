import { InputError, object, validDate } from "../stylist/core.ts";
import type { Wardrobe } from "../wardrobe/schema.ts";

export type Plan = { date: string; outfit_id: string | null; item_ids: string[]; occasion: string; note: string; created_at: string };
export type Planner = { version: 1; plans: Plan[] };
const fields = ["date", "outfit_id", "item_ids", "occasion", "note", "created_at"];
const id = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(v);

export function parsePlan(value: unknown): Plan {
  const p = object(value, fields);
  if (Object.keys(p).length !== fields.length || !validDate(p.date) || !validDate(p.created_at)
    || !(p.outfit_id === null || id(p.outfit_id)) || !Array.isArray(p.item_ids) || !p.item_ids.length || p.item_ids.length > 100
    || !p.item_ids.every(id) || new Set(p.item_ids).size !== p.item_ids.length
    || typeof p.occasion !== "string" || !p.occasion.trim() || p.occasion.length > 100
    || typeof p.note !== "string" || p.note.length > 1000) throw new InputError("Invalid plan. Choose items, an occasion and valid dates.");
  return p as Plan;
}
export function parsePlanner(value: unknown): Planner {
  const p = object(value, ["version", "plans"]);
  if (p.version !== 1 || !Array.isArray(p.plans) || p.plans.length > 10000) throw new InputError("Invalid planner document.");
  const plans = p.plans.map(parsePlan);
  if (new Set(plans.map(plan => plan.date)).size !== plans.length) throw new InputError("Only one plan is allowed per date.");
  return { version: 1, plans };
}
export function validateReferences(plan: Plan, wardrobe: Wardrobe) {
  if (plan.item_ids.some(id => !wardrobe.items.some(item => item.id === id))) throw new InputError("A selected item no longer exists in your wardrobe.");
  if (plan.outfit_id !== null) {
    const outfit = wardrobe.outfits.find(outfit => outfit.id === plan.outfit_id);
    if (!outfit) throw new InputError("The selected outfit no longer exists in your wardrobe.");
    if (outfit.items.length !== plan.item_ids.length || outfit.items.some(id => !plan.item_ids.includes(id))) throw new InputError("The outfit has changed. Select it again before saving.");
  }
}
