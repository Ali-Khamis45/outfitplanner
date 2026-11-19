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
  if (process.env.TEST_FIT_SIZES === "1" || process.env.TEST_PERSONAL_SIZE_SWITCH === "1") await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__fitShaders = []; window.__easeDraws = [];
    for (const p of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      const source = p.shaderSource, compile = p.compileShader, data = p.bufferData, pointer = p.vertexAttribPointer, location = p.getAttribLocation, draw = p.drawElements;
      const buffers = new WeakMap(), locations = new WeakMap(), bindings = new WeakMap();
      p.shaderSource = function(s, text) { if (text.includes('vEaseMm')) s.__fit = true; return source.call(this, s, text); };
      p.compileShader = function(s) { compile.call(this, s); if (s.__fit) window.__fitShaders.push({ok: this.getShaderParameter(s, this.COMPILE_STATUS), log: this.getShaderInfoLog(s)}); };
      p.bufferData = function(target, value, ...rest) { if (target === this.ARRAY_BUFFER && ArrayBuffer.isView(value)) { const buffer = this.getParameter(this.ARRAY_BUFFER_BINDING); if (buffer) buffers.set(buffer, Array.from(new Float32Array(value.buffer, value.byteOffset, Math.floor(value.byteLength / 4))).slice(0, 16)); } return data.call(this, target, value, ...rest); };
      p.getAttribLocation = function(program, name) { const result = location.call(this, program, name); if (name.toLowerCase() === '_ease_mm') locations.set(program, result); return result; };
      p.vertexAttribPointer = function(index, ...args) { bindings.set(this, { ...(bindings.get(this) || {}), [index]: this.getParameter(this.ARRAY_BUFFER_BINDING) }); return pointer.call(this, index, ...args); };
      p.drawElements = function(...args) { const program = this.getParameter(this.CURRENT_PROGRAM), index = locations.get(program), buffer = bindings.get(this)?.[index], values = buffers.get(buffer); if (index !== undefined && values) { const signature = JSON.stringify(values); if (!window.__easeDraws.includes(signature)) window.__easeDraws.push(signature); } return draw.call(this, ...args); };
    }` });
  if (process.env.TEST_PERSONAL_SIZE_SWITCH === "1" || process.env.TEST_PERSONAL_SIZE_FALLBACK === "1") await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__personalFixtureRequests = [];
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.pathname === '/api/personal-fit') {
        window.__personalFixtureRequests.push(url.searchParams.get('asset') || 'manifest');
        if (!url.searchParams.has('asset')) return Response.json({body:'/api/personal-fit?asset=body',shirt:'/api/personal-fit?asset=shirt',pants:'/api/personal-fit?asset=pants',shirtSidecar:null,pantsSidecar:null,bodyId:'fixture_personal'});
        if (url.searchParams.get('asset') === 'body') return originalFetch('/api/demo-avatar', init);
        if (url.searchParams.get('asset') === 'shirt') return originalFetch('/api/demo-garment?variant=v5.3', init);
        if (url.searchParams.get('asset') === 'pants') return originalFetch('/api/demo-garment?variant=pants-v3', init);
      }
      if (url.pathname === '/api/size-garment' && url.searchParams.get('body') === 'fixture_personal') {
        await new Promise(resolve => setTimeout(resolve, 600));
        if (${JSON.stringify(process.env.TEST_PERSONAL_SIZE_FALLBACK === '1')}) return Response.json([]);
        const slot = url.searchParams.get('slot');
        const response = await originalFetch('/api/size-garment?body=neutral&slot=' + slot + '&fixtures=1', init);
        const options = await response.json();
        return Response.json(options.map(option => ({...option, fit:{...option.fit,body:'fixture_personal'}, glb:option.glb + '&test-personal=1', sidecar:option.sidecar + '&test-personal=1'})));
      }
      return originalFetch(input, init);
    };` });
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: process.env.TRY_ON_URL ?? "http://localhost:3000/try-on" });
  await waitFor("!!document.querySelector('.try-stage-loading') && getComputedStyle(document.querySelector('.try-viewport')).position === 'absolute'", "styled loading indicator");
  const initialStage = await evaluate("(() => { const r = document.querySelector('.try-stage').getBoundingClientRect(); return [r.width, r.height]; })()");
  let loaded = false;
  for (let i = 0; i < 80; i++) {
    loaded = await evaluate("!!document.querySelector('canvas') && !document.body.innerText.includes('Preparing your fitting room') && !!document.querySelector('[aria-label=\"Top: Ocean\"]')");
    if (loaded && requests.some(url => url.includes("variant=v5.3&sidecar=1")) && requests.some(url => url.includes("variant=pants-v3&sidecar=1"))) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(loaded, "Try-on did not finish loading");
  assert.deepEqual(await evaluate("(() => { const r = document.querySelector('.try-stage').getBoundingClientRect(); return [r.width, r.height]; })()"), initialStage, "loading must not change stage dimensions");
  if (process.env.TEST_REAL_CLAMPED === "1") {
    await waitFor("!!document.querySelector('[aria-label=\"Top fit\"] button[aria-label=\"S\"]:not(:disabled)')", "real shirt sizes");
    await evaluate("document.querySelector('[aria-label=\"Top fit\"] button[aria-label=\"S\"]').click()");
    await waitFor("document.querySelector('[aria-label=\"Top fit\"] .fit-clamped-warning')?.textContent === 'Too small for this body. Shown at the closest wearable fit.' && document.querySelectorAll('[aria-label=\"Top fit\"] .fit-estimate-note').length === 4", "real S clamped messages");
    assert.ok(await evaluate("[...document.querySelectorAll('[aria-label=\"Top fit\"] .fit-estimate-note')].every(e => e.textContent.trim() === 'estimated from size chart')"));
    console.log("Real S fit displays the full warning and four region notes");
  }
  if (process.env.TEST_FIT_SIZES === "1") {
    await waitFor("document.querySelector('[aria-label=\"Top fit\"] button[aria-pressed=\"true\"]')?.textContent === 'M' && document.querySelector('[aria-label=\"Bottom fit\"] button[aria-pressed=\"true\"]')?.textContent === 'M'", "recommended sizes");
    assert.ok(await evaluate("document.querySelector('[aria-label=\"Top fit\"] button[aria-label=\"M, Recommended\"]') && document.body.innerText.includes('Chest: good, 10.0 cm ease')"));
    await evaluate("document.querySelector('.fit-heatmap input').click()");
    await waitFor("window.__easeDraws.length > 0", "rendered M ease attribute");
    const initialEase = await evaluate("window.__easeDraws.slice()");
    await evaluate("document.querySelector('[aria-label=\"Top fit\"] button[aria-label=\"S\"]').click()");
    await waitFor("document.querySelector('[aria-label=\"Top fit\"] button[aria-label=\"S\"]').getAttribute('aria-pressed') === 'true' && document.body.innerText.includes('Chest: tight, 6.2 cm ease (min 7.6 cm)') && window.__easeDraws.length > " + initialEase.length, "rendered S ease attribute");
    assert.ok((await evaluate("window.__easeDraws")).some(signature => !initialEase.includes(signature)), "rendered S ease values differ from M");
    assert.ok(await evaluate("!!document.querySelector('[aria-label=\"Top fit\"] button[aria-label=\"M, Recommended\"] .fit-recommended-dot')"), "recommended marker remains on M when S is selected");
    assert.ok((await evaluate("window.__fitShaders")).every(shader => shader.ok), "heatmap shaders compile successfully");
    assert.ok(requests.some(url => url.includes("size=S") && url.includes("asset=glb")), "selected size GLB requested");
    console.log("Recommended sizes, size selection, fit summary and heatmap shader passed");
  }
  if (process.env.TEST_PERSONAL_SIZE_SWITCH === "1") {
    await waitFor("document.querySelector('[aria-label=\"Top fit\"] button[aria-pressed=\"true\"]')?.textContent === 'M' && document.querySelector('[aria-label=\"Bottom fit\"] button[aria-pressed=\"true\"]')?.textContent === 'M'", "neutral fixture sizes");
    await evaluate("document.querySelector('.fit-heatmap input').click()");
    await waitFor("window.__easeDraws.length >= 2", "neutral heatmap draws");
    await evaluate("window.__easeDraws = []; [...document.querySelectorAll('button')].find(e => e.textContent.includes('My avatar')).click()");
    await waitFor("!!document.querySelector('.try-avatar-options button.selected')?.textContent.includes('My avatar') && !document.querySelector('.try-stage-loading') && window.__easeDraws.length >= 2", "personal size heatmaps without toggling");
    assert.ok(await evaluate("document.querySelector('.fit-heatmap input').checked"), "heatmap stays enabled across avatars");
    assert.ok(!(await evaluate("document.body.innerText.includes('could not be fitted')")), "personal fixture garments bind");
    assert.deepEqual(await evaluate("window.__personalFixtureRequests.filter(asset => asset === 'shirt' || asset === 'pants')"), [], "base personal GLBs must not be requested when sizes exist");
    for (const slot of ["top", "bottom"]) assert.ok(requests.some(url => url.includes(`slot=${slot}`) && url.includes('size=M') && url.includes('asset=glb') && url.includes('test-personal=1')), `${slot} personal size must load`);
    const personalEase = await evaluate("window.__easeDraws.slice()");
    await evaluate("document.querySelector('[aria-label=\"Top fit\"] button[aria-label=\"S\"]').click()");
    await waitFor("document.querySelector('[aria-label=\"Top fit\"] button[aria-label=\"S\"]').getAttribute('aria-pressed') === 'true' && window.__easeDraws.length > " + personalEase.length, "personal size change retains heatmap");
    assert.ok(requests.some(url => url.includes('size=S') && url.includes('asset=glb') && url.includes('test-personal=1')), "changed personal size GLB requested");
    assert.deepEqual(await evaluate("window.__personalFixtureRequests.filter(asset => asset === 'shirt' || asset === 'pants')"), [], "changing size must not request base personal GLBs");
    console.log("Heatmap survives avatar and size changes; size fits skip base personal GLBs");
  }
  if (process.env.TEST_PERSONAL_SIZE_FALLBACK === "1") {
    await evaluate("[...document.querySelectorAll('button')].find(e => e.textContent.includes('My avatar')).click()");
    await waitFor("!!document.querySelector('.try-avatar-options button.selected')?.textContent.includes('My avatar') && !document.querySelector('.try-stage-loading')", "personal base fallback");
    assert.deepEqual((await evaluate("window.__personalFixtureRequests.filter(asset => asset === 'shirt' || asset === 'pants')")).sort(), ["pants", "shirt"]);
    assert.ok(!(await evaluate("document.body.innerText.includes('could not be fitted')")), "base personal garments must bind");
    console.log("Personal base garments load when size fits are unavailable");
  }
  if (process.env.TEST_PERSONAL_FALLBACK === "1") {
    await evaluate("[...document.querySelectorAll('button')].find(e => e.textContent.includes('My avatar')).click()");
    await waitFor("document.body.innerText.includes('No personal fit found') && !!document.querySelector('#try-avatar-file')", "personal fallback");
    console.log("Missing personal fit offers local-file fallback");
  }
  if (process.env.TEST_PERSONAL_FIT === "1") {
    await evaluate("[...document.querySelectorAll('button')].find(e => e.textContent.includes('My avatar')).click()");
    await waitFor("!!document.querySelector('.try-avatar-options button.selected')?.textContent.includes('My avatar') && !document.querySelector('.try-stage-loading')", "personal fit");
    assert.ok(requests.some(url => url.includes("/api/personal-fit?asset=body")), "personal body was not loaded");
    for (const [slot, asset] of [["top", "shirt"], ["bottom", "pants"]]) {
      const hasSizes = await evaluate(`!!document.querySelector('[aria-label="${slot === "top" ? "Top" : "Bottom"} fit"] button[aria-pressed="true"]')`);
      if (hasSizes) {
        assert.ok(requests.some(url => url.includes("asset=glb") && url.includes(`slot=${slot}`)), `${slot} size garment was not loaded`);
        assert.ok(!requests.some(url => new URL(url).pathname === "/api/personal-fit" && new URL(url).searchParams.get("asset") === asset), `${slot} base garment should not be loaded`);
      } else assert.ok(requests.some(url => url.includes(`/api/personal-fit?asset=${asset}`)), `${asset} base garment was not loaded`);
    }
    assert.ok(!(await evaluate("document.body.innerText.includes('could not be fitted')")), "personal garments must bind");
    console.log("Personal body and selected size or base garments loaded together");
  }
  for (const variant of ["v5.3", "pants-v3"]) assert.ok(requests.some(url => url.includes(`variant=${variant}&sidecar=1`)), `${variant} sidecar not requested`);
  if (process.env.TEST_REAL_CLAMPED !== "1" && process.env.TEST_PERSONAL_SIZE_SWITCH !== "1" && process.env.TEST_PERSONAL_SIZE_FALLBACK !== "1") {
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
  if (process.env.TEST_FIT_SIZES === "1" || process.env.TEST_REAL_CLAMPED === "1") {
    await waitFor("!!document.querySelector('.lab-fit-controls input')", "lab fit controls");
    await evaluate("document.querySelector('.lab-fit-controls input').click()");
  }
  await waitFor("document.querySelector('#garment-select')?.value === 'v5.3' && document.querySelector('#pants-select')?.value === 'pants-v3' && document.body.innerText.includes('corr_L_add20')", "lab defaults and v5.2 targets");
  await evaluate("(()=>{const e=document.querySelector('#garment-select'); e.value='v5.1'; e.dispatchEvent(new Event('change',{bubbles:true})); return true})()");
  await waitFor("document.querySelector('#garment-select')?.value === 'v5.1' && document.body.innerText.includes('corr_L_hip90') && !document.body.innerText.includes('corr_L_add20')", "v5.1 selection");
  await waitFor("!![...document.querySelectorAll('label')].find(e=>e.innerText.includes('Load pants'))?.querySelector('input:not(:disabled)')", "pants availability");
  await evaluate("(()=>{[...document.querySelectorAll('label')].find(e=>e.innerText.includes('Load pants')).querySelector('input').click(); return true})()");
  await waitFor("document.querySelector('#pants-heading')?.parentElement?.parentElement?.innerText.includes('corr_L_knee90')", "pants v2 targets");
  for (const variant of ["v5.1", "pants-v2"]) {
    const version = await evaluate(`fetch('/api/demo-garment?variant=${variant}&sidecar=1',{cache:'no-store'}).then(r=>r.json()).then(v=>v.version)`);
    assert.equal(version, 2, `${variant} must serve the re-issued signed sidecar`);
  }
  console.log("Lab v5.3 default, v5.1 selection and signed pants sidecar passed");
  }
  socket.close();
} finally {
  chrome.kill();
  await new Promise(resolve => { if (chrome.exitCode !== null) resolve(); else { chrome.once("exit", resolve); setTimeout(resolve, 2000); } });
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
