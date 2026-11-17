import { validDate, record } from "../../lib/stylist/core.ts";
import type { Wardrobe } from "../../lib/wardrobe/schema.ts";

export type Scenario = { id: string; language: "en" | "arz"; message: string; date: string; city: string; expect: {
  must_call_get_wardrobe: true; must_call_get_weather: boolean; recommended_items_exist: true;
  categories: { top: "top"; bottom: "bottom" }; occasion: string; formality_range: [number, number]; not_worn_days: number | null;
} };
export type Check = { id: string; status: "PASS" | "FAIL" | "N/A"; detail: string };
export type Score = { id: string; language: string; status: "PASS" | "FAIL"; checks: Check[]; passed_checks: number; applicable_checks: number; score: number; tool_calls: number; latency_ms: number; http_status: number; response_status: string; tool_failures: number; error?: string };
export function parseScenarios(value: unknown): Scenario[] {
  if (!Array.isArray(value) || value.length !== 30) throw new Error("The evaluation suite must contain exactly 30 scenarios.");
  const ids = new Set<string>();
  for (const s of value) {
    if (!record(s) || typeof s.id !== "string" || !/^[a-z0-9-]+$/.test(s.id) || ids.has(s.id) || !["en", "arz"].includes(String(s.language))
      || typeof s.message !== "string" || !s.message.trim() || s.message.length > 4000 || !validDate(s.date) || typeof s.city !== "string" || !s.city.trim() || s.city.length > 100 || !record(s.expect)) throw new Error("Invalid scenario.");
    const e = s.expect, range = e.formality_range;
    if (e.must_call_get_wardrobe !== true || typeof e.must_call_get_weather !== "boolean" || e.recommended_items_exist !== true
      || !record(e.categories) || e.categories.top !== "top" || e.categories.bottom !== "bottom" || typeof e.occasion !== "string" || !e.occasion.trim()
      || !Array.isArray(range) || range.length !== 2 || !range.every(n => Number.isInteger(n) && n >= 1 && n <= 5) || range[0] > range[1]
      || !(e.not_worn_days === null || (Number.isInteger(e.not_worn_days) && Number(e.not_worn_days) >= 1 && Number(e.not_worn_days) <= 365))) throw new Error(`Invalid expectations: ${s.id}`);
    ids.add(s.id);
  }
  return value as Scenario[];
}
const cityAliases: Record<string, string> = { "القاهره": "cairo", "الجيزه": "giza", "اسكندريه": "alexandria", "الاسكندريه": "alexandria", "اسوان": "aswan", "المنصوره": "mansoura" };
const normalCity = (value: unknown) => {
  const text = typeof value === "string" ? value.trim().toLocaleLowerCase("en").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/[\u064B-\u065F]/g, "") : "";
  return cityAliases[text] ?? text;
};
export function scoreScenario(scenario: Scenario, wardrobe: Wardrobe, response: unknown, httpStatus: number, latencyMs: number, error?: string): Score {
  const data = record(response) ? response : {}, evaluation = record(data.evaluation) ? data.evaluation : {};
  const trace = Array.isArray(evaluation.trace) ? evaluation.trace.filter(record) : [];
  const calls = Array.isArray(data.calls) ? data.calls.filter(record) : [];
  const cards = Array.isArray(data.recommendations) ? data.recommendations.filter(record) : [];
  const known = new Map(wardrobe.items.map(item => [item.id, item]));
  const attempts = trace.filter(call => call.name === "show_on_avatar");
  const groups: unknown[][] = attempts.map(call => record(call.arguments) && Array.isArray(call.arguments.item_ids) ? call.arguments.item_ids : []);
  let validUrls = cards.length > 0;
  for (const card of cards) {
    const items = Array.isArray(card.items) ? card.items : [];
    const ids = items.map(item => record(item) ? item.id : null); groups.push(ids);
    try {
      if (typeof card.url !== "string" || !card.url.startsWith("/try-on?")) throw new Error("Invalid fitting-room URL");
      const url = new URL(card.url, "http://localhost");
      const top = url.searchParams.get("top"), bottom = url.searchParams.get("bottom");
      if (url.origin !== "http://localhost" || url.pathname !== "/try-on" || ids.length !== 2 || top === bottom || !ids.includes(top) || !ids.includes(bottom)
        || known.get(top ?? "")?.category !== "top" || known.get(bottom ?? "")?.category !== "bottom") validUrls = false;
    } catch { validUrls = false; }
  }
  // Empty recommendations must fail: Array.every([]) is not evidence of a look.
  const nonempty = Array.isArray(data.recommendations) && data.recommendations.every(record) && cards.length > 0 && attempts.length > 0 && groups.every(ids => ids.length > 0);
  const exists = nonempty && groups.every(ids => ids.every(id => typeof id === "string" && known.has(id)));
  const selected = groups.flat().flatMap(id => typeof id === "string" && known.has(id) ? [known.get(id)!] : []);
  const [min, max] = scenario.expect.formality_range;
  const checks: Check[] = [];
  const check = (id: string, passed: boolean, detail: string, applicable = true) => checks.push({ id, status: applicable ? passed ? "PASS" : "FAIL" : "N/A", detail });
  check("response_ok", httpStatus === 200 && data.status === "ok" && typeof data.message === "string" && !!data.message.trim(), `HTTP ${httpStatus}; status ${String(data.status ?? "missing")}`);
  check("evaluation_context", record(evaluation.context) && evaluation.context.date === scenario.date && evaluation.context.city === scenario.city, "Trace must match the scenario reference date and city.");
  check("get_wardrobe", trace.some(call => call.name === "get_wardrobe" && call.ok === true), "Requires a successful wardrobe lookup, not just a label in prose.");
  check("get_weather", trace.some(call => call.name === "get_weather" && record(call.arguments) && call.arguments.date === scenario.date && normalCity(call.arguments.city ?? "Cairo") === normalCity(scenario.city)),
    `Requires a call for ${scenario.date} in ${scenario.city}; provider availability is recorded separately.`, scenario.expect.must_call_get_weather);
  check("recommended_items_exist", exists, "All card and attempted show_on_avatar IDs must exist in the fixture; at least one card is required.");
  check("top_bottom_categories", exists && validUrls && groups.every(ids => ids.length === 2 && new Set(ids).size === 2 && ids.filter(id => known.get(String(id))?.category === "top").length === 1 && ids.filter(id => known.get(String(id))?.category === "bottom").length === 1), "Every attempted and rendered look needs one top and one bottom; URL slots must agree with the saved wardrobe.");
  check("formality_range", exists && selected.every(item => item.formality >= min && item.formality <= max), `Every selected item must have formality ${min}–${max} for ${scenario.expect.occasion}.`);
  const n = scenario.expect.not_worn_days, cutoff = Date.parse(`${scenario.date}T00:00:00Z`) - (n ?? 0) * 86400000;
  check("not_worn_recently", exists && selected.every(item => item.last_worn === null || Date.parse(`${item.last_worn}T00:00:00Z`) < cutoff), `Exclude last_worn on or after ${new Date(cutoff).toISOString().slice(0, 10)} (${n ?? 0} days, inclusive boundary).`, n !== null);
  check("no_wear_mutation", Array.isArray(evaluation.trace) && !trace.some(call => call.name === "log_worn"), "Recommendation scenarios do not authorize logging wear.");
  const passed = checks.filter(c => c.status === "PASS").length, applicable = checks.filter(c => c.status !== "N/A").length;
  return { id: scenario.id, language: scenario.language, status: passed === applicable ? "PASS" : "FAIL", checks, passed_checks: passed, applicable_checks: applicable,
    score: passed / applicable, tool_calls: trace.length || calls.length, tool_failures: trace.filter(call => call.ok !== true).length,
    latency_ms: Math.round(latencyMs), http_status: httpStatus, response_status: String(data.status ?? "missing"), ...(error ? { error } : {}) };
}
export function summarize(scores: Score[]) {
  const passedChecks = scores.reduce((n, s) => n + s.passed_checks, 0), applicableChecks = scores.reduce((n, s) => n + s.applicable_checks, 0);
  return { scenarios: scores.length, passed_scenarios: scores.filter(s => s.status === "PASS").length, failed_scenarios: scores.filter(s => s.status === "FAIL").length,
    passed_checks: passedChecks, applicable_checks: applicableChecks, overall_score: applicableChecks ? passedChecks / applicableChecks : 0,
    average_tool_calls: scores.length ? scores.reduce((n, s) => n + s.tool_calls, 0) / scores.length : 0,
    average_latency_ms: scores.length ? scores.reduce((n, s) => n + s.latency_ms, 0) / scores.length : 0 };
}
