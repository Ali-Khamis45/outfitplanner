import { selectCandidates, selectionContains } from "../../lib/stylist/selection.ts";
import { requestIntent, eligibleItems } from "../../lib/stylist/pipeline.ts";
import { validateIntent } from "../../lib/stylist/intent.ts";
import { record } from "../../lib/stylist/core.ts";
import type { Wardrobe, WardrobeItem } from "../../lib/wardrobe/schema.ts";
import type { Scenario, Check } from "./scoring.ts";

// Historical v2 scoring retained for comparison; v2.1 dispatch below explicitly
// shares production policy and reports intent accuracy separately.
function legacyQualityChecks(s: Scenario, wardrobe: Wardrobe, response: unknown, draft = false): Check[] {
  const data = record(response) ? response : {}, look = record(data.structured) ? data.structured : {};
  const evaluation = record(data.evaluation) ? data.evaluation : {};
  const today = s.reference_date ?? s.date, days = Math.max(3, s.expect.not_worn_days ?? 3);
  const cutoff = Date.parse(`${today}T00:00:00Z`) - days * 86400000;
  const fresh = (item: WardrobeItem) => !item.last_worn || Date.parse(`${item.last_worn}T00:00:00Z`) < cutoff;
  const pool = (category: string) => {
    const all = wardrobe.items.filter(item => item.category === category);
    const distance = (item: WardrobeItem) => Math.max(s.expect.formality_range[0] - item.formality, item.formality - s.expect.formality_range[1], 0);
    const nearest = Math.min(...all.map(distance)), candidates = all.filter(item => distance(item) === nearest), unworn = candidates.filter(fresh);
    return unworn.length ? unworn : days > 3 && s.fixture !== "while" ? [] : candidates;
  };
  const chosen = [look.top_id, look.bottom_id].map(id => wardrobe.items.find(item => item.id === id));
  const [top, bottom] = chosen, outer = wardrobe.items.find(item => item.id === look.outer_id);
  const exists = top?.category === "top" && bottom?.category === "bottom" && (look.outer_id === null || outer?.category === "outerwear");
  const bestPool = (category: string) => { const candidates = pool(category), highest = Math.max(...candidates.map(item => item.formality)); return candidates.filter(item => item.formality === highest); };
  const best = !!exists && [top!, bottom!].every(item => bestPool(item.category).some(option => option.id === item.id));
  const checks: Check[] = [];
  const check = (id: string, pass: boolean, detail: string, applicable = true) => checks.push({ id, status: applicable ? pass ? "PASS" : "FAIL" : "N/A", detail });
  check("best_available_formality", best, "Prefer the highest eligible saved formality in each required slot; below-range fallback must be the closest available.");
  const forecast = s.forecast ?? evaluation.forecast;
  const weather = record(forecast) && typeof forecast.temperature_max_c === "number" ? forecast : null;
  let thermal = false;
  if (weather && exists) {
    const target = Number(weather.temperature_max_c) <= 15 ? 4 : Number(weather.temperature_max_c) >= 28 ? 1 : 2;
    const coats = [undefined, ...pool("outerwear")];
    const loss = (a: WardrobeItem, b: WardrobeItem, coat?: WardrobeItem) => Math.abs(Math.min(5, a.warmth + (coat?.warmth ?? 0)) - target) + Math.abs(b.warmth - target);
    const raincoat = (item: WardrobeItem) => /waterproof|rain|shell|مطر|مقاوم للماء/i.test(`${item.type} ${item.material}`);
    const rain = Number(weather.precipitation_probability_percent) >= 50 && pool("outerwear").some(raincoat);
    const suitableCoats = rain ? coats.filter((coat): coat is WardrobeItem => !!coat && raincoat(coat)) : coats;
    const optimum = Math.min(...bestPool("top").flatMap(a => bestPool("bottom").flatMap(b => suitableCoats.map(coat => loss(a, b, coat)))));
    thermal = loss(top!, bottom!, outer) <= optimum && (!rain || !!outer && raincoat(outer));
  }
  check("warmth_vs_forecast", thermal, "Closest available warmth to 4 in cold, 1 in heat, otherwise 2; add upper layers, and prefer an available rain shell for rain >=50%.", !!weather);
  const selected = [top, bottom, outer].filter((item): item is WardrobeItem => !!item);
  const gapNeeded = selected.some(item => item.formality < s.expect.formality_range[0] || item.formality > s.expect.formality_range[1] || !fresh(item));
  check("gap_note", !!exists && (gapNeeded ? typeof look.gap_note === "string" && !!look.gap_note.trim() : look.gap_note === null) && look.formality === Math.min(top!.formality, bottom!.formality), "Disclose an actual formality/recent-wear gap, and never inflate the saved item formality.");
  const expectedAction = s.date > today ? "plan" : s.date === today ? "log_worn" : "none";
  check("date_handled", look.date === s.date && (draft || data.action === expectedAction), "Correct requested date and future-plan/today-log action.");
  const matchesLanguage = (value: unknown) => {
    if (typeof value !== "string" || !value.trim()) return false;
    const arabic = value.match(/[\u0621-\u064A]/g)?.length ?? 0, latin = value.match(/[a-z]/gi)?.length ?? 0;
    return s.language === "arz" ? arabic > 0 && arabic >= latin : latin > 0 && latin > arabic;
  };
  check("reply_language", look.language === s.language && matchesLanguage(look.reason) && [look.gap_note, look.weather_note].every(value => value === null || matchesLanguage(value)), "Expected reply language and dominant script in the reason and notes; not a dialect-fluency judge.");
  return checks;
}

