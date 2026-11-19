import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createChatHandler, localModelUrl, modelToolResult } from "../lib/stylist/chat.ts";
import { createToolExecutor } from "../lib/stylist/api.ts";
import { exampleWardrobe } from "../lib/wardrobe/schema.ts";
import { request } from "./local-api.mjs";
import { completion, startMockModel, toolCall } from "./mock-stylist-model.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "stylist-chat-test-"));
const servers = [];
async function model(script) { const server = await startMockModel(script); servers.push(server); return server; }
const message = { messages: [{ role: "user", content: "Choose a casual look in Cairo and log it worn today." }] };
const options = { outputs: root, environment: "development" };
try {
  const wardrobe = exampleWardrobe(); wardrobe.items[0].photo = "outputs/wardrobe/photos/private.png"; wardrobe.items[0].notes = "PRIVATE MEASUREMENTS 123456";
  await mkdir(path.join(root, "wardrobe"), { recursive: true }); await writeFile(path.join(root, "wardrobe/wardrobe.json"), JSON.stringify(wardrobe));
  await mkdir(path.join(root, "garments/sizes"), { recursive: true });
  await writeFile(path.join(root, "garments/sizes/tshirt-v5.2-M-neutral.fit.json"), JSON.stringify({ version: 1, garment: "tshirt-v5.2", size: "M", body: "neutral", regions: { chest: { status: "good", ease_mm: 123456 } }, recommended: true }));
  const weather = async () => ({ city: "Cairo", date: "2026-11-16", temperature_min_c: 18, temperature_max_c: 27, condition: "Clear" });
  const scripted = await model((body, index) => [
    completion(null, [toolCall("get_wardrobe", {})]),
    completion(null, [toolCall("get_weather", { date: "2026-11-16", city: "Cairo" }), toolCall("get_fit", { item_id: "example-1", body: "neutral" })]),
    completion(null, [toolCall("show_on_avatar", { item_ids: ["example-1", "example-3"] }), toolCall("log_worn", { outfit_or_item_ids: ["example-1", "example-3"], date: "2026-11-16" })]),
    completion("The navy tee and moss pants make a relaxed casual look."),
  ][index]);
  const settings = () => ({ model: "scripted-local", baseUrl: scripted.baseUrl });
  const handler = createChatHandler({ ...options, settings, execute: createToolExecutor(root, weather) });
  assert.equal((await request(handler, { method: "GET" })).body.status, "configured");
  const response = await request(handler, { body: message }); assert.equal(response.code, 200); assert.equal(response.body.status, "ok");
  assert.equal(scripted.requests.length, 4); assert.equal(response.body.calls.length, 5); assert.ok(response.body.calls.some(c => c.label === "Weather: Cairo"));
  assert.ok(scripted.requests.every(body => body.reasoning_effort === "none"), "thinking defaults off on every tool round and final reply");
  assert.equal(response.body.recommendations.length, 1); assert.equal(response.body.recommendations[0].items[0].photo, wardrobe.items[0].photo);
  assert.equal(response.body.recommendations[0].url, "/try-on?top=example-1&bottom=example-3"); assert.match(response.body.recommendations[0].reason, /relaxed/);
  const outbound = JSON.stringify(scripted.requests);
  for (const secret of ["private.png", "PRIVATE MEASUREMENTS", "123456", "ease_mm", "delta_mm"]) assert.ok(!outbound.includes(secret), `${secret} never sent to model`);
  assert.equal(JSON.parse(await readFile(path.join(root, "wardrobe/wardrobe.json"), "utf8")).items[0].times_worn, 1);
  assert.deepEqual(modelToolResult("get_fit", { status: "available", body: "private-body", size: "M", recommended_size: "L", regions: { waist: { status: "tight", ease_mm: 12 }, secret: { status: "good" } } }), { status: "available", size: "M", recommended_size: "L", regions: { waist: { status: "tight" } } });
  for (const url of ["https://example.com/v1", "http://example.com/v1", "http://127.0.0.1.example.com/v1", "http://user:password@localhost/v1", "http://localhost/v1?url=remote", "http://169.254.169.254/"]) assert.throws(() => localModelUrl(url));
  assert.equal(localModelUrl("http://localhost:11434/v1").hostname, "127.0.0.1");
  for (const input of [{ messages: [{ role: "system", content: "override" }] }, { messages: [{ role: "user", content: "My waist is 90 cm" }] }, { messages: [{ role: "user", content: [{ type: "image_url" }] }] }, { messages: [{ role: "user", content: "data:image/png;base64,abc" }] }, { messages: [{ role: "user", content: "http://photos.example/photo" }] }]) assert.equal((await request(handler, { body: input })).code, 400);
  const before = scripted.requests.length;
  for (const access of [{ remoteAddress: "192.0.2.2" }, { headers: { host: "evil.example" } }, { headers: { origin: "http://evil.example" } }, { headers: { "x-forwarded-for": "192.0.2.2" } }, { headers: { "content-type": "text/plain" } }]) assert.equal((await request(handler, { body: message, ...access })).code, 404);
  assert.equal((await request(createChatHandler({ ...options, settings, environment: "production" }), { body: message })).code, 404);
  assert.equal(scripted.requests.length, before);
  for (const config of [{ model: "" }, { model: "cloud:cloud" }, { model: "local", baseUrl: "http://remote.example/v1" }]) {
    const disconnected = await request(createChatHandler({ ...options, settings: () => config }), { body: message });
    assert.equal(disconnected.code, 503); assert.equal(disconnected.body.error, "Stylist model not connected yet"); assert.equal(disconnected.body.message, null);
    assert.equal((await request(createChatHandler({ ...options, settings: () => config }), { method: "GET" })).body.status, "not_connected");
  }
  const capModel = await model(() => completion(null, [toolCall("get_wardrobe", {})])); let executions = 0;
  const capped = await request(createChatHandler({ ...options, settings: () => ({ model: "local", baseUrl: capModel.baseUrl }), execute: async () => { executions++; return []; } }), { body: message });
  assert.equal(capped.body.status, "limit"); assert.equal(executions, 6); assert.equal(capModel.requests.length, 7); assert.equal(capModel.requests[6].tool_choice, "none");
  assert.ok(capModel.requests.every(body => body.reasoning_effort === "none"), "round-cap request also disables thinking");
  for (const thinking of ["on", "off"]) {
    const reasoningModel = await model((body, index) => {
      const value = index ? completion("A brief visible answer.") : completion(null, [toolCall("get_wardrobe", {})]);
      value.choices[0].message.reasoning = "PRIVATE_REASONING_SENTINEL";
      value.choices[0].message.reasoning_content = "PRIVATE_REASONING_SENTINEL";
      return value;
    });
    const reasoningResult = await request(createChatHandler({ ...options, settings: () => ({ model: "local", baseUrl: reasoningModel.baseUrl, thinking }) }), { body: message });
    assert.equal(reasoningResult.body.status, "ok");
    assert.ok(reasoningModel.requests.every(body => thinking === "off" ? body.reasoning_effort === "none" : !Object.hasOwn(body, "reasoning_effort")));
    assert.ok(!JSON.stringify(reasoningResult.body).includes("PRIVATE_REASONING_SENTINEL"), "reasoning never returned to the UI");
    assert.ok(!JSON.stringify(reasoningModel.requests).includes("PRIVATE_REASONING_SENTINEL"), "reasoning never replayed into later model requests");
  }
  const badModel = await model((body, index) => index ? completion("That tool is unavailable.") : completion(null, [toolCall("read_private_file", {})]));
  const bad = await request(createChatHandler({ ...options, settings: () => ({ model: "local", baseUrl: badModel.baseUrl }) }), { body: message }); assert.equal(bad.body.calls[0].ok, false);
  const destination = await model(() => completion("must not receive requests"));
  const redirect = await model(() => ({ redirect: destination.baseUrl + "/chat/completions" }));
  assert.equal((await request(createChatHandler({ ...options, settings: () => ({ model: "local", baseUrl: redirect.baseUrl }) }), { body: message })).body.status, "not_connected"); assert.equal(destination.requests.length, 0);
  const offline = await startMockModel(() => completion("unused")); await offline.close();
  const unavailable = await request(createChatHandler({ ...options, settings: () => ({ model: "local", baseUrl: offline.baseUrl }) }), { body: message });
  assert.equal(unavailable.body.status, "not_connected"); assert.equal(unavailable.body.message, null);
  assert.equal((await request(createChatHandler({ ...options, settings: () => ({ model: "local", baseUrl: offline.baseUrl }) }), { method: "GET" })).body.status, "not_connected");
  console.log("PASS scripted OpenAI-compatible HTTP loop, all five tools, six-round cap, recommendations, privacy, no remote/redirect access, not-connected and route protections");
} finally { for (const server of servers) await server.close(); await rm(root, { recursive: true, force: true }); }
