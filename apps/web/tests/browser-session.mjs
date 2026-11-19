import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function browserSession() {
  const browser = [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "/usr/bin/chromium"].filter(Boolean).find(existsSync);
  assert.ok(browser, "Set CHROME_PATH to Chromium");
  const temp = path.resolve(os.tmpdir()), profile = await mkdtemp(path.join(temp, "vw-redesign-"));
  const chrome = spawn(browser, ["--headless", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-extensions", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore", windowsHide: true });
  let socket;
  const close = async () => {
    socket?.close(); chrome.kill();
    await new Promise(resolve => { if (chrome.exitCode !== null) resolve(); else { chrome.once("exit", resolve); setTimeout(resolve, 2000); } });
    assert.ok(path.dirname(path.resolve(profile)) === temp && path.basename(profile).startsWith("vw-redesign-"));
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  try {
    let port;
    for (let i = 0; i < 100; i++) { try { port = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; break; } catch { await new Promise(r => setTimeout(r, 100)); } }
    assert.ok(port, "Chromium did not start");
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(tabs.find(tab => tab.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let id = 0;
    const pending = new Map(), errors = [];
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
      if (pending.has(message.id)) { const { resolve, reject, timer } = pending.get(message.id); clearTimeout(timer); pending.delete(message.id); if (message.error) reject(new Error(message.error.message)); else resolve(message.result); }
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => { const next = ++id; const timer = setTimeout(() => { pending.delete(next); reject(new Error(`CDP timeout: ${method}`)); }, 30000); pending.set(next, { resolve, reject, timer }); socket.send(JSON.stringify({ id: next, method, params })); });
    const evaluate = async expression => { const value = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description); return value.result.value; };
    const waitFor = async (expression, label) => { for (let i = 0; i < 120; i++) { if (await evaluate(`Boolean(${expression})`)) return; await new Promise(r => setTimeout(r, 250)); } throw new Error(`Timed out: ${label}`); };
    const screenshot = async name => { const dir = path.resolve(".codex-garment-check/redesign"); await mkdir(dir, { recursive: true }); await writeFile(path.join(dir, `${name}.png`), Buffer.from((await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })).data, "base64")); };
    await send("Page.enable"); await send("Runtime.enable");
    return { send, evaluate, waitFor, screenshot, close, errors };
  } catch (error) { await close(); throw error; }
}
