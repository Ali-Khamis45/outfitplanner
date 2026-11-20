import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDevInfoHandler } from "../lib/devInfo.ts";

// The development badge's route: development and localhost only; branch, commit and data folder (git is stubbed).
const root = await mkdtemp(path.join(os.tmpdir(), "dev-info-test-"));
try {
  const git = async args => args.includes("--abbrev-ref") ? "sprint-4a" : "abc1234";
  const request = async (fn, overrides = {}) => {
    const req = { method: "GET", query: {}, headers: { host: "localhost:3000" }, socket: { remoteAddress: "127.0.0.1" }, ...overrides };
    const res = { code: 0, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, status(v) { this.code = v; return this; }, end() { return this; }, json(v) { this.body = v; return this; } };
    await fn(req, res); return res;
  };
  assert.equal((await request(createDevInfoHandler("production", root, false, git))).code, 404, "development only");
  assert.equal((await request(createDevInfoHandler("development", root, false, git), { socket: { remoteAddress: "192.0.2.10" } })).code, 404, "localhost only");
  assert.equal((await request(createDevInfoHandler("development", root, false, git), { method: "POST" })).code, 404);
  const real = await request(createDevInfoHandler("development", root, false, git));
  assert.equal(real.code, 200); assert.equal(real.headers["Cache-Control"], "no-store, private");
  assert.deepEqual(real.body, { branch: "sprint-4a", commit: "abc1234", data: { path: await realpath(root), override: false } });
  const test = await request(createDevInfoHandler("development", root, true, async args => args.includes("--abbrev-ref") ? "HEAD" : "9f27f11"));
  assert.equal(test.body.branch, "detached"); assert.equal(test.body.data.override, true);
  const broken = await request(createDevInfoHandler("development", root, false, async () => { throw new Error("not a repository"); }));
  assert.equal(broken.body.branch, "unknown"); assert.equal(broken.body.commit, "");
  console.log("Dev info route: development/localhost only, branch, detached checkout, data folder and override passed");
} finally { await rm(root, { recursive: true, force: true }); }
