import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GET } from "../app/api/size-garment/route.ts";
import personalHandler from "../pages/api/personal-size-garment.ts";

const before = process.cwd(), previousEnvironment = process.env.NODE_ENV;
const root = await mkdtemp(path.join(os.tmpdir(), "vw-fit-route-"));
try {
  const web = path.join(root, "apps", "web"), sizes = path.join(root, "outputs", "garments", "sizes"), fixtures = path.join(root, ".codex-garment-check", "sprint3-fixtures", "outputs", "garments", "sizes");
  await mkdir(web, { recursive: true }); await mkdir(sizes, { recursive: true }); await mkdir(fixtures, { recursive: true });
  const bytes = await readFile(new URL("fixtures/corrective.glb", import.meta.url));
  for (const directory of [sizes, fixtures]) for (const size of ["S", "M"]) {
    const stem = `tshirt-v5.2-${size}-neutral`;
    await writeFile(path.join(directory, `${stem}.glb`), bytes);
    await writeFile(path.join(directory, `${stem}.correctives.json`), "{}");
    await writeFile(path.join(directory, `${stem}.fit.json`), JSON.stringify({ version: 1, garment: "tshirt-v5.2", size, body: "neutral", regions: { chest: { ease_mm: 62, status: "tight", clamped: size === "S" }, waist: { ease_mm: 84, status: "good", clamped: size === "S" }, hips: { ease_mm: -84, status: "tight", clamped: size === "S" } }, recommended: size === "M" }));
  }
  process.chdir(web);
  const request = query => GET(new Request(`http://localhost:3000/api/size-garment?${new URLSearchParams(query)}`));
  const options = await request({ body: "neutral", slot: "top" });
  assert.equal(options.status, 200); const items = await options.json(); assert.deepEqual(items.map(item => item.size), ["S", "M"]); assert.equal(items[1].fit.recommended, true);
  assert.deepEqual([items[0].fit.regions.chest.clamped, items[0].fit.regions.waist.clamped, items[0].fit.regions.hips.clamped], [true, true, true]);
  const glb = await request({ body: "neutral", slot: "top", size: "M", asset: "glb" });
  assert.equal(glb.status, 200); assert.equal(glb.headers.get("Content-Type"), "model/gltf-binary");
  assert.equal(await (await request({ body: "neutral", slot: "top", size: "M", asset: "sidecar" })).text(), "{}");
  assert.equal((await request({ body: "../private", slot: "top" })).status, 404);
  assert.equal((await request({ body: "neutral", slot: "top", size: "../M", asset: "glb" })).status, 404);
  process.env.NODE_ENV = "production";
  assert.equal((await request({ body: "personal-scaled", slot: "top" })).status, 404);
  assert.equal((await request({ body: "neutral", slot: "top", fixtures: "1" })).status, 404);
  process.env.NODE_ENV = "development";
  const fixtureOptions = await (await request({ body: "neutral", slot: "top", fixtures: "1" })).json();
  assert.equal(fixtureOptions.length, 2); assert.match(fixtureOptions[0].glb, /fixtures=1/);
  assert.equal((await request({ body: "neutral", slot: "top", fixtures: "1", size: "M", asset: "glb" })).status, 200);
  assert.equal((await request({ body: "personal-scaled", slot: "top", fixtures: "1" })).status, 404);
  assert.equal((await request({ body: "personal-scaled", slot: "top" })).status, 307);
  const req = { socket: { remoteAddress: "192.0.2.1" }, headers: { host: "localhost:3000" }, method: "GET", query: { body: "personal-scaled", slot: "top" } };
  const res = { code: 0, setHeader() {}, status(code) { this.code = code; return this; }, end() { return this; } };
  await personalHandler(req, res); assert.equal(res.code, 404);
  console.log("App Router size discovery, fixture gating, assets and privacy checks passed");
} finally { process.chdir(before); if (previousEnvironment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnvironment; await rm(root, { recursive: true, force: true }); }
