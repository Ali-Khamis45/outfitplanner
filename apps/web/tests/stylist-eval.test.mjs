import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseScenarios, scoreScenario, summarize } from "../eval/stylist/scoring.ts";
import { fixtureWardrobe, scenarioWardrobe } from "../eval/stylist/fixture.ts";
import { makeReport, markdownReport } from "../eval/stylist/report.mjs";
import { startEvaluationModel } from "../eval/stylist/mock.mjs";
import { createChatHandler } from "../lib/stylist/chat.ts";
import { evaluationWeather } from "../lib/stylist/evaluation.ts";
import { request } from "./local-api.mjs";
import { startMockModel, completion } from "./mock-stylist-model.mjs";
import { validToolArguments } from "../lib/stylist/toolValidation.ts";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scenarios = parseScenarios(JSON.parse(await readFile(path.join(app, "eval/stylist/scenarios.json"), "utf8")));
assert.equal(scenarios.filter(s => s.language === "en").length, 15); assert.equal(scenarios.filter(s => s.language === "arz").length, 15);
assert.equal(scenarios.filter(s => s.expect.must_call_get_weather).length, 20);
assert.equal(scenarios.filter(s => s.expect.not_worn_days !== null).length, 15);
assert.throws(() => parseScenarios(scenarios.slice(1))); assert.throws(() => parseScenarios([...scenarios.slice(0, 29), scenarios[0]]));
assert.throws(() => parseScenarios(scenarios.map((s, i) => i ? s : { ...s, expect: { ...s.expect, formality_range: [5, 1] } })));
const scenario = scenarios.find(s => s.id === "ar-office-new"), wardrobe = fixtureWardrobe(scenario.date);
const top = "eval-top-3-fresh", bottom = "eval-bottom-3-fresh";
function response() {
  return { status: "ok", message: "A fixture recommendation.", calls: [], recommendations: [{ url: `/try-on?top=${top}&bottom=${bottom}`, items: [wardrobe.items.find(i => i.id === top), wardrobe.items.find(i => i.id === bottom)] }],
    evaluation: { context: { date: scenario.date, city: scenario.city }, trace: [{ name: "get_wardrobe", arguments: {}, ok: true }, { name: "get_weather", arguments: { date: scenario.date, city: scenario.city }, ok: true }, { name: "show_on_avatar", arguments: { item_ids: [top, bottom] }, ok: true }] } };
}
const score = (data = response(), items = wardrobe) => scoreScenario(scenario, items, data, 200, 100);
const status = (data, check) => score(data).checks.find(c => c.id === check).status;
assert.equal(score().status, "PASS"); assert.equal(score().applicable_checks, 9);
const v2 = response();
v2.evaluation.pipeline = "v2"; v2.evaluation.trace.pop(); v2.evaluation.tool_validity = { valid: 0, invalid: 0 };
v2.structured = { top_id: top, bottom_id: bottom, outer_id: null };
assert.equal(score(v2).status, "PASS", "server reads and validated JSON replace model actions");
assert.equal(score(v2).tool_calls, 0); assert.equal(summarize([score(v2)]).tool_call_validity, null);
v2.structured.top_id = "eval-top-4-fresh";
assert.equal(score(v2).checks.find(c => c.id === "top_bottom_categories").status, "FAIL", "card and structured answer must agree");
let changed = response(); changed.evaluation.trace.shift(); assert.equal(status(changed, "get_wardrobe"), "FAIL");
changed = response(); changed.evaluation.trace[1].arguments.city = "Aswan"; assert.equal(status(changed, "get_weather"), "FAIL");
changed = response(); changed.evaluation.trace[1].arguments.date = "2020-01-01"; assert.equal(status(changed, "get_weather"), "FAIL");
changed = response(); changed.evaluation.trace[1].arguments.city = "القاهرة"; changed.evaluation.trace[1].ok = false; assert.equal(status(changed, "get_weather"), "PASS", "Arabic alias and provider failure do not penalize correct tool selection");
changed = response(); changed.evaluation.trace.push({ name: "show_on_avatar", arguments: { item_ids: [top, "invented"] }, ok: false }); assert.equal(status(changed, "recommended_items_exist"), "FAIL", "invalid attempts cannot hide behind a later valid card");
changed = response(); changed.recommendations = []; assert.equal(status(changed, "recommended_items_exist"), "FAIL"); assert.equal(status(changed, "formality_range"), "FAIL"); assert.equal(status(changed, "not_worn_recently"), "FAIL");
changed = response(); changed.recommendations.push(null); assert.equal(status(changed, "recommended_items_exist"), "FAIL", "malformed extra cards cannot disappear from scoring");
changed = response(); changed.evaluation.trace[2].arguments.item_ids = [top, top]; assert.equal(status(changed, "top_bottom_categories"), "FAIL");
changed = response(); changed.recommendations[0].url = `/try-on?top=${bottom}&bottom=${top}`; assert.equal(status(changed, "top_bottom_categories"), "FAIL");
changed = response(); changed.recommendations[0].url = `https://evil.example/try-on?top=${top}&bottom=${bottom}`; assert.equal(status(changed, "top_bottom_categories"), "FAIL");
const informal = structuredClone(wardrobe); informal.items.find(i => i.id === top).formality = 1; assert.equal(score(response(), informal).checks.find(c => c.id === "formality_range").status, "FAIL");
for (const [days, expected] of [[0, "FAIL"], [2, "FAIL"], [3, "FAIL"], [4, "PASS"]]) {
  const items = structuredClone(wardrobe); items.items.find(i => i.id === top).last_worn = new Date(Date.parse(`${scenario.date}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
  assert.equal(score(response(), items).checks.find(c => c.id === "not_worn_recently").status, expected);
}
changed = response(); changed.evaluation.trace.push({ name: "log_worn", arguments: {}, ok: false }); assert.equal(status(changed, "no_wear_mutation"), "FAIL");
const disconnected = scoreScenario(scenario, wardrobe, { status: "not_connected", message: null }, 503, 50);
assert.equal(disconnected.score, 0); assert.equal(disconnected.status, "FAIL"); assert.equal(scoreScenario(scenario, wardrobe, null, 0, 20, "Timeout").score, 0);
const noWeather = scoreScenario(scenarios[0], fixtureWardrobe(scenarios[0].date), null, 503, 0); assert.equal(noWeather.checks.find(c => c.id === "get_weather").status, "N/A"); assert.equal(noWeather.applicable_checks, 7);
const summary = summarize([score(), disconnected]); assert.equal(summary.overall_score, 0.5); assert.equal(summary.average_tool_calls, 1.5); assert.equal(summary.average_latency_ms, 75);
const rendered = markdownReport(makeReport({ mode: "mock", model: "fixture", fixture_version: "v1" }, [{ score: score() }, { score: disconnected }]));
assert.match(rendered, /50.0%/); assert.match(rendered, /not a model-quality result/); assert.match(rendered, /FAIL/);
assert.equal(score().valid_tool_calls, 3);
changed = response(); changed.evaluation.trace[1].ok = false;
assert.equal(score(changed).valid_tool_calls, 3, "provider failure is not a schema-invalid tool call");
changed = response(); changed.evaluation.trace[1].arguments.date = 123;
assert.equal(score(changed).invalid_tool_calls, 1);
assert.equal(validToolArguments("get_wardrobe", { filter: { category: "invalid" } }), false);
assert.equal(validToolArguments("get_wardrobe", { filter: { formality_min: 0 } }), false);
assert.equal(validToolArguments("show_on_avatar", { item_ids: [] }), false);
assert.equal(validToolArguments("unknown", {}), false);
const safeReport = JSON.stringify(makeReport({ thinking: "off" }, [{ score: { ...score(), error: "PRIVATE_ERROR" }, scenario: { message: "PRIVATE_PROMPT" }, response: { message: "PRIVATE_REPLY", reasoning: "PRIVATE_REASONING" } }]));
for (const hidden of ["PRIVATE_ERROR", "PRIVATE_PROMPT", "PRIVATE_REPLY", "PRIVATE_REASONING"]) assert.ok(!safeReport.includes(hidden), "report is status-only");

const root = await mkdtemp(path.join(os.tmpdir(), "stylist-eval-test-")), servers = [];
try {
  await mkdir(path.join(root, "wardrobe"));
  const allScenarios = parseScenarios([...scenarios, ...JSON.parse(await readFile(path.join(app, "eval/stylist/hard-scenarios.json"), "utf8"))]);
  const model = await startEvaluationModel(allScenarios); servers.push(model);
  const handler = createChatHandler({ outputs: root, environment: "development", evaluation: true, weather: evaluationWeather, settings: () => ({ model: "eval-fixture", baseUrl: model.baseUrl }) });
  for (const s of allScenarios) {
    const fixture = scenarioWardrobe(s); await writeFile(path.join(root, "wardrobe/wardrobe.json"), JSON.stringify(fixture));
    const result = await request(handler, { body: { messages: [{ role: "user", content: s.message }], context: { date: s.reference_date ?? s.date, city: s.city, ...(s.forecast ? { forecast: s.forecast } : {}) } } });
    const evaluated = scoreScenario(s, fixture, result.body, result.code, 0);
    assert.equal(evaluated.quality_status, "PASS", s.id + JSON.stringify(evaluated.quality_checks));
    assert.equal(evaluated.first_try_pass, true, s.id);
    assert.ok(evaluated.intent_checks.every(c => c.status === "PASS"), s.id);
    const wrongIntent = structuredClone(result.body);
    wrongIntent.evaluation.intent.date = "2000-01-01";
    assert.equal(scoreScenario(s, fixture, wrongIntent, 200, 0).intent_checks.find(c => c.id === "date").status, "FAIL", "schema-valid but wrong intent must count as a model error");
    if (!s.id.startsWith("hard-")) assert.equal(evaluated.status, "PASS", s.id);
    assert.equal(result.body.evaluation.tool_validity.invalid, 0);
    const altered = structuredClone(result.body);
    altered.structured.date = "2000-01-01";
    assert.equal(scoreScenario(s, fixture, altered, 200, 0).quality_checks.find(c=>c.id==="date_handled").status,"FAIL");
    altered.structured.reason = s.language === "en" ? "\u062f\u0647 \u0637\u0642\u0645." : "English only.";
    assert.equal(scoreScenario(s, fixture, altered, 200, 0).quality_checks.find(c=>c.id==="reply_language").status,"FAIL");
    if(s.fixture === "gap") {
      altered.structured.gap_note=null;
      assert.equal(scoreScenario(s, fixture, altered, 200, 0).quality_checks.find(c=>c.id==="gap_note").status,"FAIL");
    }
    if(s.fixture === "cold") {
      altered.structured.top_id="eval-top-4-fresh"; altered.structured.outer_id=null;
      assert.equal(scoreScenario(s, fixture, altered, 200, 0).quality_checks.find(c=>c.id==="warmth_vs_forecast").status,"FAIL");
    }
    if(s.id === "en-office") {
      altered.structured.top_id="eval-top-3-fresh";
      assert.equal(scoreScenario(s, fixture, altered, 200, 0).quality_checks.find(c=>c.id==="best_available_formality").status,"FAIL");
    }

  }
  // Clock is genuinely frozen, not merely mentioned in the prompt. Old items
  // in 2030 must remain eligible even when this suite runs years earlier/later.
  const future = fixtureWardrobe("2030-01-01"); await writeFile(path.join(root, "wardrobe/wardrobe.json"), JSON.stringify(future));
  const clockModel = await startMockModel(body => {
    if(body.response_format.json_schema.name==="stylist_intent") return completion(JSON.stringify({intent_kind:"recommend",occasion_type:"everyday",formality_min:1,formality_max:5,date:"2030-01-01",indoor_outdoor:"unknown",language:"en"}));
    const p = body.response_format.json_schema.schema.properties;
    return completion(JSON.stringify({ top_id: p.top_id.enum[0], bottom_id: p.bottom_id.enum[0], outer_id: null, occasion: "casual", formality: Number(p.top_id.enum[0].split("-")[2]), gap_note: null, date: "2030-01-01", reason: "A simple look.", weather_note: null, language: "en" }));
  }); servers.push(clockModel);
  const clockHandler = createChatHandler({ outputs: root, environment: "development", evaluation: true, settings: () => ({ model: "eval-clock", baseUrl: clockModel.baseUrl }) });
  const clockBody = { context: { date: "2030-01-01", city: "Cairo" }, messages: [{ role: "user", content: "Choose something not worn in the last 7 days." }] };
  const clockResult = await request(clockHandler, { body: clockBody });
  const eligible = clockModel.requests[0].response_format.json_schema.schema.properties.top_id.enum;
  assert.ok(eligible.some(id => id.endsWith("old"))); assert.ok(!eligible.some(id => id.endsWith("recent")));
  assert.ok(!clockResult.body.evaluation.trace.some(t => t.name === "log_worn"));
  assert.deepEqual(JSON.parse(await readFile(path.join(root, "wardrobe/wardrobe.json"), "utf8")), future, "evaluation cannot mutate wear history");
  const normal = createChatHandler({ outputs: root, environment: "development", settings: () => ({ model: "eval-clock", baseUrl: clockModel.baseUrl }) });
  assert.equal((await request(normal, { body: clockBody })).code, 400, "normal app rejects eval context");
  assert.equal((await request(clockHandler, { body: { ...clockBody, context: { date: "bad", city: "Cairo" } } })).code, 400);
  assert.equal((await request(createChatHandler({ environment: "production", evaluation: true }), { body: clockBody })).code, 404);
  // Exercise the CLI occupied-port path without ever borrowing another server.
  const blocker = net.createServer();
  const ownsPort = await new Promise(resolve => { blocker.once("error", error => { if (error.code === "EADDRINUSE") resolve(false); else throw error; }); blocker.listen(3100, () => resolve(true)); });
  try {
    const exit = await new Promise((resolve, reject) => { const child = spawn(process.execPath, [path.join(app, "eval/stylist/run.mjs"), "--mock"], { cwd: os.tmpdir(), windowsHide: true, stdio: "ignore" }); child.once("error", reject); child.once("exit", resolve); });
    assert.equal(exit, 2, "CLI refuses occupied 3100, regardless of cwd");
    if (ownsPort) assert.equal(blocker.listening, true, "the pre-existing port owner survives");
  } finally { if (ownsPort) await new Promise(resolve => blocker.close(resolve)); }
  console.log("PASS 40 bilingual scenarios, mock HTTP loop, positive/negative scoring, inclusive recency, Arabic cities, reports, frozen clock, eval opt-in, read-only tools and occupied-port refusal");
} finally { for (const server of servers) await server.close(); await rm(root, { recursive: true, force: true }); }