// v2.1 uses the production filter deliberately. Intent labels never enter it.
// These guarantees are conditional on the extracted intent, which is scored separately.
export function qualityChecks(s: Scenario, wardrobe: Wardrobe, response: unknown, draft = false): Check[] {
  const data = record(response) ? response : {}, evaluation = record(data.evaluation) ? data.evaluation : {};
  const checks = legacyQualityChecks(s, wardrobe, response, draft);
  if (evaluation.pipeline !== "v2.1") return checks;
  const look = record(data.structured) ? data.structured : {};
  try {
    const extracted = validateIntent(evaluation.intent), base = requestIntent(s.message, s.reference_date ?? s.date, s.city);
    const intent = { ...base, occasion: extracted.occasion_type, range: [extracted.formality_min, extracted.formality_max] as [number, number], date: extracted.date, language: extracted.language, indoor_outdoor: extracted.indoor_outdoor };
    const selection = selectCandidates(wardrobe.items, intent, evaluation.forecast);
    const contains = selectionContains(selection, look);
    const best = eligibleItems(wardrobe.items, intent, "top").some(i=>i.id===look.top_id) && eligibleItems(wardrobe.items, intent, "bottom").some(i=>i.id===look.bottom_id);
    return checks.map(c => c.id === "best_available_formality" ? { ...c, status: best ? "PASS" : "FAIL", detail: "Guaranteed by shared server formality policy, conditional on extracted intent." }
      : c.id === "warmth_vs_forecast" ? { ...c, status: !selection.thermal ? "N/A" : contains ? "PASS" : "FAIL", detail: "Guaranteed by shared server thermal candidate groups, conditional on extracted intent." }
      : c.id === "gap_note" ? { ...c, status: contains && look.gap_note === selection.gap_note ? "PASS" : "FAIL", detail: "Server-generated disclosure matches the computed gaps." } : c);
  } catch { return checks.map(c => ["best_available_formality", "warmth_vs_forecast", "gap_note"].includes(c.id) ? { ...c, status: "FAIL" } : c); }
}
export function intentChecks(s: Scenario, value: unknown): Check[] {
  const got = record(value) ? value : {}, labels = s.intent_labels;
  if (!labels) return [];
  return [...Object.keys(labels), "formality_range"].map(id => ({ id, status: (id === "formality_range" ? got.formality_min === labels.formality_min && got.formality_max === labels.formality_max : got[id] === labels[id as keyof typeof labels]) ? "PASS" : "FAIL", detail: "Exact match against pre-labelled scenario intent; no label is sent to inference." }));
}
