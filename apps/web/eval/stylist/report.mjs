import { summarize } from "./scoring.ts";

export function makeReport(metadata, results) {
  return { version: 1, ...metadata, summary: summarize(results.map(result => result.score)), results };
}
const cell = value => String(value).replaceAll("|", "\\|").replace(/[\r\n]+/g, " ");
export function markdownReport(report) {
  const summary = report.summary;
  const lines = ["# Stylist evaluation", "", `Mode: **${report.mode}**. ${report.mode === "mock" ? "Scripted harness verification only; not a model-quality result." : "Local model evaluation against the synthetic wardrobe."}`,
    `Model: ${cell(report.model ?? "not configured")}. Fixture: ${report.fixture_version}.`, "",
    `Scenarios passed: **${summary.passed_scenarios}/${summary.scenarios}**. Overall check score: **${(summary.overall_score * 100).toFixed(1)}%** (${summary.passed_checks}/${summary.applicable_checks}; N/A excluded).`,
    `Average tool calls: **${summary.average_tool_calls.toFixed(2)}**. Average latency: **${(summary.average_latency_ms / 1000).toFixed(2)} s** (HTTP chat round-trip, excludes server startup).`, "",
    "| Scenario | Language | Result | Checks | Tools | Latency (s) | Failed checks |", "| --- | --- | --- | --- | --- | --- | --- |"];
  for (const result of report.results) {
    const s = result.score;
    lines.push(`| ${cell(s.id)} | ${s.language} | ${s.status} | ${s.passed_checks}/${s.applicable_checks} | ${s.tool_calls} | ${(s.latency_ms / 1000).toFixed(2)} | ${s.checks.filter(check => check.status === "FAIL").map(check => cell(check.id)).join(", ") || "—"} |`);
  }
  lines.push("", "Scoring checks structured tool traces and recommendations, not prose quality or unstructured item mentions. A correct weather call is scored independently of provider availability; see tool_failures and traces in JSON. All recommendation attempts count, including rejected IDs. No recommendation is a failure, not a vacuous pass.", "");
  return lines.join("\n");
}
