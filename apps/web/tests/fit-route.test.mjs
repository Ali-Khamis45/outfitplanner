import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GET } from "../app/api/size-garment/route.ts";
import personalHandler from "../pages/api/personal-size-garment.ts";

const before = process.cwd(), previousEnvironment = process.env.NODE_ENV;
const root = await mkdtemp(path.join(os.tmpdir(), "vw-fit-route-"));
try {
  const web = path.join(root, "apps", "web"), sizes = path.join(root, "outputs", "garments", "sizes"), legacy = path.join(root, "outputs", "garments", "sizes-v5.2"), fixtures = path.join(root, ".codex-garment-check", "sprint3-fixtures", "outputs", "garments", "sizes");
  await mkdir(web, { recursive: true }); await mkdir(sizes, { recursive: true }); await mkdir(legacy, { recursive: true }); await mkdir(fixtures, { recursive: true });
  const bytes = await readFile(new URL("fixtures/corrective.glb", import.meta.url));
  // sizes/ holds the default generation (tshirt-v5.3), sizes-v5.2/ the previous one (?gen=v5.2); a stray v5.2 file in sizes/ is ignored
  for (const [directory, garment] of [[sizes, "tshirt-v5.3"], [legacy, "tshirt-v5.2"], [fixtures, "tshirt-v5.3"], [fixtures, "tshirt-v5.2"], [sizes, "tshirt-v5.2"]]) for (const size of directory === sizes && garment === "tshirt-v5.2" ? ["L"] : ["S", "M"]) {
    const stem = `${garment}-${size}-neutral`;
    await writeFile(path.join(directory, `${stem}.glb`), bytes);
    await writeFile(path.join(directory, `${stem}.correctives.json`), "{}");
    await writeFile(path.join(directory, `${stem}.fit.json`), JSON.stringify({ version: 1, garment, size, body: "neutral", regions: { chest: { ease_mm: 62, status: "tight", clamped: size === "S" }, waist: { ease_mm: 84, status: "good", clamped: size === "S" }, hips: { ease_mm: -84, status: "tight", clamped: size === "S" } }, recommended: size === "M" }));
  }
  // Sprint 3.6: L failed its gates and was withheld; a stale note for the shipped M and a note naming another file are ignored
  const withheld = path.join(root, "outputs", "garments", "sizes-withheld"); await mkdir(withheld, { recursive: true });
  for (const [file, size] of [["tshirt-v5.3-L-neutral", "tshirt-v5.3-L-neutral"], ["tshirt-v5.3-M-neutral", "tshirt-v5.3-M-neutral"], ["tshirt-v5.3-XL-neutral", "tshirt-v5.3-S-neutral"]]) await writeFile(path.join(withheld, `${file}.withheld.json`), JSON.stringify({ version: 1, size, reason: "failed its deformation gates", failed_gates: "raise_both_120" }));
  await writeFile(path.join(withheld, "tshirt-v5.3-L-neutral.glb"), bytes);
  process.chdir(web);
  const request = query => GET(new Request(`http://localhost:3000/api/size-garment?${new URLSearchParams(query)}`));
  const options = await request({ body: "neutral", slot: "top" });
  assert.equal(options.status, 200); const listed = await options.json(), items = listed.filter(item => !item.withheld);
  assert.deepEqual(items.map(item => item.size), ["S", "M"]); assert.equal(items[1].fit.recommended, true);
  assert.deepEqual(listed.filter(item => item.withheld), [{ size: "L", withheld: true }], "withheld sizes are listed without files");
  assert.equal((await request({ body: "neutral", slot: "top", size: "L", asset: "glb" })).status, 404, "a withheld size is never served");
  assert.deepEqual((await (await request({ body: "neutral", slot: "bottom" })).json()), [], "nothing withheld for the bottom");
  assert.ok(items.every(item => item.fit.garment === "tshirt-v5.3" && !item.glb.includes("gen=")), "default generation without a gen parameter");
  // the legacy, ungated v5.2 set is development-only: elsewhere ?gen=v5.2 gets the gated default
  process.env.NODE_ENV = "production";
  assert.deepEqual((await (await request({ body: "neutral", slot: "top", gen: "v5.2" })).json()).filter(item => !item.withheld).map(item => item.fit.garment), ["tshirt-v5.3", "tshirt-v5.3"], "no legacy sizes outside development");
  process.env.NODE_ENV = "development";
  const legacyItems = await (await request({ body: "neutral", slot: "top", gen: "v5.2" })).json();
  assert.ok(!legacyItems.some(item => item.withheld), "the withheld folder belongs to sizes/ only");
  assert.deepEqual(legacyItems.map(item => [item.size, item.fit.garment]), [["S", "tshirt-v5.2"], ["M", "tshirt-v5.2"]]); assert.match(legacyItems[0].glb, /gen=v5\.2/);
  assert.equal((await request({ body: "neutral", slot: "top", gen: "v5.2", size: "M", asset: "glb" })).status, 200);
  assert.deepEqual((await (await request({ body: "neutral", slot: "top", gen: "v4" })).json()).filter(item => !item.withheld).map(item => item.fit.garment), ["tshirt-v5.3", "tshirt-v5.3"], "unknown generations fall back to the default");
  assert.deepEqual([items[0].fit.regions.chest.clamped, items[0].fit.regions.waist.clamped, items[0].fit.regions.hips.clamped], [true, true, true]);
  const glb = await request({ body: "neutral", slot: "top", size: "M", asset: "glb" });
  assert.equal(glb.status, 200); assert.equal(glb.headers.get("Content-Type"), "model/gltf-binary");
  assert.equal(await (await request({ body: "neutral", slot: "top", size: "M", asset: "sidecar" })).text(), "{}");
  assert.equal((await request({ body: "../private", slot: "top" })).status, 404);
  assert.equal((await request({ body: "neutral", slot: "top", size: "../M", asset: "glb" })).status, 404);
  // pants-v3.1 is the default bottom (no knee step); a stray pants-v3 size left in sizes/ is ignored, and the former
  // candidate parameter ?pants=v3.1 changes nothing
  for (const garment of ["pants-v3.1", "pants-v3"]) {
    const stem = `${garment}-M-neutral`;
    await writeFile(path.join(sizes, `${stem}.glb`), bytes); await writeFile(path.join(sizes, `${stem}.correctives.json`), "{}");
    await writeFile(path.join(sizes, `${stem}.fit.json`), JSON.stringify({ version: 1, garment, size: "M", body: "neutral", regions: { waist: { ease_mm: 20, status: "good" }, hips: { ease_mm: 90, status: "good" }, length: { delta_mm: 0, status: "good" } }, recommended: true }));
  }
  process.env.NODE_ENV = "development";
  const bottoms = await (await request({ body: "neutral", slot: "bottom" })).json();
  assert.deepEqual(bottoms.map(item => item.fit.garment), ["pants-v3.1"], "the default bottom is pants-v3.1");
  assert.ok(!bottoms[0].glb.includes("gen=") && !bottoms[0].glb.includes("pants="));
  assert.equal((await request({ body: "neutral", slot: "bottom", size: "M", asset: "glb" })).status, 200);
  assert.deepEqual((await (await request({ body: "neutral", slot: "bottom", gen: "v5.3", pants: "v3.1" })).json()).map(item => item.fit.garment), ["pants-v3.1"], "?pants= is no longer a selector");
  process.env.NODE_ENV = "production";  assert.equal((await request({ body: "personal-scaled", slot: "top" })).status, 404);
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
