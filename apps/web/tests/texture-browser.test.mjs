// Optional integration check: generate texture fixtures and start the web server, then run npm run test:texture-browser.
// CHROME_PATH can point to a Chromium executable; TRY_ON_URL can override localhost:3000.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
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
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${process.env.TRY_ON_URL ?? "http://localhost:3000/try-on"}?texture-fixture=1` });
  await waitFor("!!document.querySelector('[aria-label=\"Top: Original\"]') && !document.body.innerText.includes('Preparing your fitting room')", "fixture scene");
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Top: Original\"]').getAttribute('aria-pressed')"), "true");
  async function sampleFrame(points = [[397,270],[395,255],[395,290],[380,290]]) {
    const screenshot = await send("Page.captureScreenshot", { format: "png" });
    return evaluate(`(async () => { const image = new Image(); image.src = 'data:image/png;base64,${screenshot.data}'; await image.decode(); const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); return ${JSON.stringify(points)}.map(([x,y]) => Array.from(ctx.getImageData(x,y,1,1).data).slice(0,3)); })()`);
  }
  const red = ([r,g,b]) => r > 150 && r > g * 1.5 && r > b * 1.6;
  const light = ([r,g,b]) => r > 150 && g > 150 && b > 150;
  let pixels;
  for (let i = 0; i < 40; i++) { pixels = await sampleFrame(); if (red(pixels[0])) break; await new Promise(resolve => setTimeout(resolve, 250)); }
  assert.ok(red(pixels[0]), `front chest logo should render red, got ${pixels[0]}`);
  assert.ok(light(pixels[1]) && red(pixels[2]) && light(pixels[3]), `logo F must be upright: ${JSON.stringify(pixels)}`);
  const blue = ([r,g,b]) => b > r * 1.25 && b > g * 1.1;
  const hem = await sampleFrame([[340,380], [340,410], [340,435]]);
  assert.ok(blue(hem[0]) && light(hem[1]) && blue(hem[2]), `shirt hem stripes should remain spaced: ${JSON.stringify(hem)}`);
  await evaluate("Array.from(document.querySelectorAll('.try-camera button')).find(b => b.textContent === 'Back').click()");
  await new Promise(resolve => setTimeout(resolve, 1500));
  const back = await sampleFrame(Array.from({ length: 21 * 23 }, (_, i) => [300 + (i % 21) * 8, 220 + Math.floor(i / 21) * 10]));
  assert.ok(back.every(pixel => !red(pixel)), "back of shirt must not contain the red logo");
  const seat = await sampleFrame([[340,460], [340,470], [340,490], [340,500], [380,480], [380,500]]);
  assert.ok(seat.filter(blue).length >= 4 && seat.filter(light).length >= 2, `pants seat should be striped without a blank patch: ${JSON.stringify(seat)}`);
  await evaluate("Array.from(document.querySelectorAll('.try-camera button')).find(b => b.textContent === 'Front').click()");
  await new Promise(resolve => setTimeout(resolve, 1500));
  await evaluate("document.querySelector('[aria-label=\"Top: Ocean\"]').click()");
  await waitFor("document.querySelector('[aria-label=\"Top: Ocean\"]').getAttribute('aria-pressed') === 'true'", "flat swatch");
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.ok(!red((await sampleFrame())[0]), "explicit swatch replaces the logo with flat colour");
  await evaluate("document.querySelector('[aria-label=\"Top: Original\"]').click()");
  for (let i = 0; i < 40; i++) { pixels = await sampleFrame(); if (red(pixels[0])) break; await new Promise(resolve => setTimeout(resolve, 250)); }
  assert.ok(red(pixels[0]), "Original restores the texture");
  console.log("Upright front logo, clean back, striped seat and hem, swatch and Original restore passed");
} finally {
  chrome.kill();
  await new Promise(resolve => { if (chrome.exitCode !== null) resolve(); else { chrome.once("exit", resolve); setTimeout(resolve, 2000); } });
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
