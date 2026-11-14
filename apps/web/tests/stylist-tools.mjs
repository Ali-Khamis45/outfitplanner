// Isolated harness: uses six example items in a temporary outputs directory.
// Pass --live-weather to call Open-Meteo; otherwise use a deterministic forecast.
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createStylistHandler } from "../lib/stylist/api.ts";
import { createWeather } from "../lib/stylist/weather.ts";
import { exampleWardrobe } from "../lib/wardrobe/schema.ts";

const root = await mkdtemp(path.join(os.tmpdir(), "stylist-harness-"));
const date = new Date().toISOString().slice(0, 10);
const mockFetch = async url => ({ ok: true, json: async () => String(url).includes("geocoding-api") ? { results: [{ name: "Cairo", latitude: 30.04, longitude: 31.24 }] } : { daily: { time: [date], temperature_2m_min: [18], temperature_2m_max: [27], precipitation_probability_max: [0], wind_speed_10m_max: [14], weather_code: [0] } } });
const handler = createStylistHandler(root, "development", createWeather(process.argv.includes("--live-weather") ? fetch : mockFetch));
async function call(tool, body) {
  const req = { method: "POST", query: { tool }, body, headers: { host: "localhost:3000", "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" } };
  const res = { code: 0, value: null, setHeader() {}, status(code) { this.code = code; return this; }, end() { return this; }, json(value) { this.value = value; return this; } };
  await handler(req, res); console.log(`${tool} (${res.code}):`, JSON.stringify(res.value, null, 2)); if (res.code !== 200) process.exitCode = 1;
}
try {
  await mkdir(path.join(root, "wardrobe"), { recursive: true }); await writeFile(path.join(root, "wardrobe/wardrobe.json"), JSON.stringify(exampleWardrobe()));
  await call("get_wardrobe", {});
  await call("get_weather", { date });
  await call("get_fit", { item_id: "example-1", body: "neutral" });
  await call("show_on_avatar", { item_ids: ["example-1", "example-3"], pose: "walk" });
  await call("log_worn", { outfit_or_item_ids: ["example-1", "example-3"], date });
} finally { await rm(root, { recursive: true, force: true }); }
