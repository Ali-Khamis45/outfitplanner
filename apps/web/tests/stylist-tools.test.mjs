import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWardrobeHandler } from "../lib/wardrobeApi.ts";
import { createStylistHandler } from "../lib/stylist/api.ts";
import { filterWardrobe } from "../lib/stylist/core.ts";
import { createWeather } from "../lib/stylist/weather.ts";
import { exampleWardrobe } from "../lib/wardrobe/schema.ts";

const root = await mkdtemp(path.join(os.tmpdir(), "stylist-test-"));
const wardrobe = exampleWardrobe(); wardrobe.items[0].last_worn = "2026-11-10";
wardrobe.outfits.push({ id: "look", name: "Look", items: ["example-1", "example-3"], occasion: "work", worn_on: [] });
let clock = 1000000, calls = 0;
const fakeFetch = async url => { calls++; const geo = String(url).includes("geocoding-api"); return { ok: true, json: async () => geo ? { results: [{ name: "Cairo", latitude: 30, longitude: 31 }] } : { daily: { time: ["2026-11-14"], temperature_2m_min: [15], temperature_2m_max: [25], precipitation_probability_max: [20], wind_speed_10m_max: [12], weather_code: [0] } } }; };
const weather = createWeather(fakeFetch, () => clock), handler = createStylistHandler(root, "development", weather), production = createStylistHandler(root, "production", weather);
async function request(tool, body = {}, overrides = {}, fn = handler) {
  const req = { method: "POST", query: { tool }, body, headers: { host: "localhost:3000", "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" }, ...overrides };
  const res = { code: 0, body: null, setHeader() {}, status(code) { this.code = code; return this; }, end() { return this; }, json(value) { this.body = value; return this; } };
  await fn(req, res); return res;
}
try {
  await mkdir(path.join(root, "wardrobe"), { recursive: true }); await writeFile(path.join(root, "wardrobe", "wardrobe.json"), JSON.stringify(wardrobe));
  assert.equal((await request("get_wardrobe", {}, {}, production)).code, 404);
  assert.equal((await request("get_wardrobe", {}, { socket: { remoteAddress: "192.0.2.2" } })).code, 404);
  assert.equal((await request("log_worn", {}, { headers: { host: "localhost:3000", origin: "http://evil.example", "content-type": "application/json" } })).code, 404);
  const all = (await request("get_wardrobe")).body; assert.equal(all.length, 6); assert.ok(!("photo" in all[0]) && !("share" in all[0].colours[0]));
  let result = await request("get_wardrobe", { filter: { category: "top", seasons: ["summer"], occasions: ["WORK"], formality_min: 2, formality_max: 2, warmth_max: 1, colour: "#1f2a44" } }); assert.deepEqual(result.body.map(i => i.id), ["example-1"]);
  const flat = await request("get_wardrobe", { category: "top", seasons: ["summer"] });
  assert.deepEqual(flat.body, (await request("get_wardrobe", { filter: { category: "top", seasons: ["summer"] } })).body);
  assert.equal((await request("get_wardrobe", { filter: { category: "top" }, category: "bottom" })).code, 400);
  assert.equal((await request("get_wardrobe", { category: "not-a-category" })).code, 400);
  assert.equal((await request("get_wardrobe", { nonsense: true })).code, 400);
  const recent = filterWardrobe(wardrobe, { not_worn_days: 5 }, Date.parse("2026-11-14T12:00:00Z"));
  assert.ok(!recent.some(i => i.id === "example-1")); assert.equal(recent.length, 5);
  assert.equal(filterWardrobe(wardrobe, { not_worn_days: 3 }, Date.parse("2026-11-14T12:00:00Z")).length, 6);
  assert.equal((await request("get_wardrobe", { filter: { warmth_min: 5, warmth_max: 1 } })).code, 400);
  assert.equal((await request("get_wardrobe", { filter: { bogus: true } })).code, 400);
  assert.equal((await request("get_weather", { date: "2026-11-14" })).body.temperature_max_c, 25);
  await request("get_weather", { date: "2026-11-14", city: "CAIRO" }); assert.equal(calls, 2); clock += 3600001; await request("get_weather", { date: "2026-11-14" }); assert.equal(calls, 4);
  const lookups = [];
  const fallbackFetch = async url => {
    const parsed = new URL(url);
    if (parsed.hostname.startsWith("geocoding")) {
      const name = parsed.searchParams.get("name"); lookups.push(name);
      return { ok: true, json: async () => ({ results: name === "Cairo" || name === "Alexandria" ? [{ name, latitude: 30, longitude: 31 }] : [] }) };
    }
    return { ok: true, json: async () => ({ daily: { time: ["2026-11-14"], temperature_2m_min: [15], temperature_2m_max: [25], precipitation_probability_max: [20], wind_speed_10m_max: [12], weather_code: [0] } }) };
  };
  const fallbackWeather = createWeather(fallbackFetch, () => clock, "Alexandria");
  const zamalek = await fallbackWeather({ date: "2026-11-14", city: "الزمالك" });
  assert.equal(zamalek.city, "Cairo"); assert.equal(zamalek.fallback_from, "الزمالك");
  const other = await fallbackWeather({ date: "2026-11-14", city: "Unknown Place" });
  assert.equal(other.city, "Alexandria"); assert.equal(other.fallback_from, "Unknown Place");
  assert.deepEqual(lookups, ["الزمالك", "Cairo", "Unknown Place", "Alexandria"]);
  await mkdir(path.join(root, "garments/sizes"), { recursive: true });
  for (const [size, recommended] of [["M", false], ["L", true]]) await writeFile(path.join(root, `garments/sizes/tshirt-v5.3-${size}-neutral.fit.json`), JSON.stringify({ version: 1, garment: "tshirt-v5.3", size, body: "neutral", regions: { chest: { status: "good", ease_mm: 20 } }, recommended }));
  result = await request("get_fit", { item_id: "example-1", body: "neutral" }); assert.equal(result.body.recommended_size, "L"); assert.equal(result.body.regions.chest.status, "good");
  assert.equal((await request("get_fit", { item_id: "example-3", body: "personal-scaled" })).body.status, "unknown");
  await mkdir(path.join(root, "garments/personal"), { recursive: true }); await writeFile(path.join(root, "garments/personal/manifest.json"), JSON.stringify({ primary: { id: "mybody" } }));
  await writeFile(path.join(root, "garments/sizes/tshirt-v5.3-M-mybody.fit.json"), JSON.stringify({ version: 1, garment: "tshirt-v5.3", size: "M", body: "mybody", regions: { chest: { status: "tight", ease_mm: 2 } }, recommended: true }));
  assert.equal((await request("get_fit", { item_id: "example-1", body: "personal-scaled" })).body.recommended_size, "M");
  result = await request("show_on_avatar", { item_ids: ["example-3", "example-1"], pose: "walk" }); assert.equal(result.body.url, "/try-on?top=example-1&bottom=example-3&pose=walk");
  assert.equal((await request("show_on_avatar", { item_ids: ["example-1", "example-2"] })).code, 400);
  assert.equal((await request("log_worn", { outfit_or_item_ids: ["look", "example-1"], date: "2026-11-14" })).code, 200);
  const saved = JSON.parse(await readFile(path.join(root, "wardrobe/wardrobe.json"), "utf8")); assert.equal(saved.items[0].times_worn, 1); assert.equal(saved.items[2].last_worn, "2026-11-14");
  assert.equal((await request("log_worn", { outfit_or_item_ids: ["example-1", "missing"], date: "2026-11-14" })).code, 400);
  assert.equal((await request("log_worn", { outfit_or_item_ids: ["example-1"], date: "2026-02-30" })).code, 400);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, "wardrobe/wardrobe.json"), "utf8")), saved);
  const editor = createWardrobeHandler(root, "development");
  async function editorRequest(method, body, version) {
    const req = { method, body, query: {}, headers: { host: "localhost:3000", "content-type": "application/json", ...(version ? { "if-match": version } : {}) }, socket: { remoteAddress: "127.0.0.1" } };
    const res = { code: 0, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, end() { return this; }, json(value) { this.body = value; return this; } };
    await editor(req, res); return res;
  }
  // Both orders matter: an editor snapshot cannot silently undo a wear event.
  for (const logFirst of [false, true]) {
    const snapshot = await editorRequest("GET"); const edited = structuredClone(snapshot.body); edited.items[1].name = `Edited ${logFirst}`;
    const editorWrite = () => editorRequest("PUT", edited, snapshot.headers["X-Wardrobe-Version"]);
    const logWrite = () => request("log_worn", { outfit_or_item_ids: ["example-1"], date: "2026-11-15" });
    const pending = logFirst ? [logWrite(), editorWrite()] : [editorWrite(), logWrite()];
    const results = await Promise.all(pending), editorResult = results[logFirst ? 1 : 0], logResult = results[logFirst ? 0 : 1];
    assert.equal(logResult.code, 200); assert.equal(editorResult.code, logFirst ? 409 : 200);
    const persisted = await editorRequest("GET");
    assert.equal(persisted.body.items[0].times_worn, snapshot.body.items[0].times_worn + 1);
    assert.equal(persisted.body.items[1].name, logFirst ? snapshot.body.items[1].name : edited.items[1].name);
  }
  console.log("Stylist routes, filters, weather cache, fit, avatar URL, and concurrent wardrobe writes passed");
} finally { await rm(root, { recursive: true, force: true }); }
