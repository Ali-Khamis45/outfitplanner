// Measure a fresh production page. Start `next start -p 3013` first.
// Usage: node tests/try-on-performance.mjs desktop|4g [url]
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const profileName = process.argv[2] ?? "desktop";
assert.ok(["desktop", "4g"].includes(profileName));
const url = process.argv[3] ?? "http://localhost:3013/try-on";
const browser = [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "/usr/bin/chromium", "/usr/bin/google-chrome"].filter(Boolean).find(existsSync);
assert.ok(browser, "Set CHROME_PATH to a Chromium executable");
const tempRoot = path.resolve(os.tmpdir()), profile = await mkdtemp(path.join(tempRoot, "vw-perf-browser-"));
assert.ok(profile.startsWith(`${tempRoot}${path.sep}vw-perf-browser-`));
const chrome = spawn(browser, ["--headless", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-extensions", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore", windowsHide: true });
try {
  let port;
  for (let i = 0; i < 100; i++) { try { port = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); } }
  assert.ok(port, "Chromium did not start");
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const socket = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 0;
  const pending = new Map(), requests = new Map();
  socket.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.method === "Network.requestWillBeSent") requests.set(msg.params.requestId, { url: msg.params.request.url, method: msg.params.request.method, bytes: null });
    if (msg.method === "Network.loadingFinished") { const item = requests.get(msg.params.requestId); if (item) item.bytes = msg.params.encodedDataLength; }
    if (msg.id && pending.has(msg.id)) { const [resolve, reject] = pending.get(msg.id); pending.delete(msg.id); if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, [resolve, reject]); socket.send(JSON.stringify({ id, method, params })); });
  await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true }); await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  if (profileName === "4g") await send("Network.emulateNetworkConditions", { offline: false, latency: 80, downloadThroughput: 4_000_000 / 8, uploadThroughput: 1_000_000 / 8, connectionType: "cellular4g" });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    window.__tryOnAvatarFrame = null; window.__tryOnOutfitFrame = null;
    const seen = new Set(), expected = [110622, 365940, 487296];
    let avatarScheduled = false, outfitScheduled = false;
    for (const type of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!type || !Object.hasOwn(type.prototype, 'drawElements')) continue;
      const original = type.prototype.drawElements;
      type.prototype.drawElements = function(mode, count, ...args) {
        const result = original.call(this, mode, count, ...args);
        if (!expected.includes(count) || this.getParameter(this.FRAMEBUFFER_BINDING) !== null) return result;
        const viewport = this.canvas.closest('.try-viewport');
        if (!viewport || Number(getComputedStyle(viewport).opacity) <= 0.01) return result;
        seen.add(count);
        if (count === expected[0] && !avatarScheduled) { avatarScheduled = true; requestAnimationFrame(() => { window.__tryOnAvatarFrame = performance.now(); }); }
        if (expected.every(n => seen.has(n)) && !outfitScheduled) { outfitScheduled = true; requestAnimationFrame(() => { window.__tryOnOutfitFrame = performance.now(); }); }
        return result;
      };
    }
  })()` });
  await send("Page.navigate", { url });
  let avatarFrame = null, outfitFrame = null, allAssets = false;
  for (let i = 0; i < 600; i++) {
    const data = (await send("Runtime.evaluate", { expression: "[window.__tryOnAvatarFrame ?? null, window.__tryOnOutfitFrame ?? null]", returnByValue: true })).result.value;
    [avatarFrame, outfitFrame] = data ?? [];
    const finished = [...requests.values()].filter(item => item.method === "GET" && item.bytes !== null).map(item => item.url);
    allAssets = ["/api/demo-avatar", "variant=v5.2", "variant=pants-v2"].every(part => finished.some(item => item.includes(part) && !item.includes("sidecar=1")));
    if (avatarFrame != null && outfitFrame != null && allAssets) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(avatarFrame != null, "a visible avatar draw was not observed"); assert.ok(outfitFrame != null, "all three visible meshes were not observed"); assert.ok(allAssets, "all three GLBs must complete");
  await new Promise(resolve => setTimeout(resolve, 1000));
  const timings = (await send("Runtime.evaluate", { expression: `performance.getEntriesByType('resource').filter(e => ['/api/demo-avatar','variant=v5.2','variant=pants-v2'].some(part => e.name.includes(part)) && !e.name.includes('sidecar=1')).map(e => ({name:e.name,start:Math.round(e.startTime),end:Math.round(e.responseEnd)}))`, returnByValue: true })).result.value;
  const message = (await send("Runtime.evaluate", { expression: "document.querySelector('.try-message')?.textContent ?? null", returnByValue: true })).result.value;
  assert.equal(message, null, `page reported a garment error: ${message}`);
  const completed = [...requests.values()].filter(item => item.bytes !== null && item.url.startsWith(new URL(url).origin));
  const transferBytes = completed.reduce((sum, item) => sum + item.bytes, 0);
  console.log(JSON.stringify({ profile: profileName, avatarFrameMs: Math.round(avatarFrame), outfitFrameMs: Math.round(outfitFrame), glbTimings: timings, transferBytes, requests: completed.map(({ url: resource, method, bytes }) => ({ path: new URL(resource).pathname + new URL(resource).search, method, bytes })) }, null, 2));
  socket.close();
} finally {
  chrome.kill();
  await new Promise(resolve => { if (chrome.exitCode !== null) resolve(); else { chrome.once("exit", resolve); setTimeout(resolve, 2000); } });
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
