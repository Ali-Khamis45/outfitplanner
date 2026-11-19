import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWardrobeTextureHandler } from "../lib/wardrobeTextureApi.ts";
import { exampleWardrobe, parseWardrobe } from "../lib/wardrobe/schema.ts";

// Sprint 4A: the development-only route that runs the photo-to-texture producer for a piece (the producer is stubbed).
const root = await mkdtemp(path.join(os.tmpdir(), "wardrobe-texture-test-"));
try {
  const wardrobe = exampleWardrobe();
  const shirt = wardrobe.items.find(item => item.category === "top"), other = wardrobe.items.find(item => item !== shirt);
  shirt.template = "tshirt-v5.3"; other.template = "tshirt-v5.2";
  await mkdir(path.join(root, "wardrobe", "photos"), { recursive: true });
  await writeFile(path.join(root, "wardrobe", "wardrobe.json"), JSON.stringify(wardrobe, null, 2));
  const calls = [];
  let behaviour = async args => { calls.push(args); return JSON.stringify({ version: 1, item: args[0], template: args[2], views: ["front"], coverage: 0.98, fallback_hex: "#334455", created_at: "2026-11-20" }); };
  const run = args => behaviour(args);
  const handler = createWardrobeTextureHandler(root, "development", run), production = createWardrobeTextureHandler(root, "production", run);
  const request = async (fn, body, overrides = {}) => {
    const req = { method: "POST", body, query: {}, headers: { host: "localhost:3000", "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" }, ...overrides };
    const res = { code: 0, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, status(v) { this.code = v; return this; }, end() { return this; }, json(v) { this.body = v; return this; } };
    await fn(req, res); return res;
  };
  assert.equal((await request(production, { item: shirt.id })).code, 404, "development only");
  assert.equal((await request(handler, { item: shirt.id }, { socket: { remoteAddress: "192.0.2.10" } })).code, 404, "localhost only");
  assert.equal((await request(handler, { item: shirt.id }, { method: "GET" })).code, 404);
  assert.equal((await request(handler, { item: "../escape" })).code, 400);
  assert.equal((await request(handler, { item: "missing-item" })).code, 404);
  assert.equal((await request(handler, { item: other.id })).code, 400, "unsupported template");
  assert.match((await request(handler, { item: shirt.id })).body.error, /front photo/, "a front capture is required");
  assert.equal(calls.length, 0, "nothing ran before the checks passed");

  await writeFile(path.join(root, "wardrobe", "photos", `${shirt.id}-front.jpg`), Buffer.from([255, 216, 255, 217]));
  const done = await request(handler, { item: shirt.id });
  assert.equal(done.code, 200);
  assert.deepEqual(done.body, { texture: `outputs/wardrobe/textures/${shirt.id}.png`, coverage: 0.98, views: ["front"], fallback_hex: "#334455" });
  assert.deepEqual(calls[0], [shirt.id, "--template", "tshirt-v5.3", "--wardrobe", path.join(root, "wardrobe")]);
  const written = parseWardrobe(JSON.parse(await readFile(path.join(root, "wardrobe", "wardrobe.json"), "utf8")));
  assert.equal(written.items.find(item => item.id === shirt.id).texture, `outputs/wardrobe/textures/${shirt.id}.png`);
  assert.deepEqual(written.items.filter(item => item.id !== shirt.id), wardrobe.items.filter(item => item.id !== shirt.id), "every other piece unchanged");

  // one producer run at a time
  let release;
  behaviour = args => new Promise(resolve => { release = () => resolve(JSON.stringify({ views: ["front"], coverage: 1, fallback_hex: "#000000" })); calls.push(args); });
  const first = request(handler, { item: shirt.id });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await request(handler, { item: shirt.id })).code, 409);
  release(); assert.equal((await first).code, 200);

  // a failed run reports the producer's error and frees the slot
  behaviour = async () => { throw new Error("no garment found: photograph it on a plain surface"); };
  const failed = await request(handler, { item: shirt.id });
  assert.equal(failed.code, 500); assert.match(failed.body.error, /plain surface/);
  behaviour = async () => JSON.stringify({ views: ["front", "back"], coverage: 0.9, fallback_hex: "#111111" });
  assert.equal((await request(handler, { item: shirt.id })).code, 200);
  console.log("Wardrobe texture route: development/localhost only, checks, producer run, serialized link, one run at a time, errors passed");
} finally { await rm(root, { recursive: true, force: true }); }
