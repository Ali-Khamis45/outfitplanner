import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { scenarioWardrobe, FIXTURE_VERSION } from "./fixture.ts";
import { parseScenarios, scoreScenario } from "./scoring.ts";
import { makeReport, markdownReport } from "./report.mjs";
import { startEvaluationModel } from "./mock.mjs";
import { BASE_URL, requireFreePort, startServer } from "./server.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url)), app = path.resolve(directory, "../..");
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: node apps/web/eval/stylist/run.mjs [--mock]\nRuns all 40 scenarios through an owned development server on port 3100.\nReal mode uses apps/web/.env.local and live weather; --mock uses scripted local model + weather.\nReports: apps/web/eval/stylist/results/<run-id>/report.{json,md}\nExit: 0 all pass; 1 scenario checks fail; 2 harness/infrastructure error; 130 interrupted.");
} else {
  if (args.some(arg => arg !== "--mock") || new Set(args).size !== args.length) { console.error("Unknown or duplicate argument. Use --help."); process.exitCode = 2; }
  else await main(args.includes("--mock"));
}

async function main(mock) {
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);
  let runtime, server, model, reportDirectory;
  const logs = [], results = [];
  try {
    await requireFreePort(); // Never connect to or stop an existing server.
    const legacyText = await readFile(path.join(directory, "scenarios.json"), "utf8"), hardText = await readFile(path.join(directory, "hard-scenarios.json"), "utf8");
    const scenarioText = legacyText + hardText, scenarios = parseScenarios([...JSON.parse(legacyText), ...JSON.parse(hardText)]);
    // Match Next's .env.local loading and precedence, independent of CLI cwd.
    nextEnv.loadEnvConfig(app, true);
    const startedAt = new Date().toISOString(), runId = startedAt.replace(/[:.]/g, "-") + "-" + randomUUID().slice(0, 8);
    reportDirectory = path.join(directory, "results", runId); await mkdir(reportDirectory, { recursive: true });
    runtime = await mkdtemp(path.join(os.tmpdir(), "stylist-eval-"));
    const outputs = path.join(runtime, "outputs"), wardrobeFile = path.join(outputs, "wardrobe/wardrobe.json"), marker = `eval-${randomUUID()}`;
    await mkdir(path.dirname(wardrobeFile), { recursive: true });
    const markerOutfit = { id: marker, name: "Evaluation server marker", items: [], occasion: "", worn_on: [] };
    await writeFile(wardrobeFile, JSON.stringify({ ...scenarioWardrobe(scenarios[0]), outfits: [markerOutfit] }));
    if (mock) model = await startEvaluationModel(scenarios);
    const env = { ...process.env, STYLIST_MODEL: process.env.STYLIST_MODEL || "qwen3.5:4b", NEXT_DIST_DIR: ".next-sprint-6d-eval", NEXT_TELEMETRY_DISABLED: "1", LOCAL_WARDROBE_OUTPUTS_DIR: outputs, STYLIST_EVAL: "1", STYLIST_EVAL_MOCK: mock ? "1" : "0",
      ...(mock ? { STYLIST_BASE_URL: model.baseUrl, STYLIST_MODEL: "scripted-eval-model" } : {}) };
    let revision = "unknown", sourceDirty = null;
    try {
      const gitOptions = { cwd: app, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] };
      revision = execFileSync("git", ["rev-parse", "HEAD"], gitOptions).trim();
      sourceDirty = !!execFileSync("git", ["status", "--porcelain", "--", "."], gitOptions).trim();
    } catch {}
    server = startServer(app, env, message => { logs.push(message); if (logs.length > 500) logs.shift(); });
    await server.ready(marker, controller.signal);
    const warmStarted = performance.now();
    const warm = await fetch(BASE_URL + "/api/stylist/chat?warmup=1", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(185000)]) });
    await warm.arrayBuffer();
    const warmupMs = Math.round(performance.now() - warmStarted);
    const metadata = { run_id: runId, started_at: startedAt, mode: mock ? "mock" : "local-model", model: env.STYLIST_MODEL?.trim() || null,
      pipeline: "v2-quality", keep_alive: env.STYLIST_KEEP_ALIVE || "30m", legacy_scenarios_sha256: createHash("sha256").update(legacyText).digest("hex"), thinking: env.STYLIST_THINKING?.trim().toLowerCase() || "off", reasoning_effort: env.STYLIST_THINKING?.trim().toLowerCase() === "on" ? "model-default" : "none",
      warmup_status: warm.status, warmup_ms: warmupMs,
      weather: mock ? "synthetic fixture" : "live Open-Meteo for legacy cohort; controlled synthetic forecasts for hard scenarios", fixture_version: FIXTURE_VERSION,
      scenarios_sha256: createHash("sha256").update(scenarioText).digest("hex"), source_revision: revision, source_dirty: sourceDirty, endpoint: BASE_URL + "/api/stylist/chat" };
    console.log(`${mock ? "MOCK harness verification" : "LOCAL MODEL evaluation"}: ${scenarios.length} scenarios on ${BASE_URL}.`);
    for (const scenario of scenarios) {
      if (controller.signal.aborted) break;
      const wardrobe = scenarioWardrobe(scenario);
      await writeFile(wardrobeFile, JSON.stringify({ ...wardrobe, outfits: [markerOutfit] }));
      let responseBody = null, status = 0, error;
      const started = performance.now();
      try {
        const response = await fetch(BASE_URL + "/api/stylist/chat", { method: "POST", redirect: "error", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(195000)]),
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context: { date: scenario.reference_date ?? scenario.date, city: scenario.city, ...(scenario.forecast ? { forecast: scenario.forecast } : {}) }, messages: [{ role: "user", content: scenario.message }] }) });
        status = response.status; responseBody = await response.json();
      } catch (failure) { error = failure instanceof Error ? failure.message : "Request failed"; }
      const score = scoreScenario(scenario, wardrobe, responseBody, status, performance.now() - started, error);
      results.push({ scenario, score, response: responseBody, wardrobe_sha256: createHash("sha256").update(JSON.stringify(wardrobe)).digest("hex") });
      console.log(`OLD ${score.status} / QUALITY ${score.quality_status} / FIRST ${score.first_try_pass} ${scenario.id}: ${score.passed_checks}/${score.applicable_checks}; ${score.tool_calls} tools; ${score.latency_ms} ms`);
      // Checkpoint after every scenario so an interrupted or long run is useful.
      const report = makeReport({ ...metadata, completed: results.length === scenarios.length, finished_at: new Date().toISOString() }, results);
      await writeFile(path.join(reportDirectory, "report.json"), JSON.stringify(report, null, 2) + "\n");
      await writeFile(path.join(reportDirectory, "report.md"), markdownReport(report));
    }
    const report = makeReport(metadata, results);
    console.log(`Quality ${report.summary.quality_passed_scenarios}/${scenarios.length}; first-try quality ${report.summary.first_try_passed_scenarios}/${scenarios.length}; first-try validation ${report.summary.first_try_validation_passed_scenarios}/${scenarios.length}; retries ${report.summary.retry_count}.`);
    console.log(`Overall ${(report.summary.overall_score * 100).toFixed(1)}%; ${report.summary.passed_scenarios}/${scenarios.length} scenarios; average ${report.summary.average_tool_calls.toFixed(2)} tools, ${(report.summary.average_latency_ms / 1000).toFixed(2)} s.\nReports: ${reportDirectory}`);
    process.exitCode = controller.signal.aborted ? 130 : report.summary.quality_passed_scenarios < scenarios.length ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    if (reportDirectory) await writeFile(path.join(reportDirectory, "harness-error.txt"), String(error) + "\n");
    process.exitCode = controller.signal.aborted ? 130 : 2;
  } finally {
    let stopped = true;
    try { await server?.stop(); } catch (error) {
      stopped = false; console.error(String(error)); process.exitCode = 2;
      if (reportDirectory) await writeFile(path.join(reportDirectory, "harness-error.txt"), `${String(error)}\nRuntime preserved: ${runtime}\n`);
    }
    await model?.close();
    if (reportDirectory) await writeFile(path.join(reportDirectory, "server.log"), logs.join(""));
    // Only our mkdtemp directory, resolved and checked inside the temporary root.
    if (stopped && runtime && path.dirname(path.resolve(runtime)) === path.resolve(os.tmpdir()) && path.basename(runtime).startsWith("stylist-eval-")) await rm(runtime, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt);
  }
}
