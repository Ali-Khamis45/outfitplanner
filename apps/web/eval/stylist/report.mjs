import { summarize } from "./scoring.ts";

export function makeReport(metadata, results) {
  return { version: 2, ...metadata, status_only: true, summary: summarize(results.map(result => result.score)), results: results.map(result => {
    const { error, checks, ...score } = result.score;
    return { score: { ...score, request_error: !!error, checks: checks.map(({ id, status }) => ({ id, status })) }, ...(result.wardrobe_sha256 ? { wardrobe_sha256: result.wardrobe_sha256 } : {}) };
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
  lines.push("", "| Failure category | Scenarios |", "| --- | --- |", ...Object.entries(summary.failures_by_category).map(([category, count]) => `| ${cell(category)} | ${count} |`), "",
    "Status-only report: no prompts, model prose, reasoning fields, tool arguments, photos or personal fit values. Scoring checks structured tool traces and recommendations in memory, not prose quality. A correct weather call is scored independently of provider availability. All recommendation attempts count, including rejected IDs. No recommendation is a failure.", "");
  return lines.join("\n");
}
