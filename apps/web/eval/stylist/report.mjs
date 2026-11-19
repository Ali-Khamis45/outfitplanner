import { summarize } from "./scoring.ts";

export function makeReport(metadata, results) {
  return { version: 2, ...metadata, status_only: true, summary: summarize(results.map(result => result.score)), results: results.map(result => {
    const { error, checks, quality_checks, intent_checks, first_intent_checks, ...score } = result.score;
    return { score: { ...score, intent_checks: intent_checks?.map(({id,status})=>({id,status})), first_intent_checks: first_intent_checks?.map(({id,status})=>({id,status})), quality_checks: quality_checks?.map(({ id, status }) => ({ id, status })), request_error: !!error, checks: checks.map(({ id, status }) => ({ id, status })) }, ...(result.wardrobe_sha256 ? { wardrobe_sha256: result.wardrobe_sha256 } : {}) };
  }) };
}
const cell = value => String(value).replaceAll("|", "\\|").replace(/[\r\n]+/g, " ");
export function markdownReport(report) {
  const summary = report.summary;
  const lines = ["# Stylist evaluation", "", `Mode: **${report.mode}**. ${report.mode === "mock" ? "Scripted harness verification only; not a model-quality result." : "Local model evaluation against the synthetic wardrobe."}`,
    `Model: ${cell(report.model ?? "not configured")}. Thinking: ${cell(report.thinking ?? "off")}. Fixture: ${report.fixture_version}.`, "",
    `Scenarios passed: **${summary.passed_scenarios}/${summary.scenarios}**. Overall check score: **${(summary.overall_score * 100).toFixed(1)}%** (${summary.passed_checks}/${summary.applicable_checks}; N/A excluded).`,
    `Average tool calls: **${summary.average_tool_calls.toFixed(2)}**. Average latency: **${(summary.average_latency_ms / 1000).toFixed(2)} s** (HTTP chat round-trip, excludes server startup).`, "",
    `Tool-call validity: **${summary.tool_call_validity === null ? "N/A" : (summary.tool_call_validity * 100).toFixed(1) + "%"}** (${summary.valid_tool_calls} valid; ${summary.invalid_tool_calls} invalid). Advertised tool name, envelope and argument schema; provider failures are separate.`, "",
    "| Scenario | Language | Result | Checks | Tools | Latency (s) | Failed checks |", "| --- | --- | --- | --- | --- | --- | --- |"];
  for (const result of report.results) {
    const s = result.score;
    lines.push(`| ${cell(s.id)} | ${s.language} | ${s.status} | ${s.passed_checks}/${s.applicable_checks} | ${s.tool_calls} | ${(s.latency_ms / 1000).toFixed(2)} | ${s.checks.filter(check => check.status === "FAIL").map(check => cell(check.id)).join(", ") || "—"} |`);
  }
  if (report.pipeline === "v2") lines.push("", `Server context reads: **${summary.average_context_reads.toFixed(2)}** per scenario. Scenarios using the single validation retry: **${summary.retried_scenarios}**. Model tool calls are disabled; tool-call validity is N/A, not 100%.`, "",
    "| Metric | qwen3.5:4b v1 baseline | This v2 run |", "| --- | --- | --- |",
    `| Scenarios passed | 1/30 (3.3%) | ${summary.passed_scenarios}/${summary.scenarios} (${(100 * summary.passed_scenarios / Math.max(1, summary.scenarios)).toFixed(1)}%) |`,
    `| Applicable checks passed | 129/245 (52.7%) | ${summary.passed_checks}/${summary.applicable_checks} (${(100 * summary.overall_score).toFixed(1)}%) |`,
    `| Model tool-call validity | 55/82 (67.1%) | N/A (no model tools) |`,
    `| Average scenario latency | 6.30 s | ${(summary.average_latency_ms / 1000).toFixed(2)} s |`,
    `| Item-existence failures | 29/30 | ${summary.failures_by_category.recommended_items_exist ?? 0}/${summary.scenarios} |`, "",
    "The scenario messages, fixture and nine scoring categories are unchanged. In v2, server context reads satisfy read checks and a structured recommendation replaces the show_on_avatar tool prerequisite. Rejected drafts never become recommendations; their retry count is reported separately. This compares complete pipelines, not isolated model quality.");
  if (["v2-quality", "v2.1"].includes(report.pipeline)) lines.push("", "## Quality checks", "",
    `Quality passed: **${summary.quality_passed_scenarios}/${summary.scenarios}**. First-try quality passed: **${summary.first_try_passed_scenarios}/${summary.scenarios}**. First-try server validation: **${summary.first_try_validation_passed_scenarios}/${summary.scenarios}**. Retries: **${summary.retry_count}**.`, "",
    "| Cohort | Old checks passed | New quality passed | First-try quality passed |", "| --- | --- | --- | --- |",
    "| Prior v2 qwen3.5 baseline (30) | 30/30 | Not measured | Not measured |",
    "| Prior v2 follow-up (40) | 38/40 | 35/40 (independent checks) | 30/40 |",
    ...Object.entries(summary.cohorts).map(([name, c]) => `| ${name} | ${c.old_checks_passed}/${c.scenarios} | ${c.quality_passed}/${c.scenarios} | ${c.first_try_passed}/${c.scenarios} |`), "",
    "| Scenario | Old checks | Quality | First try | Retries | Quality failures |", "| --- | --- | --- | --- | --- | --- |",
    ...report.results.map(({ score: s }) => `| ${s.id} | ${s.status} | ${s.quality_status} | ${s.first_try_pass ? "PASS" : "FAIL"} | ${Math.max(0, (s.validation_attempts ?? 0) - 1) + Math.max(0, (s.intent_attempts ?? 0) - 1)} | ${s.quality_checks.filter(c => c.status === "FAIL").map(c => c.id).join(", ") || "None"} |`), "",
    "| Quality failure category | Scenarios |", "| --- | --- |", ...Object.entries(summary.quality_failures_by_category).map(([id, count]) => `| ${id} | ${count} |`));
  if (report.pipeline === "v2.1") lines.push("", "## Main model metric: intent extraction", "",
    "| Intent field | Correct | First attempt correct |", "| --- | --- | --- |",
    ...Object.entries(summary.intent_accuracy).map(([id, c]) => `| ${id} | ${c.correct}/${c.total} | ${c.first_try_correct}/${c.total} |`), "",
    "Formality and warmth now share server filter/scoring rules and are guaranteed for a published answer relative to the extracted intent. They are not evidence of model reasoning. The previous 35/40 used independent selection scoring. Intent labels never enter prompts; an incorrect intent is reported even when all filtered choices pass.");
  lines.push("", "| Failure category | Scenarios |", "| --- | --- |", ...Object.entries(summary.failures_by_category).map(([category, count]) => `| ${cell(category)} | ${count} |`), "",
    "Status-only report: no prompts, model prose, reasoning fields, tool arguments, photos or personal fit values. Scoring checks structured tool traces and recommendations in memory, not prose quality. A correct weather call is scored independently of provider availability. Legacy v1 action attempts all count; v2 scores published recommendations and reports validation retries separately. Missing recommendations fail.", "");
  return lines.join("\n");
}
