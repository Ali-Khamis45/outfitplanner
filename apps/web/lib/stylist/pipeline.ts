import type { WardrobeItem } from "../wardrobe/schema.ts";
import { InputError, object, validDate } from "./core.ts";

export type Intent = { today: string; date: string; city: string | null; weather: boolean; language: "en" | "arz"; occasion: string; range: [number, number]; days: number; explicitRecency: boolean };
export type StructuredLook = { top_id: string; bottom_id: string; outer_id: string | null; occasion: string; formality: number; reason: string; weather_note: string | null; language: "en" | "arz" };
const normalize = (text: string) => text.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/[\u064B-\u065F]/g, "").replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632));

// Application policy, shared by real chat and evaluation. No scenario IDs,
// expectations or fixture metadata enter intent detection or model prompts.
export function requestIntent(message: string, today: string, referenceCity?: string): Intent {
  const text = normalize(message), language = /[\u0600-\u06FF]/.test(message) ? "arz" : "en";
  let occasion = "everyday", range: [number, number] = [1, 5];
  if (/wedding|ceremony|fully formal|most formal|فرح|مناسبه رسميه|اكتر.*رسمي/.test(text)) { occasion = "formal"; range = [5, 5]; }
  else if (/interview|business|presentation|client|professional|انترفيو|بريزنتيشن|عميل/.test(text)) { occasion = "business"; range = [4, 5]; }
  else if (/gym|sport|workout|جيم|رياضي/.test(text)) { occasion = "sport"; range = [1, 1]; }
  else if (/family|عائلي/.test(text)) { occasion = "outing"; range = [2, 3]; }
  else if (/dinner|smart|عشا|شيك بس/.test(text)) { occasion = "outing"; range = [3, 4]; }
  else if (/office|work\b|شغل|مكتب/.test(text)) { occasion = "work"; range = [3, 4]; }
  else if (/travel|مسافر/.test(text)) { occasion = "travel"; range = [1, 2]; }
  else if (/casual|relaxed|coffee|informal|board.game|كاجوال|قهوه|مريح|صحابي/.test(text)) { occasion = "casual"; range = [1, 2]; }
  const explicitRange = text.match(/formality\s*(?:of\s*)?([1-5])\s*(?:-|to)\s*([1-5])/);
  if (explicitRange && +explicitRange[1] <= +explicitRange[2]) range = [+explicitRange[1], +explicitRange[2]];
  const recency = text.match(/(?:last|past|اخر)\s+(\d+)\s*(?:days?|ايام|يوم)/);
  const days = Math.max(3, Math.min(365, Number(recency?.[1] ?? 3)));
  const explicitDate = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (explicitDate && !validDate(explicitDate)) throw new InputError("Please use a valid date (YYYY-MM-DD).");
  const tomorrow = /\btomorrow\b|بكره/.test(text), yesterday = /\byesterday\b|امبارح/.test(text);
  const date = explicitDate ?? new Date(Date.parse(`${today}T00:00:00Z`) + (tomorrow ? 1 : yesterday ? -1 : 0) * 86400000).toISOString().slice(0, 10);
  const cities: [RegExp, string][] = [[/\bcairo\b|القاهره/, "Cairo"], [/\bgiza\b|الجيزه/, "Giza"], [/\balexandria\b|اسكندريه/, "Alexandria"], [/\baswan\b|اسوان/, "Aswan"], [/\bmansoura\b|المنصوره/, "Mansoura"]];
  // Generic explicit place syntax also works outside the known bilingual aliases.
  const place = message.match(/\b(?:in|to|for)\s+([A-Z][\p{L} .'-]{1,60}?)(?=\s+(?:on|today|tomorrow|before|and|this)\b|[,.!?]|$)/u)?.[1]
    ?? message.match(/(?:في|إلى|الى)\s+([\u0600-\u06FF ]{2,60}?)(?=\s+(?:يوم|بكره|النهارده)|[،.!؟]|$)/u)?.[1];
  const city = cities.find(([pattern]) => pattern.test(text))?.[1] ?? place?.trim() ?? null;
  const noWeather = /no (?:weather|forecast)|skip the forecast|سيبك من الجو|بلاش نشوف الجو|مش محتاج/.test(text);
  const asksWeather = !noWeather && /weather|forecast|الجو|الطقس/.test(text);
  const weather = !!city || !!explicitDate || tomorrow || yesterday || /\btoday\b|النهارده/.test(text) || asksWeather;
  return { today, date, city: city ?? (weather ? referenceCity ?? null : null), weather, language, occasion, range, days, explicitRecency: !!recency };
}

export const recentlyWorn = (item: Pick<WardrobeItem, "last_worn">, date: string, days: number) => item.last_worn !== null && Date.parse(`${item.last_worn}T00:00:00Z`) >= Date.parse(`${date}T00:00:00Z`) - days * 86400000;
export function eligibleItems(items: WardrobeItem[], intent: Intent, category: WardrobeItem["category"]) {
  const matching = items.filter(item => item.category === category && item.formality >= intent.range[0] && item.formality <= intent.range[1]);
  const fresh = matching.filter(item => !recentlyWorn(item, intent.today, intent.days));
  // Relax the default three-day preference only when this slot has no fresh
  // alternative. Explicit longer exclusions remain hard constraints.
  return fresh.length || intent.days > 3 ? fresh : matching;
}
export function lookSchema(items: WardrobeItem[], intent: Intent, weatherNote?: string | null) {
  const ids = (category: WardrobeItem["category"]) => eligibleItems(items, intent, category).map(item => item.id);
  const tops = ids("top"), bottoms = ids("bottom"), outers = ids("outerwear");
  if (!tops.length || !bottoms.length) throw new InputError(intent.language === "arz" ? "مفيش توب وبنطلون في دولابك مناسبين للشروط دي. جرب مناسبة أو شروط تانية." : "Your wardrobe has no top and bottom that meet these constraints. Try another occasion or change the constraints.");
  return { type: "object", additionalProperties: false, required: ["top_id", "bottom_id", "outer_id", "occasion", "formality", "reason", "weather_note", "language"], properties: {
    top_id: { type: "string", enum: tops }, bottom_id: { type: "string", enum: bottoms },
    outer_id: { type: ["string", "null"], enum: [...outers, null] },
    occasion: { type: "string", minLength: 1, maxLength: 100 },
    formality: { type: "integer", enum: Array.from({ length: intent.range[1] - intent.range[0] + 1 }, (_, index) => index + intent.range[0]) },
    reason: { type: "string", minLength: 1, maxLength: 600, description: "One or two short sentences in the requested language." },
    weather_note: { type: ["string", "null"], maxLength: 300, ...(weatherNote !== undefined ? { enum: [weatherNote] } : {}) }, language: { type: "string", enum: [intent.language] },
  } };
}
export function validateLook(value: unknown, items: WardrobeItem[], intent: Intent): StructuredLook {
  const look = object(value, ["top_id", "bottom_id", "outer_id", "occasion", "formality", "reason", "weather_note", "language"]);
  for (const [key, category] of [["top_id", "top"], ["bottom_id", "bottom"], ["outer_id", "outerwear"]] as const) {
    if (key === "outer_id" && look[key] === null) continue;
    if (!eligibleItems(items, intent, category).some(item => item.id === look[key])) throw new InputError(`Choose an eligible ${category} ID from the schema; respect formality and recent wear.`);
  }
  if (!Number.isInteger(look.formality) || Number(look.formality) < intent.range[0] || Number(look.formality) > intent.range[1]) throw new InputError("Formality must be in the requested range.");
  if (typeof look.occasion !== "string" || !look.occasion.trim() || look.occasion.length > 100) throw new InputError("Provide a short occasion.");
  if (typeof look.reason !== "string" || !look.reason.trim() || look.reason.length > 600 || look.reason.split(/[.!?؟]+/u).filter(part => part.trim()).length > 2) throw new InputError("Reason must be one or two short sentences.");
  if (look.language !== intent.language || (/[\u0600-\u06FF]/.test(look.reason) !== (intent.language === "arz"))) throw new InputError(`Reply in ${intent.language === "arz" ? "Egyptian Arabic" : "English"}, including the reason.`);
  if (!(look.weather_note === null || typeof look.weather_note === "string" && look.weather_note.length <= 300)) throw new InputError("Weather note must be short text or null.");
  if (typeof look.weather_note === "string" && look.weather_note.trim() && /[\u0600-\u06FF]/.test(look.weather_note) !== (intent.language === "arz")) throw new InputError("Use the requested language for the weather note.");
  return look as StructuredLook;
}
