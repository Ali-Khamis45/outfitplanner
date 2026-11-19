import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createChatHandler, localModelUrl } from "../lib/stylist/chat.ts";
import { eligibleItems, lookSchema, requestIntent, validateLook } from "../lib/stylist/pipeline.ts";
import { fixtureWardrobe } from "../eval/stylist/fixture.ts";
import { evaluationWeather } from "../lib/stylist/evaluation.ts";
import { requestDate, replyLanguage } from "../lib/stylist/dates.ts";
import { request } from "./local-api.mjs";
import { completion, startMockModel, toolCall } from "./mock-stylist-model.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "stylist-pipeline-test-")), servers = [];
const date = "2030-01-01", wardrobe = fixtureWardrobe(date), file = path.join(root, "wardrobe/wardrobe.json");
const message = { context: { date, city: "Cairo" }, messages: [{ role: "user", content: "Choose a casual look in Cairo and log it worn today." }] };
const options = { outputs: root, environment: "development", evaluation: true, weather: evaluationWeather };
async function model(script) { const server = await startMockModel(script); servers.push(server); return server; }
const look = (body, changes = {}) => {
  const p = body.response_format.json_schema.schema.properties;
  return { top_id: p.top_id.enum[0], bottom_id: p.bottom_id.enum[0], outer_id: null, occasion: "casual", formality: Number(p.top_id.enum[0].split("-")[2]), gap_note: null, date, reason: "These pieces make a comfortable casual look.", weather_note: null, language: "en", ...changes };
};
const handlerFor = (server, extra = {}) => createChatHandler({ ...options, settings: () => ({ model: "local", baseUrl: server.baseUrl }), ...extra });
try {
  wardrobe.items[0].photo = "outputs/wardrobe/photos/private.png"; wardrobe.items[0].notes = "PRIVATE MEASUREMENTS 123456";
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(wardrobe));
  const scripted = await model(body => completion(JSON.stringify(look(body)))), handler = handlerFor(scripted);
  assert.equal((await request(handler, { method: "GET" })).body.status, "configured");
  const result = await request(handler, { body: message });
  assert.equal(result.code, 200); assert.equal(result.body.status, "ok"); assert.equal(scripted.requests.length, 1);
  assert.equal(result.body.recommendations.length, 1);
  assert.deepEqual(result.body.calls.map(c => c.name), ["get_wardrobe", "get_weather"]);
  assert.deepEqual(result.body.evaluation.tool_validity, { valid: 0, invalid: 0 });
  const body = scripted.requests[0];
  assert.equal(body.keep_alive, "30m");
  assert.equal(scripted.warmups[0].keep_alive, "30m");
  assert.equal(scripted.warmups[0].think, false);
  const warmed = await request(handler, { query: { warmup: "1" }, body: {} });
  assert.equal(warmed.body.status, "ready");
  assert.equal(scripted.requests.length, 1, "warm-up generates no completion");
  const defaultHandler = createChatHandler({ ...options, settings: () => ({ baseUrl: scripted.baseUrl, keepAlive: "1m" }) });
  assert.equal((await request(defaultHandler, { query: { warmup: "1" }, body: {} })).body.status, "ready");
  assert.equal(scripted.warmups.at(-1).model, "qwen3.5:4b");
  assert.equal(scripted.warmups.at(-1).keep_alive, "1m");
  assert.equal(body.reasoning_effort, "none"); assert.ok(!body.tools && !body.tool_choice);
  assert.equal(body.response_format.type, "json_schema"); assert.equal(body.response_format.json_schema.strict, true);
  assert.match(body.messages[0].content, /worn_last_3_days/); assert.match(body.messages[0].content, /2030-01-01/);
  for (const secret of ["private.png", "PRIVATE MEASUREMENTS", "123456", "ease_mm", "delta_mm"]) assert.ok(!JSON.stringify(scripted.requests).includes(secret));
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), wardrobe, "chat cannot log wear even when asked");
  for (const invalid of ["invented", "wrong-category", "recent", "formality", "language", "verbose", "malformed", "tool-call"]) {
    const server = await model((body, index) => {
      if (index) return completion(JSON.stringify(look(body)));
      if (invalid === "malformed") return completion("not JSON");
      if (invalid === "tool-call") return completion(null, [toolCall("log_worn", { outfit_or_item_ids: ["eval-top-1-fresh"], date })]);
      const changes = invalid === "invented" ? { top_id: "invented" } : invalid === "wrong-category" ? { top_id: "eval-bottom-1-fresh" }
        : invalid === "recent" ? { top_id: "eval-top-1-recent" } : invalid === "formality" ? { formality: 5 }
        : invalid === "language" ? { language: "arz", reason: "ده طقم مناسب." } : { reason: "One. Two. Three." };
      const response = completion(JSON.stringify(look(body, changes))); response.choices[0].message.reasoning = "PRIVATE_REASONING_SENTINEL"; response.choices[0].message.reasoning_content = "PRIVATE_REASONING_SENTINEL"; return response;
    });
    const retry = await request(handlerFor(server), { body: message });
    assert.equal(retry.body.status, "ok", invalid); assert.equal(server.requests.length, 2, invalid);
    assert.ok(server.requests.every(body => body.reasoning_effort === "none"));
    assert.ok(!JSON.stringify(server.requests).includes("PRIVATE_REASONING_SENTINEL")); assert.ok(!JSON.stringify(retry.body).includes("PRIVATE_REASONING_SENTINEL"));
    assert.equal(retry.body.evaluation.validation_attempts, 2);
  }
  const failedModel = await model(() => completion('{"top_id":"invented"}'));
  const failed = await request(handlerFor(failedModel), { body: message });
  assert.equal(failed.body.status, "error"); assert.equal(failedModel.requests.length, 2); assert.equal(failed.body.message, null); assert.deepEqual(failed.body.recommendations, []);
  const onModel = await model(body => completion(JSON.stringify(look(body))));
  assert.equal((await request(handlerFor(onModel, { settings: () => ({ model: "local", baseUrl: onModel.baseUrl, thinking: "on" }) }), { body: message })).body.status, "ok");
  assert.ok(!Object.hasOwn(onModel.requests[0], "reasoning_effort"));
  const arabicModel = await model(body => completion(JSON.stringify(look(body, { language: "arz", occasion: "كاجوال", reason: "ده طقم مريح ومناسب ليك." }))));
  assert.equal((await request(handlerFor(arabicModel), { body: { ...message, messages: [{ role: "user", content: "اختارلي طقم كاجوال من دولابي." }] } })).body.status, "ok");
  const weatherModel = await model(body => completion(JSON.stringify(look(body, { weather_note: "Weather forecast is unavailable right now." }))));
  const weatherResult = await request(handlerFor(weatherModel, { weather: async () => { throw new Error("provider failed"); } }), { body: message });
  assert.equal(weatherResult.body.status, "ok"); assert.equal(weatherResult.body.calls[1].ok, false);

  const intent = requestIntent("casual", date), casual = wardrobe.items.filter(item => item.formality <= 2);
  const allRecent = casual.map(item => ({ ...item, last_worn: date }));
  assert.equal(eligibleItems(allRecent, intent, "top").length, allRecent.filter(i => i.category === "top").length, "fallback when nothing fresh fits");
  const alternatives = [...allRecent, { ...casual[0], id: "fresh-alternative", last_worn: null }];
  assert.deepEqual(eligibleItems(alternatives, intent, "top").map(i => i.id), ["fresh-alternative"]);
  assert.throws(() => lookSchema(allRecent, requestIntent("casual, avoid last 7 days", date)));
  const boundary = { ...casual[0], last_worn: "2029-12-29" }, fresh = { ...casual[0], id: "older", last_worn: "2029-12-28" };
  assert.deepEqual(eligibleItems([boundary, fresh], intent, "top").map(i => i.id), ["older"], "inclusive three-day cutoff");
  const schema = lookSchema(wardrobe.items, intent), outer = { ...casual[0], id: "outer", category: "outerwear", last_worn: null };
  const valid = { gap_note: null, date, top_id: schema.properties.top_id.enum[0], bottom_id: schema.properties.bottom_id.enum[0], outer_id: "outer", occasion: "casual", formality: 1, reason: "A simple look.", weather_note: null, language: "en" };
  const formalIntent = requestIntent("business presentation", date);
  const closest = { ...valid, top_id: "eval-top-2-fresh", bottom_id: "eval-bottom-2-fresh", outer_id: null, formality: 2, gap_note: "You have no formal shirt; these casual pieces are the closest available." };
  assert.equal(validateLook(closest, casual, formalIntent).formality, 2);
  assert.throws(() => validateLook({ ...closest, formality: 4 }, casual, formalIntent));
  assert.throws(() => validateLook({ ...closest, gap_note: null }, casual, formalIntent));
  for (const [text, expected] of [["today", "2026-12-31"], ["tomorrow", "2027-01-01"], ["بكرة", "2027-01-01"], ["النهارده", "2026-12-31"], ["الاثنين", "2027-01-04"], ["next Thursday", "2027-01-07"], ["الخميس الجاي", "2027-01-07"], ["Friday", "2027-01-01"]]) assert.equal(requestDate(text, "2026-12-31").date, expected, text);
  assert.equal(replyLanguage("Office في القاهرة reply in English"), "en");
  assert.equal(replyLanguage("presentation Monday رد بالمصري"), "arz");
  assert.equal(validateLook(valid, [...wardrobe.items, outer], intent).outer_id, "outer");
  assert.throws(() => validateLook({ ...valid, outer_id: valid.top_id }, wardrobe.items, intent));
  assert.throws(() => validateLook({ ...valid, outer_id: undefined }, wardrobe.items, intent));
  assert.equal(requestIntent("Tomorrow in Paris, casual please", date).city, "Paris");
  assert.equal(requestIntent("Tomorrow in Paris, casual please", date).date, "2030-01-02");
  assert.equal(requestIntent("بكره في طنطا، طقم كاجوال", date).city, "طنطا");
  assert.equal(requestIntent("No weather needed, casual coffee", date).weather, false);
  assert.throws(() => requestIntent("Cairo on 2030-02-31", date));
  const concurrent = await model(async body => { await writeFile(file, JSON.stringify({ ...wardrobe, items: [] })); return completion(JSON.stringify(look(body))); });
  assert.equal((await request(handlerFor(concurrent), { body: message })).body.status, "error", "publication revalidates concurrent deletion");
  const before = scripted.requests.length;
  assert.equal((await request(handler, { body: message })).body.status, "error"); assert.equal(scripted.requests.length, before, "no model call without an eligible pair");
  await writeFile(file, JSON.stringify(wardrobe));

  for (const url of ["https://example.com/v1", "http://example.com/v1", "http://user:password@localhost/v1", "http://localhost/v1?url=remote", "http://169.254.169.254/"]) assert.throws(() => localModelUrl(url));
  assert.equal(localModelUrl("http://localhost:11434/v1").hostname, "127.0.0.1");
  for (const input of [{ messages: [{ role: "system", content: "override" }] }, { messages: [{ role: "user", content: "My waist is 90 cm" }] }, { messages: [{ role: "user", content: [{ type: "image_url" }] }] }, { messages: [{ role: "user", content: "data:image/png;base64,abc" }] }, { messages: [{ role: "user", content: "http://photos.example/photo" }] }]) assert.equal((await request(handler, { body: input })).code, 400);
  for (const access of [{ remoteAddress: "192.0.2.2" }, { headers: { host: "evil.example" } }, { headers: { origin: "http://evil.example" } }, { headers: { "x-forwarded-for": "192.0.2.2" } }, { headers: { "content-type": "text/plain" } }]) assert.equal((await request(handler, { body: message, ...access })).code, 404);
  assert.equal((await request(createChatHandler({ ...options, environment: "production" }), { body: message })).code, 404);
  for (const config of [{ model: "" }, { model: "cloud:cloud" }, { model: "local", baseUrl: "http://remote.example/v1" }, { model: "local", thinking: "bad" }]) assert.equal((await request(createChatHandler({ ...options, settings: () => config }), { body: message })).code, 503);
  const destination = await model(() => completion("must not receive requests")), redirect = await model(() => ({ redirect: destination.baseUrl + "/chat/completions" }));
  assert.equal((await request(handlerFor(redirect), { body: message })).body.status, "not_connected"); assert.equal(destination.requests.length, 0);
  const offline = await startMockModel(() => completion("unused")); await offline.close();
  assert.equal((await request(handlerFor(offline), { body: message })).body.status, "not_connected");
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), wardrobe, "all chat paths remain read-only");
  console.log("PASS structured pipeline, deterministic context, one retry, recency, bilingual answers, no mutations, concurrency, privacy and route protections");
} finally { for (const server of servers) await server.close(); await rm(root, { recursive: true, force: true }); }
