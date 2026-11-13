import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import handler from "../pages/api/size-garment.ts";

const before = process.cwd(), previousEnvironment = process.env.NODE_ENV;
const root = await mkdtemp(path.join(os.tmpdir(), "vw-fit-route-"));
try {
  const web = path.join(root, "apps", "web"), sizes = path.join(root, "outputs", "garments", "sizes");
  await mkdir(web, { recursive: true }); await mkdir(sizes, { recursive: true });
  const bytes = await readFile(new URL("fixtures/corrective.glb", import.meta.url));
  for (const size of ["S", "M"]) {
    const stem = `tshirt-v5.2-${size}-neutral`;
    await writeFile(path.join(sizes, `${stem}.glb`), bytes);
    await writeFile(path.join(sizes, `${stem}.correctives.json`), "{}");
    await writeFile(path.join(sizes, `${stem}.fit.json`), JSON.stringify({ version: 1, garment: "tshirt-v5.2", size, body: "neutral", regions: { chest: { ease_mm: 62, status: "tight" } }, recommended: size === "M" }));
  }
  process.chdir(web);
  const request = async (query, overrides = {}) => {
    const req = { socket: { remoteAddress: "127.0.0.1" }, headers: { host: "localhost:3000" }, method: "GET", query, ...overrides };
    const res = { headers: {}, code: 0, body: null, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, end() { return this; }, json(value) { this.body = value; return this; }, send(value) { this.body = value; return this; } };
    await handler(req, res); return res;
  };
  const options = await request({ body: "neutral", slot: "top" });
  assert.equal(options.code, 200); assert.deepEqual(options.body.map(item => item.size), ["S", "M"]); assert.equal(options.body[1].fit.recommended, true);
  const glb = await request({ body: "neutral", slot: "top", size: "M", asset: "glb" });
  assert.equal(glb.code, 200); assert.equal(glb.headers["Content-Type"], "model/gltf-binary");
  assert.equal((await request({ body: "neutral", slot: "top", size: "M", asset: "sidecar" })).body.toString(), "{}");
  assert.equal((await request({ body: "../private", slot: "top" })).code, 404);
  assert.equal((await request({ body: "neutral", slot: "top", size: "../M", asset: "glb" })).code, 404);
  process.env.NODE_ENV = "production";
  assert.equal((await request({ body: "personal-scaled", slot: "top" })).code, 404);
  process.env.NODE_ENV = "development";
  assert.equal((await request({ body: "personal-scaled", slot: "top" }, { socket: { remoteAddress: "192.0.2.1" } })).code, 404);
  console.log("Size discovery, recommendation, asset and privacy checks passed");
} finally { process.chdir(before); if (previousEnvironment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnvironment; await rm(root, { recursive: true, force: true }); }
