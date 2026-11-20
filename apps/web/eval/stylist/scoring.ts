import { validDate, record } from "../../lib/stylist/core.ts";
import type { Wardrobe } from "../../lib/wardrobe/schema.ts";
import { validToolArguments } from "../../lib/stylist/toolValidation.ts";
import type { ExtractedIntent } from "../../lib/stylist/intent.ts";
import { validateIntent } from "../../lib/stylist/intent.ts";
import { qualityChecks, intentChecks } from "./quality.ts";
import type { EvaluationContext } from "../../lib/stylist/evaluation.ts";

export type Scenario = { id: string; language: "en" | "arz"; message: string; date: string; city: string; reference_date?: string; fixture?: "gap" | "recent" | "cold" | "rain" | "mixed" | "while"; forecast?: EvaluationContext["forecast"]; intent_labels?: ExtractedIntent; history?: { role: "user" | "assistant"; content: string }[]; previous?: { intent: ExtractedIntent; ids: string[] }; expect: {
  must_call_get_wardrobe: true; must_call_get_weather: boolean; recommended_items_exist: true;
  categories: { top: "top"; bottom: "bottom" }; occasion: string; formality_range: [number, number]; not_worn_days: number | null;
} };
export type Check = { id: string; status: "PASS" | "FAIL" | "N/A"; detail: string };
export type Score = { expected_kind?: string; id: string; language: string; status: "PASS" | "FAIL"; checks: Check[]; passed_checks: number; applicable_checks: number; score: number; tool_calls: number; valid_tool_calls: number; invalid_tool_calls: number; latency_ms: number; http_status: number; response_status: string; tool_failures: number; validation_attempts?: number; context_reads?: number; quality_checks?: Check[]; intent_checks?: Check[]; first_intent_checks?: Check[]; intent_attempts?: number; quality_status?: "PASS" | "FAIL"; first_try_pass?: boolean; first_try_validation_pass?: boolean; error?: string };
export function parseScenarios(value: unknown): Scenario[] {
  if (!Array.isArray(value) || ![30, 40, 48, 50].includes(value.length)) throw new Error("The evaluation suite must contain 30 legacy, 40 combined, 48 with conversations, or 50 with social dinners.");
  const ids = new Set<string>();
  for (const s of value) {
    if (!record(s) || typeof s.id !== "string" || !/^[a-z0-9-]+$/.test(s.id) || ids.has(s.id) || !["en", "arz"].includes(String(s.language))
      || typeof s.message !== "string" || !s.message.trim() || s.message.length > 4000 || !validDate(s.date) || typeof s.city !== "string" || !s.city.trim() || s.city.length > 100 || !record(s.expect)) throw new Error("Invalid scenario.");
    if (s.reference_date !== undefined && !validDate(s.reference_date)) throw new Error("Invalid reference date.");
    if (s.fixture !== undefined && !["gap", "recent", "cold", "rain", "mixed", "while"].includes(String(s.fixture))) throw new Error("Invalid fixture profile.");
    validateIntent(s.intent_labels);
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
  if (scenario.id.startsWith("conversation-")) {
    const expectedCard = scenario.intent_labels?.intent_kind === "follow_up", look = record(data.structured) ? data.structured : {}, labels = intentChecks(scenario, evaluation.intent), firstLabels = intentChecks(scenario, evaluation.first_intent);
    const kind = labels.find(c => c.id === "intent_kind")?.status === "PASS";
    const cardOk = expectedCard ? cards.length === 1 && record(data.structured) : cards.length === 0 && !record(data.structured);
    const reasonOk = !expectedCard || typeof look.reason === "string" && !!look.reason.trim() && !/\b(formality|requirements?|ranges?|filters?|scores?)\b/i.test(look.reason);
    const excludes = !expectedCard || !!scenario.previous && [look.top_id, look.bottom_id, look.outer_id].every(id => id === null || !scenario.previous!.ids.includes(String(id)));
    const beforeWarmth = wardrobe.items.filter(i => scenario.previous?.ids.includes(i.id)).reduce((sum, i) => sum + i.warmth, 0);
    const afterWarmth = wardrobe.items.filter(i => [look.top_id, look.bottom_id, look.outer_id].includes(i.id)).reduce((sum, i) => sum + i.warmth, 0);
    const warmer = scenario.id !== "conversation-warmer" || afterWarmth > beforeWarmth;
    const checks: Check[] = [
      { id: "response_ok", status: httpStatus === 200 && data.status === "ok" && typeof data.message === "string" && !!data.message.trim() ? "PASS" : "FAIL", detail: "A reply is required." },
      { id: "intent_kind", status: kind ? "PASS" : "FAIL", detail: "Expected conversation class." },
      { id: "card_expected", status: cardOk ? "PASS" : "FAIL", detail: "Only recommendations and follow-ups show cards." },
      { id: "reason_plain_language", status: reasonOk ? "PASS" : "FAIL", detail: "No banned policy words in the reason." },
      { id: "warmer_follow_up", status: warmer ? "PASS" : "FAIL", detail: "Warmer follow-up must select warmer available pieces." },
      { id: "follow_up_excludes_previous", status: excludes ? "PASS" : "FAIL", detail: "A follow-up excludes the previous items." },
      { id: "no_wardrobe_for_noncard", status: expectedCard || !trace.some(c => c.name === "get_wardrobe") ? "PASS" : "FAIL", detail: "Non-card responses do not read the wardrobe." },
    ];
    const passed = checks.filter(c => c.status === "PASS").length, pass = passed === checks.length;
    return { id: scenario.id, language: scenario.language, expected_kind: scenario.intent_labels!.intent_kind, status: pass ? "PASS" : "FAIL", checks, passed_checks: passed, applicable_checks: checks.length, score: passed / checks.length, tool_calls: 0, valid_tool_calls: 0, invalid_tool_calls: 0, latency_ms: Math.round(latencyMs), http_status: httpStatus, response_status: String(data.status ?? "missing"), tool_failures: trace.filter(c => c.ok !== true).length, validation_attempts: Number(evaluation.validation_attempts ?? 0), intent_attempts: Number(evaluation.intent_attempts ?? 0), context_reads: trace.length, intent_checks: labels, first_intent_checks: firstLabels, quality_checks: checks, quality_status: pass ? "PASS" : "FAIL", first_try_pass: pass && Number(evaluation.intent_attempts) === 1 && (!expectedCard || evaluation.first_validation_pass === true), first_try_validation_pass: Number(evaluation.intent_attempts) === 1 && (!expectedCard || evaluation.first_validation_pass === true) };
  }
  const known = new Map(wardrobe.items.map(item => [item.id, item]));
  const pipelineV2 = ["v2", "v2.1"].includes(String(evaluation.pipeline));
  const attempts = trace.filter(call => call.name === "show_on_avatar");
  const groups: unknown[][] = attempts.map(call => record(call.arguments) && Array.isArray(call.arguments.item_ids) ? call.arguments.item_ids : []);
  if (pipelineV2 && record(data.structured)) groups.push([data.structured.top_id, data.structured.bottom_id, ...(data.structured.outer_id === null ? [] : [data.structured.outer_id])]);
  let validUrls = cards.length > 0;
  for (const card of cards) {
    const items = Array.isArray(card.items) ? card.items : [];
    const ids = items.map(item => record(item) ? item.id : null); groups.push(ids);
    try {
      if (typeof card.url !== "string" || !card.url.startsWith("/try-on?")) throw new Error("Invalid fitting-room URL");
      const url = new URL(card.url, "http://localhost");
      const top = url.searchParams.get("top"), bottom = url.searchParams.get("bottom");
      if (url.origin !== "http://localhost" || url.pathname !== "/try-on" || (ids.length !== 2 && !(pipelineV2 && ids.length === 3)) || top === bottom || !ids.includes(top) || !ids.includes(bottom)
        || known.get(top ?? "")?.category !== "top" || known.get(bottom ?? "")?.category !== "bottom") validUrls = false;
    } catch { validUrls = false; }
  }
  // Empty recommendations must fail: Array.every([]) is not evidence of a look.
  const nonempty = Array.isArray(data.recommendations) && data.recommendations.every(record) && cards.length > 0 && (pipelineV2 ? record(data.structured) : attempts.length > 0) && groups.every(ids => ids.length > 0);
  const exists = nonempty && groups.every(ids => ids.every(id => typeof id === "string" && known.has(id)));
  const selected = groups.flat().flatMap(id => typeof id === "string" && known.has(id) ? [known.get(id)!] : []);
  const coherent = !pipelineV2 || groups.length > 1 && groups.every(ids => ids.length === groups[0].length && ids.every(id => groups[0].includes(id)));
  const [min, max] = scenario.expect.formality_range;
  const checks: Check[] = [];
  const check = (id: string, passed: boolean, detail: string, applicable = true) => checks.push({ id, status: applicable ? passed ? "PASS" : "FAIL" : "N/A", detail });
  check("response_ok", httpStatus === 200 && data.status === "ok" && typeof data.message === "string" && !!data.message.trim(), `HTTP ${httpStatus}; status ${String(data.status ?? "missing")}`);
  check("evaluation_context", record(evaluation.context) && evaluation.context.date === (scenario.reference_date ?? scenario.date) && evaluation.context.city === scenario.city, "Trace must match the scenario reference date and city.");
  check("get_wardrobe", trace.some(call => call.name === "get_wardrobe" && call.ok === true), "Requires a successful wardrobe lookup, not just a label in prose.");
  check("get_weather", trace.some(call => call.name === "get_weather" && record(call.arguments) && call.arguments.date === scenario.date && normalCity(call.arguments.city ?? "Cairo") === normalCity(scenario.city)),
    `Requires a call for ${scenario.date} in ${scenario.city}; provider availability is recorded separately.`, scenario.expect.must_call_get_weather);
  check("recommended_items_exist", exists, "All card and attempted show_on_avatar IDs must exist in the fixture; at least one card is required.");
  check("top_bottom_categories", exists && coherent && validUrls && groups.every(ids => new Set(ids).size === ids.length && (ids.length === 2 || pipelineV2 && ids.length === 3 && ids.filter(id => known.get(String(id))?.category === "outerwear").length === 1) && ids.filter(id => known.get(String(id))?.category === "top").length === 1 && ids.filter(id => known.get(String(id))?.category === "bottom").length === 1), "Every look needs one top and one bottom, optionally outerwear in v2; structured IDs, card IDs and URL slots must agree with the saved wardrobe.");
  check("formality_range", exists && selected.every(item => item.formality >= min && item.formality <= max), `Every selected item must have formality ${min}–${max} for ${scenario.expect.occasion}.`);
  const n = scenario.expect.not_worn_days, cutoff = Date.parse(`${scenario.date}T00:00:00Z`) - (n ?? 0) * 86400000;
  check("not_worn_recently", exists && selected.every(item => item.last_worn === null || Date.parse(`${item.last_worn}T00:00:00Z`) < cutoff), `Exclude last_worn on or after ${new Date(cutoff).toISOString().slice(0, 10)} (${n ?? 0} days, inclusive boundary).`, n !== null);
  check("no_wear_mutation", Array.isArray(evaluation.trace) && !trace.some(call => call.name === "log_worn"), "Recommendation scenarios do not authorize logging wear.");
  if (evaluation.pipeline === "v2.1") check("card_expected", cards.length === 1, "A recommendation must include one card.");
  const plainReason = record(data.structured) && typeof data.structured.reason === "string" && !/\b(formality|requirements?|ranges?|filters?|scores?)\b/i.test(data.structured.reason);
  if (evaluation.pipeline === "v2.1") check("reason_plain_language", !!plainReason, "Reason avoids policy vocabulary.");
  const passed = checks.filter(c => c.status === "PASS").length, applicable = checks.filter(c => c.status !== "N/A").length;
  const validity = record(evaluation.tool_validity) ? evaluation.tool_validity : null;
  const validCalls = validity && Number.isInteger(validity.valid) ? Number(validity.valid) : trace.filter(call => typeof call.name === "string" && validToolArguments(call.name, call.arguments)).length;
  const invalidCalls = validity && Number.isInteger(validity.invalid) ? Number(validity.invalid) : trace.length - validCalls;
  const intent = intentChecks(scenario, evaluation.intent), firstIntent = intentChecks(scenario, evaluation.first_intent);
  const quality = qualityChecks(scenario, wardrobe, data);
  const first = qualityChecks(scenario, wardrobe, { structured: evaluation.first_draft, evaluation }, true);
  const qualityPassed = data.status === "ok" && httpStatus === 200 && quality.every(c => c.status !== "FAIL");
  return { id: scenario.id, language: scenario.language, status: passed === applicable ? "PASS" : "FAIL", checks, passed_checks: passed, applicable_checks: applicable,
    intent_checks: intent, first_intent_checks: firstIntent, intent_attempts: Number(evaluation.intent_attempts ?? 0), quality_checks: quality, quality_status: qualityPassed ? "PASS" : "FAIL", first_try_validation_pass: evaluation.first_validation_pass === true && (evaluation.pipeline !== "v2.1" || evaluation.intent_attempts === 1),
    first_try_pass: evaluation.first_validation_pass === true && (evaluation.pipeline !== "v2.1" || evaluation.intent_attempts === 1 && firstIntent.every(c => c.status === "PASS")) && first.every(c => c.status !== "FAIL"),
    ...(pipelineV2 ? { validation_attempts: Number(evaluation.validation_attempts ?? 0), context_reads: trace.length } : {}),
    score: passed / applicable, tool_calls: pipelineV2 ? 0 : validCalls + invalidCalls || calls.length, valid_tool_calls: validCalls, invalid_tool_calls: invalidCalls, tool_failures: trace.filter(call => call.ok !== true).length,
    latency_ms: Math.round(latencyMs), http_status: httpStatus, response_status: String(data.status ?? "missing"), ...(error ? { error } : {}) };
}
export function summarize(scores: Score[]) {
  const passedChecks = scores.reduce((n, s) => n + s.passed_checks, 0), applicableChecks = scores.reduce((n, s) => n + s.applicable_checks, 0);
  const valid = scores.reduce((n, s) => n + s.valid_tool_calls, 0), invalid = scores.reduce((n, s) => n + s.invalid_tool_calls, 0);
  const failures = Object.fromEntries([...new Set(scores.flatMap(s => s.checks.map(c => c.id)))].map(id => [id, scores.filter(s => s.checks.some(c => c.id === id && c.status === "FAIL")).length]));
  const qualityFailures = Object.fromEntries([...new Set(scores.flatMap(s => (s.quality_checks ?? []).map(c => c.id)))].map(id => [id, scores.filter(s => s.quality_checks?.some(c => c.id === id && c.status === "FAIL")).length]));
  const cohort = (group: Score[]) => ({ scenarios: group.length, old_checks_passed: group.filter(s => s.status === "PASS").length, quality_passed: group.filter(s => s.quality_status === "PASS").length, first_try_passed: group.filter(s => s.first_try_pass).length });
  const fields = [...new Set(scores.flatMap(s => s.intent_checks?.map(c => c.id) ?? []))];
  const kindGroups = [...new Set(scores.map(s => s.expected_kind ?? "recommend"))];
  return { intent_kind_by_class: Object.fromEntries(kindGroups.map(kind => { const group = scores.filter(s => (s.expected_kind ?? "recommend") === kind); return [kind, { correct: group.filter(s => s.intent_checks?.some(c => c.id === "intent_kind" && c.status === "PASS")).length, total: group.length }]; })), intent_accuracy: Object.fromEntries(fields.map(id => [id, { correct: scores.filter(s => s.intent_checks?.some(c => c.id === id && c.status === "PASS")).length, first_try_correct: scores.filter(s => s.first_intent_checks?.some(c => c.id === id && c.status === "PASS")).length, total: scores.length }])),
    intent_all_fields_passed: scores.filter(s => s.intent_checks?.length && s.intent_checks.every(c => c.status === "PASS")).length,
    scenarios: scores.length, passed_scenarios: scores.filter(s => s.status === "PASS").length, failed_scenarios: scores.filter(s => s.status === "FAIL").length,
    quality_passed_scenarios: scores.filter(s => s.quality_status === "PASS").length, quality_failures_by_category: qualityFailures,
    first_try_passed_scenarios: scores.filter(s => s.first_try_pass).length, first_try_validation_passed_scenarios: scores.filter(s => s.first_try_validation_pass).length,
    retry_count: scores.reduce((n, s) => n + Math.max(0, (s.validation_attempts ?? 0) - 1) + Math.max(0, (s.intent_attempts ?? 0) - 1), 0),
    cohorts: { legacy: cohort(scores.filter(s => !s.id.startsWith("hard-"))), hard: cohort(scores.filter(s => s.id.startsWith("hard-"))) },
    retried_scenarios: scores.filter(s => (s.validation_attempts ?? 0) > 1 || (s.intent_attempts ?? 0) > 1).length,
    average_context_reads: scores.length ? scores.reduce((n, s) => n + (s.context_reads ?? 0), 0) / scores.length : 0,
    valid_tool_calls: valid, invalid_tool_calls: invalid, tool_call_validity: valid + invalid ? valid / (valid + invalid) : null, failures_by_category: failures,
    passed_checks: passedChecks, applicable_checks: applicableChecks, overall_score: applicableChecks ? passedChecks / applicableChecks : 0,
    average_tool_calls: scores.length ? scores.reduce((n, s) => n + s.tool_calls, 0) / scores.length : 0,
    average_latency_ms: scores.length ? scores.reduce((n, s) => n + s.latency_ms, 0) / scores.length : 0 };
}
