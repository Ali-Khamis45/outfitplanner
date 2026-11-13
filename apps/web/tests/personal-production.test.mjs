// Run after npm run build. This launches the real production server.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

if (process.env.TEST_PERSONAL_PRODUCTION_FIXTURE === "1") assert.ok(existsSync(path.resolve(process.cwd(), "../../outputs/garments/personal/manifest.json")), "fixture manifest must exist to prove production blocks it");
async function checkTraces(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await checkTraces(file);
    else if (entry.name.endsWith(".nft.json")) {
      const trace = JSON.parse(await readFile(file, "utf8"));
      assert.ok(!trace.files.some(name => name.replaceAll("\\", "/").includes("/outputs/")), `${file} must not package outputs`);
    }
  }
}
await checkTraces(path.resolve(".next/server"));

const port = await new Promise((resolve, reject) => {
  const socket = createServer(); socket.on("error", reject);
  socket.listen(0, "127.0.0.1", () => { const port = socket.address().port; socket.close(() => resolve(port)); });
});
const require = createRequire(import.meta.url);
const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(port)], { env: { ...process.env, NODE_ENV: "production" }, stdio: "ignore", windowsHide: true });
try {
  let response;
  for (let i = 0; i < 80; i++) {
    try { response = await fetch(`http://127.0.0.1:${port}/api/personal-fit`, { cache: "no-store" }); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  assert.ok(response, "production server did not start");
  assert.equal(response.status, 404, "production must never serve a personal manifest");
  for (const asset of ["body", "shirt", "pants", "shirtSidecar", "pantsSidecar"]) {
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/personal-fit?asset=${asset}`)).status, 404, `${asset} must not be served in production`);
  }
  console.log("Production personal route and all asset URLs return 404");
} finally { child.kill(); }
