// Owns its mock model, disposable wardrobe, Next server (:3100), and browser.
// Never connects to or terminates an existing app server.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exampleWardrobe } from "../lib/wardrobe/schema.ts";
import { localDate } from "../lib/planner/dates.ts";
import { completion, startMockModel, toolCall } from "./mock-stylist-model.mjs";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = "http://127.0.0.1:3100", today = localDate();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
// Refuse occupied port; never reuse or kill someone else's process.
await new Promise((resolve, reject) => { const probe = net.createServer(); probe.once("error", reject); probe.listen(3100, () => probe.close(resolve)); });
const root = await mkdtemp(path.join(os.tmpdir(), "planner-chat-browser-"));
const outputs = path.join(root, "outputs"), profile = path.join(root, "chrome");
const artifacts = path.join(app, ".next-sprint-6c-browser");
let next, chrome, socket, model, modelClosed = false;
const logs = [];
async function stopOwned(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    // PID comes only from spawn above; /T covers its own Next/browser children.
    await new Promise(resolve => { const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); killer.once("exit", resolve); killer.once("error", resolve); });
  } else child.kill("SIGTERM");
}
try {
  await mkdir(path.join(outputs, "wardrobe/photos"), { recursive: true }); await mkdir(profile); await mkdir(artifacts, { recursive: true });
  const wardrobe = exampleWardrobe();
  // Test-only image fixture; no personal wardrobe/photos or assets are touched.
  await writeFile(path.join(outputs, "wardrobe/photos/fixture.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=", "base64"));
  wardrobe.items.forEach(item => { item.photo = "outputs/wardrobe/photos/fixture.png"; });
  wardrobe.outfits.push({ id: "browser-look", name: "Coffee look", items: ["example-1", "example-3"], occasion: "casual", worn_on: [] });
  await writeFile(path.join(outputs, "wardrobe/wardrobe.json"), JSON.stringify(wardrobe));
  model = await startMockModel(body => {
    const lastUser = body.messages.findLastIndex(m => m.role === "user"), question = body.messages[lastUser].content;
    const used = body.messages.slice(lastUser + 1).filter(m => m.role === "tool").length;
    if (question.includes("cap")) return completion(null, [toolCall("get_wardrobe", {})]);
    if (!used) return completion(null, [toolCall("get_wardrobe", {})]);
    if (used === 1) return completion(null, [toolCall("show_on_avatar", { item_ids: ["example-1", "example-3"] })]);
    return completion("The navy tee and moss pants work well for a relaxed coffee break.");
  });
  const nextCli = path.resolve(app, "../../node_modules/next/dist/bin/next");
  next = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", "3100"], { cwd: app, windowsHide: true, env: { ...process.env, NEXT_DIST_DIR: ".next-sprint-6c-dev", LOCAL_WARDROBE_OUTPUTS_DIR: outputs, STYLIST_BASE_URL: model.baseUrl, STYLIST_MODEL: "scripted-local-model", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  next.stdout.on("data", bytes => logs.push(String(bytes))); next.stderr.on("data", bytes => logs.push(String(bytes)));
  next.on("error", error => logs.push(error.message));
  let ready = false;
  for (let i = 0; i < 150; i++) {
    if (next.exitCode !== null) throw new Error("Owned Next server exited: " + logs.join(""));
    try { const response = await fetch(base + "/api/wardrobe", { signal: AbortSignal.timeout(1500) }); const data = await response.json(); if (data.outfits?.[0]?.id === "browser-look") { ready = true; break; } } catch {}
    await pause(400);
  }
  assert.ok(ready, "isolated server ready: " + logs.join(""));
  console.log("Isolated Next server ready on :3100");
  const browser = [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "/usr/bin/chromium"].filter(Boolean).find(existsSync);
  assert.ok(browser, "Set CHROME_PATH to a Chromium browser");
  chrome = spawn(browser, ["--headless", "--disable-extensions", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  let port;
  for (let i = 0; i < 100; i++) { try { port = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; break; } catch { await pause(100); } }
  assert.ok(port, "owned browser started");
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(10000) })).json(); socket = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("Browser connection timed out")), 10000); socket.onopen = () => { clearTimeout(timer); resolve(); }; socket.onerror = error => { clearTimeout(timer); reject(error); }; });
  let id = 0; const pending = new Map(), browserErrors = [];
  socket.onmessage = event => { const message = JSON.parse(event.data); if (message.method === "Runtime.exceptionThrown") browserErrors.push(message.params.exceptionDetails.text); if (message.id && pending.has(message.id)) { const [resolve, reject] = pending.get(message.id); pending.delete(message.id); if (message.error) reject(new Error(message.error.message)); else resolve(message.result); } };
  socket.onclose = () => { for (const [, reject] of pending.values()) reject(new Error("Owned browser disconnected")); pending.clear(); };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const nextId = ++id; const timer = setTimeout(() => { pending.delete(nextId); reject(new Error(`Browser command timed out: ${method}`)); }, 20000); pending.set(nextId, [value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); }]); socket.send(JSON.stringify({ id: nextId, method, params })); });
  const evaluate = async expression => { const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ": " + expression); return result.result.value; };
  const waitFor = async (expression, description) => { for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await pause(150); } throw new Error("Timed out: " + description + "\n" + await evaluate("document.body.innerText")); };
  const clickText = text => evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}).click()`);
  const setValue = (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`);
  const screenshot = async name => { const result = await send("Page.captureScreenshot", { format: "png" }); await writeFile(path.join(artifacts, name), Buffer.from(result.data, "base64")); };
  await send("Page.enable"); await send("Runtime.enable");
  // The real weather route is tested separately. Browser fixtures return weather
  // for today only, to verify all other dates show no invented values.
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `const originalFetch = window.fetch.bind(window); window.fetch = (url, options) => { if (String(url) === '/api/stylist/get_weather') { const args = JSON.parse(options.body); return Promise.resolve(new Response(JSON.stringify(args.date === ${JSON.stringify(today)} ? { date: args.date, city: 'Cairo', condition: 'Clear', temperature_min_c: 18, temperature_max_c: 27, attribution: 'Scripted test weather' } : { error: 'Date unavailable' }), { status: args.date === ${JSON.stringify(today)} ? 200 : 502, headers: { 'Content-Type': 'application/json' } })); } return originalFetch(url, options).then(response => { if (String(url) === '/api/stylist/chat' && !options?.method) window.__stylistReady = true; return response; }); };` });
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: base + "/planner" }); await waitFor("document.querySelectorAll('.planner-day').length === 7", "seven days");
  console.log("Planner loaded; testing assignments and persistence");
  await waitFor("document.querySelectorAll('.planner-weather').length === 1", "only covered weather shown");
  await evaluate(`document.querySelector('[data-date="${today}"] .planner-assign').click()`);
  await waitFor("!!document.querySelector('[aria-label=\"Saved outfit\"]')", "outfit picker");
  await setValue('[aria-label="Saved outfit"]', "browser-look"); await clickText("Save plan");
  await waitFor("document.body.innerText.includes('Plan saved.')", "saved plan");
  await send("Page.reload"); await waitFor(`document.querySelector('[data-date="${today}"]')?.innerText.includes('Navy everyday tee')`, "plan persists after reload");
  await waitFor("[...document.querySelectorAll('.look-thumbnail img')].every(i => i.complete && i.naturalWidth > 0)", "planner thumbnails loaded");
  await clickText("Wear it"); await waitFor("document.body.innerText.includes('Wear recorded')", "wear confirmation");
  const worn = JSON.parse(await readFile(path.join(outputs, "wardrobe/wardrobe.json"), "utf8")); assert.equal(worn.items[0].times_worn, 1);
  assert.match(await evaluate(`document.querySelector('[data-date="${today}"] a').getAttribute('href')`), /\/try-on\?top=example-1&bottom=example-3/);
  await evaluate("[...document.querySelectorAll('.planner-day')].find(d => !d.hasAttribute('aria-current')).querySelector('.planner-assign').click()");
  await setValue('[aria-label="Top"]', "example-2"); await setValue('[aria-label="Bottom"]', "example-4"); await clickText("Save plan"); await waitFor("document.querySelectorAll('.planner-day .look-items').length === 2", "manual top/bottom saved");
  await screenshot("planner-desktop.png");
  await evaluate("document.querySelector('[aria-label=\"Next week\"]').click()"); await waitFor("document.querySelectorAll('.planner-weather').length === 0 && document.querySelectorAll('.planner-assign').length === 7", "next week and no invented forecast");
  await evaluate("document.querySelector('[aria-label=\"Previous week\"]').click()"); await waitFor("document.querySelectorAll('.planner-day .look-items').length === 2", "previous week persisted");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true, "planner mobile fits"); await screenshot("planner-mobile.png");
  await send("Page.navigate", { url: base + "/stylist" }); await waitFor("!!document.querySelector('#stylist-message') && window.__stylistReady", "hydrated chat screen");
  console.log("Stylist loaded; testing scripted tool calls and recommendation cards");
  await setValue("#stylist-message", "Choose a casual coffee look."); await clickText("Send");
  await waitFor("document.querySelectorAll('.stylist-recommendation').length === 1", "recommendation card");
  assert.equal(await evaluate("document.querySelector('.stylist-recommendation a').getAttribute('href')"), "/try-on?top=example-1&bottom=example-3");
  assert.ok(await evaluate("document.querySelector('.stylist-recommendation').innerText.includes('relaxed coffee break')"));
  assert.ok(await evaluate("document.querySelector('.stylist-chip').textContent.includes('Checked wardrobe')"));
  await waitFor("document.querySelectorAll('.stylist-recommendation img').length === 2 && [...document.querySelectorAll('.stylist-recommendation img')].every(i => i.complete && i.naturalWidth > 0)", "card thumbnails rendered");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true, "stylist mobile fits"); await screenshot("stylist-mobile.png");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }); await screenshot("stylist-desktop.png");
  const initialRequests = model.requests.length;
  await setValue("#stylist-message", "Exercise the cap."); await clickText("Send"); await waitFor("document.body.innerText.includes('Stopped after 6 tool rounds')", "cap state");
  assert.equal(model.requests.length - initialRequests, 7);
  await model.close(); modelClosed = true;
  await setValue("#stylist-message", "Can you suggest another look?"); await clickText("Send");
  await waitFor("document.body.innerText.includes('Stylist model not connected yet')", "offline state");
  assert.ok(await evaluate("document.body.innerText.includes('STYLIST_BASE_URL=') && document.body.innerText.includes('STYLIST_MODEL=')"));
  assert.equal(await evaluate("document.querySelectorAll('.stylist-answer').length"), 1, "no invented replies after cap or disconnect");
  await send("Page.reload"); await waitFor("document.body.innerText.includes('Stylist model not connected yet')", "offline state on opening chat");
  assert.deepEqual(browserErrors, []);
  console.log("PASS :3100 browser: planner persistence, seven days, navigation, outfit + manual selection, covered weather only, wear logging, try-on URLs, chat loop/chips/cards/thumbnails, six-round cap, offline env guidance, mobile layout");
} finally {
  socket?.close(); await stopOwned(chrome); await stopOwned(next); if (model && !modelClosed) await model.close();
  await writeFile(path.join(artifacts, "server.log"), logs.join("")).catch(() => {});
  // Only remove our own mkdtemp directory, verified inside the temporary root.
  if (path.dirname(path.resolve(root)) === path.resolve(os.tmpdir()) && path.basename(root).startsWith("planner-chat-browser-")) await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
