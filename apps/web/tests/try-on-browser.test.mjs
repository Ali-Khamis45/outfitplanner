// Optional integration check: start the web server first, then run npm run test:try-on-browser.
// CHROME_PATH can point to a Chromium executable; TRY_ON_URL can override localhost:3000.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const candidates = [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "/usr/bin/chromium", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].filter(Boolean);
const browser = candidates.find(candidate => existsSync(candidate));
assert.ok(browser, "Set CHROME_PATH to a Chromium executable");
const tempRoot = path.resolve(os.tmpdir());
const profile = await mkdtemp(path.join(tempRoot, "vw-try-on-browser-"));
assert.ok(profile.startsWith(`${tempRoot}${path.sep}vw-try-on-browser-`));
const chrome = spawn(browser, ["--headless", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-extensions", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore", windowsHide: true });
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.ok(port, "Chromium did not start");
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const socket = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 0;
  const pending = new Map(), requests = [];
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === "Network.requestWillBeSent") requests.push(message.params.request.url);
    if (message.id && pending.has(message.id)) {
      const [resolve, reject] = pending.get(message.id); pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, [resolve, reject]); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
  async function waitFor(expression, label) {
    for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 250)); }
    throw new Error(`Timed out: ${label}`);
  }
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: process.env.TRY_ON_URL ?? "http://localhost:3000/try-on" });
  let loaded = false;
  for (let i = 0; i < 80; i++) {
    loaded = await evaluate("!!document.querySelector('canvas') && !document.body.innerText.includes('Preparing your fitting room') && !!document.querySelector('[aria-label=\"Top: Ocean\"]')");
    if (loaded && requests.some(url => url.includes("variant=v5.2&sidecar=1")) && requests.some(url => url.includes("variant=pants-v2&sidecar=1"))) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(loaded, "Try-on did not finish loading");
  for (const variant of ["v5.2", "pants-v2"]) assert.ok(requests.some(url => url.includes(`variant=${variant}&sidecar=1`)), `${variant} sidecar not requested`);
  await evaluate("window.__tryOnTestCanvas = document.querySelector('canvas'); true");
  const sizes = [[390, 844], [1024, 844], [1440, 900], [390, 844], [844, 390]];
  for (const [index, [width, height]] of sizes.entries()) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await new Promise(resolve => setTimeout(resolve, 1000));
    const state = await evaluate(`(() => { const box = e => { const r=e.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height}; }; const c=document.querySelector('canvas'), g=c?.getContext('webgl2'); return {innerWidth, stage:box(document.querySelector('.try-stage')), canvas:box(c), panel:box(document.querySelector('.try-panel')), bar:box(document.querySelector('.try-camera')), sameCanvas:c===window.__tryOnTestCanvas, buffer:[c.width,c.height], drawing:g ? [g.drawingBufferWidth,g.drawingBufferHeight] : null}; })()`);
    assert.equal(state.innerWidth, width);
    assert.ok(state.sameCanvas, "resize must not replace the canvas");
    assert.ok(Math.abs(state.canvas.width - state.stage.width) < 1 && Math.abs(state.canvas.height - state.stage.height) < 1, "canvas must fill stage");
    assert.ok(Math.abs(state.buffer[0] - state.canvas.width) <= 2 && Math.abs(state.buffer[1] - state.canvas.height) <= 2, "drawing buffer must resize");
    assert.deepEqual(state.buffer, state.drawing, "WebGL drawing buffer must match the canvas");
    if (width <= 800 || height <= 500) assert.ok(state.panel.top >= state.stage.bottom - 1, "stacked panel must follow stage");
    assert.ok(state.stage.bottom - state.bar.bottom <= 15, "view bar must remain at the stage edge");
    if (process.env.TRY_ON_SCREENSHOTS) {
      const screenshot = await send("Page.captureScreenshot", { format: "png" });
      await writeFile(path.join(process.env.TRY_ON_SCREENSHOTS, `${index}-${width}x${height}.png`), Buffer.from(screenshot.data, "base64"));
    }
    console.log(`${width}x${height}: canvas and renderer follow the stage`);
  }
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: new URL("/lab", process.env.TRY_ON_URL ?? "http://localhost:3000/try-on").href });
  await waitFor("document.querySelector('#garment-select')?.value === 'v5.2' && document.querySelector('#pants-select')?.value === 'pants-v2' && document.body.innerText.includes('corr_L_add20')", "lab defaults and v5.2 targets");
  await evaluate("(()=>{const e=document.querySelector('#garment-select'); e.value='v5.1'; e.dispatchEvent(new Event('change',{bubbles:true})); return true})()");
  await waitFor("document.querySelector('#garment-select')?.value === 'v5.1' && document.body.innerText.includes('corr_L_hip90') && !document.body.innerText.includes('corr_L_add20')", "v5.1 selection");
  await waitFor("!![...document.querySelectorAll('label')].find(e=>e.innerText.includes('Load pants'))?.querySelector('input:not(:disabled)')", "pants availability");
  await evaluate("(()=>{[...document.querySelectorAll('label')].find(e=>e.innerText.includes('Load pants')).querySelector('input').click(); return true})()");
  await waitFor("document.querySelector('#pants-heading')?.parentElement?.parentElement?.innerText.includes('corr_L_knee90')", "pants v2 targets");
  for (const variant of ["v5.1", "pants-v2"]) {
    const version = await evaluate(`fetch('/api/demo-garment?variant=${variant}&sidecar=1',{cache:'no-store'}).then(r=>r.json()).then(v=>v.version)`);
    assert.equal(version, 2, `${variant} must serve the re-issued signed sidecar`);
  }
  console.log("Lab v5.2 default, v5.1 selection and signed pants sidecar passed");
  socket.close();
} finally {
  chrome.kill();
  await new Promise(resolve => { if (chrome.exitCode !== null) resolve(); else { chrome.once("exit", resolve); setTimeout(resolve, 2000); } });
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
