import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPersonalFitHandler } from "../lib/personalFit.ts";

const root = await mkdtemp(path.join(os.tmpdir(), "vw-personal-fit-test-"));
const outputs = path.join(root, "outputs"), personal = path.join(outputs, "garments", "personal");
try {
  await mkdir(personal, { recursive: true });
  const manifest = { version: 1, fit_date: "2026-11-13", primary: { id: "test", label: "Fixture", body: "outputs/garments/personal/body.glb", top: { glb: "outputs/garments/personal/shirt.glb", sidecar: "outputs/garments/personal/shirt.json" }, bottom: { glb: "outputs/garments/personal/pants.glb", sidecar: "outputs/garments/personal/pants.json" } }, secondary: [{ body: "outputs/garments/personal/secondary.glb" }] };
  await writeFile(path.join(personal, "manifest.json"), JSON.stringify(manifest));
  for (const file of ["body.glb", "shirt.glb", "pants.glb", "shirt.json", "pants.json"]) await writeFile(path.join(personal, file), `fixture ${file}`);
  const request = async (environment, overrides = {}) => {
    const req = { socket: { remoteAddress: "127.0.0.1" }, headers: { host: "localhost:3000" }, method: "GET", query: {}, ...overrides };
    const res = { headers: {}, code: 0, body: null, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, end(value) { this.body = value ?? null; return this; }, json(value) { this.body = value; return this; }, send(value) { this.body = value; return this; } };
    await createPersonalFitHandler(outputs, environment)(req, res);
    return res;
  };
  const found = await request("development");
  assert.equal(found.code, 200);
  assert.deepEqual(found.body, { body: "/api/personal-fit?asset=body", shirt: "/api/personal-fit?asset=shirt", pants: "/api/personal-fit?asset=pants", shirtSidecar: "/api/personal-fit?asset=shirtSidecar", pantsSidecar: "/api/personal-fit?asset=pantsSidecar" });
  for (const [asset, name] of [["body", "body.glb"], ["shirt", "shirt.glb"], ["pants", "pants.glb"], ["shirtSidecar", "shirt.json"], ["pantsSidecar", "pants.json"]]) {
    const result = await request("development", { query: { asset } });
    assert.equal(result.code, 200); assert.equal(result.body.toString(), `fixture ${name}`); assert.equal(result.headers["Cache-Control"], "no-store, private");
  }
  assert.equal((await request("production")).code, 404);
  assert.equal((await request("development", { socket: { remoteAddress: "192.0.2.1" } })).code, 404);
  assert.equal((await request("development", { headers: { host: "example.com" } })).code, 404);
  assert.equal((await request("development", { headers: { host: "localhost:3000", "x-forwarded-for": "192.0.2.1" } })).code, 404);
  assert.equal((await request("development", { headers: { host: "localhost:3000", origin: "https://example.com" } })).code, 404);
  assert.equal((await request("development", { query: { asset: "../manifest.json" } })).code, 404);
  await writeFile(path.join(personal, "manifest.json"), JSON.stringify({ ...manifest, primary: { ...manifest.primary, body: "outputs/../../../outside.glb" } }));
  await writeFile(path.join(root, "outside.glb"), "secret");
  assert.equal((await request("development", { query: { asset: "body" } })).code, 404);
  assert.equal(await readFile(path.join(root, "outside.glb"), "utf8"), "secret");
  await rm(path.join(personal, "manifest.json"));
  assert.equal((await request("development")).code, 404);
  console.log("Personal fit access, listed assets, missing manifest and traversal checks passed");
} finally { await rm(root, { recursive: true, force: true }); }
