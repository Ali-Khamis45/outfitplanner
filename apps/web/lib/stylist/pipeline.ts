import type { WardrobeItem } from "../wardrobe/schema.ts";
import type { Selection } from "./selection.ts";
import { InputError, object } from "./core.ts";
import { normalize, replyLanguage, requestDate } from "./dates.ts";

export type Intent = { today: string; date: string; city: string | null; weather: boolean; language: "en" | "arz"; occasion: string; range: [number, number]; days: number; explicitRecency: boolean; indoor_outdoor?: "indoor" | "outdoor" | "mixed" | "unknown" };
export type StructuredLook = { top_id: string; bottom_id: string; outer_id: string | null; occasion: string; formality: number; reason: string; weather_note: string | null; gap_note: string | null; date: string; language: "en" | "arz" };

// Application policy, shared by real chat and evaluation. No scenario IDs,
// expectations or fixture metadata enter intent detection or model prompts.
export function requestIntent(message: string, today: string, referenceCity?: string): Intent {
  const text = normalize(message), language = replyLanguage(message);
  let occasion = "everyday", range: [number, number] = [1, 5];
  if (/wedding|ceremony|fully formal|most formal|فرح|مناسبه رسميه|اكتر.*رسمي/.test(text)) { occasion = "formal"; range = [5, 5]; }
  else if (/interview|business|presentation|client|professional|انترفيو|بريزنتيشن|عميل/.test(text)) { occasion = "business"; range = [4, 5]; }
  else if (/gym|sport|workout|جيم|رياضي/.test(text)) { occasion = "sport"; range = [1, 1]; }
  else if (/family|عائلي/.test(text)) { occasion = "outing"; range = [2, 3]; }
  else if (/dinner|smart|عشا|شيك بس/.test(text)) { occasion = "outing"; range = [3, 4]; }
  else if (/office|work\b|شغل|مكتب/.test(text)) { occasion = "work"; range = [3, 4]; }
  else if (/travel|مسافر/.test(text)) { occasion = "travel"; range = [1, 2]; }
  else if (/casual|relaxed|coffee|informal|board.game|كاجوال|قهوه|مريح|صحابي/.test(text)) { occasion = "casual"; range = [1, 2]; }
  else if (/\bformal\b|رسمي/.test(text)) { occasion = "business"; range = [4, 5]; }
  const explicitRange = text.match(/formality\s*(?:of\s*)?([1-5])\s*(?:-|to)\s*([1-5])/);
  if (explicitRange && +explicitRange[1] <= +explicitRange[2]) range = [+explicitRange[1], +explicitRange[2]];
  const recency = text.match(/(?:last|past|اخر)\s+(\d+)\s*(?:days?|ايام|يوم)/);
  const whileAgo = /in a while|for a while|من زمان|بقالي.*ملبست/.test(text);
  const days = Math.max(3, Math.min(365, Number(recency?.[1] ?? (whileAgo ? 30 : 3))));
  const { date, specified } = requestDate(message, today);
  const cities: [RegExp, string][] = [[/\bcairo\b|القاهره/, "Cairo"], [/\bgiza\b|الجيزه/, "Giza"], [/\balexandria\b|اسكندريه/, "Alexandria"], [/\baswan\b|اسوان/, "Aswan"], [/\bmansoura\b|المنصوره/, "Mansoura"]];
  // Generic explicit place syntax also works outside the known bilingual aliases.
  const place = message.match(/\b(?:in|to|for)\s+([A-Z][\p{L} .'-]{1,60}?)(?=\s+(?:on|today|tomorrow|before|and|this)\b|[,.!?]|$)/u)?.[1]
    ?? message.match(/(?:في|إلى|الى)\s+([\u0600-\u06FF ]{2,60}?)(?=\s+(?:يوم|بكره|النهارده)|[،.!؟]|$)/u)?.[1];
  const city = cities.find(([pattern]) => pattern.test(text))?.[1] ?? (place && !/\boffice\b|\bhome\b|البيت|قاعه|مكتب/.test(normalize(place)) ? place.trim() : null);
  const noWeather = /no (?:weather|forecast)|skip the forecast|سيبك من الجو|بلاش نشوف الجو|مش محتاج/.test(text);
  const asksWeather = !noWeather && /weather|forecast|الجو|الطقس/.test(text);
  const weather = !!city || specified || asksWeather;
  return { today, date, city: city ?? (weather ? referenceCity ?? null : null), weather, language, occasion, range, days, explicitRecency: !!recency };
}

export const recentlyWorn = (item: Pick<WardrobeItem, "last_worn">, date: string, days: number) => item.last_worn !== null && Date.parse(`${item.last_worn}T00:00:00Z`) >= Date.parse(`${date}T00:00:00Z`) - days * 86400000;
export function eligibleItems(items: WardrobeItem[], intent: Intent, category: WardrobeItem["category"]) {
  const categoryItems = items.filter(item => item.category === category);
  const inRange = categoryItems.filter(item => item.formality >= intent.range[0] && item.formality <= intent.range[1]);
  const highest = Math.max(...categoryItems.map(item => item.formality));
  const matching = inRange.length ? inRange : categoryItems.filter(item => item.formality === highest);
  const fresh = matching.filter(item => !recentlyWorn(item, intent.today, intent.days));
  const available = fresh.length || intent.explicitRecency && intent.days > 3 ? fresh : matching;
  const best = Math.max(...available.map(item => item.formality));
  return category === "outerwear" ? available : available.filter(item => item.formality === best);
}
export function wardrobeGaps(items: WardrobeItem[], intent: Intent, selected?: string[]) {
  const candidates = selected ? items.filter(item => selected.includes(item.id)) : ["top", "bottom"].flatMap(category => eligibleItems(items, intent, category as "top" | "bottom"));
  const formality = [...new Set(candidates.filter(item => item.formality < intent.range[0] || item.formality > intent.range[1]).map(item => item.category))];
  const recent = [...new Set(candidates.filter(item => recentlyWorn(item, intent.today, intent.days)).map(item => item.category))];
  return { formality, recent, needed: formality.length > 0 || recent.length > 0 };
}
export function lookSchema(items: WardrobeItem[], intent: Intent, weatherNote?: string | null, selection?: Selection) {
  const ids = (category: WardrobeItem["category"]) => eligibleItems(items, intent, category).map(item => item.id);
  const tops = selection ? selection.tops.map(i => i.id) : ids("top"), bottoms = selection ? selection.bottoms.map(i => i.id) : ids("bottom"), outers = selection ? selection.outers.map(i => i.id) : ids("outerwear");
  if (!tops.length || !bottoms.length) throw new InputError(intent.language === "arz" ? "مفيش توب وبنطلون في دولابك مناسبين للشروط دي. جرب مناسبة أو شروط تانية." : "Your wardrobe has no top and bottom that meet these constraints. Try another occasion or change the constraints.");
  return { type: "object", additionalProperties: false, required: ["top_id", "bottom_id", "outer_id", "occasion", "formality", "reason", "weather_note", "gap_note", "date", "language"], properties: {
    top_id: { type: "string", enum: tops }, bottom_id: { type: "string", enum: bottoms },
    outer_id: { type: ["string", "null"], enum: [...outers, ...(!selection || selection.allowNoOuter ? [null] : [])] },
    occasion: { type: "string", minLength: 1, maxLength: 100 },
    formality: { type: "integer", minimum: 1, maximum: 5, ...(selection ? { enum: [Math.min(selection.tops[0].formality, selection.bottoms[0].formality)] } : {}), description: "Actual outfit formality: minimum of the saved top and bottom formality values, not the occasion target." },
    gap_note: { type: ["string", "null"], maxLength: 700, ...(selection ? { enum: [selection.gap_note] } : {}) }, date: { type: "string", ...(selection ? { enum: [intent.date] } : {}), pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    reason: { type: "string", minLength: 1, maxLength: 600, description: "One or two short sentences in the requested language." },
    weather_note: { type: ["string", "null"], maxLength: 300, ...(weatherNote !== undefined ? { enum: [weatherNote] } : {}) }, language: { type: "string", enum: [intent.language] },
  } };
}
export function validateLook(value: unknown, items: WardrobeItem[], intent: Intent, selection?: Selection): StructuredLook {
  const look = object(value, ["top_id", "bottom_id", "outer_id", "occasion", "formality", "reason", "weather_note", "gap_note", "date", "language"]);
  for (const [key, category] of [["top_id", "top"], ["bottom_id", "bottom"], ["outer_id", "outerwear"]] as const) {
    if (key === "outer_id" && look[key] === null) continue;
    if (!eligibleItems(items, intent, category).some(item => item.id === look[key])) throw new InputError(`Choose an eligible ${category} ID from the schema; respect formality and recent wear.`);
  }
  if (selection && (look.gap_note !== selection.gap_note || !selection.tops.some(i => i.id === look.top_id) || !selection.bottoms.some(i => i.id === look.bottom_id) || (look.outer_id === null ? !selection.allowNoOuter : !selection.outers.some(i => i.id === look.outer_id)))) throw new InputError("Choose only the filtered IDs and copy the server gap_note exactly.");
  const selected = items.filter(item => [look.top_id, look.bottom_id].includes(item.id));
  if (look.formality !== Math.min(...selected.map(item => item.formality))) throw new InputError("Formality must equal the lower saved formality of the selected top and bottom. Never label a casual item as formal.");
  if (look.date !== intent.date) throw new InputError(`Use the requested date ${intent.date}.`);
  const gap = wardrobeGaps(items, intent, [String(look.top_id), String(look.bottom_id), String(look.outer_id)]);
  if (!(look.gap_note === null || typeof look.gap_note === "string" && look.gap_note.trim() && look.gap_note.length <= 700) || gap.needed && !look.gap_note) throw new InputError("Acknowledge the wardrobe gap in gap_note: closest available formality or unavoidable recent wear. Do not claim the target is met.");
  if (typeof look.gap_note === "string" && replyLanguage(look.gap_note) !== intent.language) throw new InputError("Use the requested language for gap_note.");
  if (typeof look.occasion !== "string" || !look.occasion.trim() || look.occasion.length > 100) throw new InputError("Provide a short occasion.");
  if (typeof look.reason !== "string" || !look.reason.trim() || look.reason.length > 600 || look.reason.split(/[.!?؟]+/u).filter(part => part.trim()).length > 2) throw new InputError("Reason must be one or two short sentences.");
  if (look.language !== intent.language || (/[\u0600-\u06FF]/.test(look.reason) !== (intent.language === "arz"))) throw new InputError(`Reply in ${intent.language === "arz" ? "Egyptian Arabic" : "English"}, including the reason.`);
  if (!(look.weather_note === null || typeof look.weather_note === "string" && look.weather_note.length <= 300)) throw new InputError("Weather note must be short text or null.");
  if (typeof look.weather_note === "string" && look.weather_note.trim() && /[\u0600-\u06FF]/.test(look.weather_note) !== (intent.language === "arz")) throw new InputError("Use the requested language for the weather note.");
  return look as StructuredLook;
}
