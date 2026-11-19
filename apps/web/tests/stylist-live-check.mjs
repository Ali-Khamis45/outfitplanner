// Opt-in local check. Prints/writes status and timings only, never model content.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { localModelUrl } from "../lib/stylist/chat.ts";
import { browserSession } from "./browser-session.mjs";

nextEnv.loadEnvConfig(process.cwd(), true);
const endpoint = localModelUrl(process.env.STYLIST_BASE_URL || "http://localhost:11434/v1"), model = process.env.STYLIST_MODEL;
assert.ok(model && !model.includes(":cloud"), "Configure a local model first");
const samples = [];
for (const mode of ["warmup", "off", "on", "off", "on"]) {
  const started = performance.now();
  const response = await fetch(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(90000), headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with exactly: Hello." }], stream: false, temperature: 0, ...(mode !== "on" ? { reasoning_effort: "none" } : {}) }) });
  const data = await response.json();
  const answer = data?.choices?.[0]?.message;
  assert.ok(response.ok && typeof answer?.content === "string" && answer.content.trim(), "Local model must produce a reply");
  if (mode !== "on") assert.ok(!answer.reasoning && !answer.reasoning_content, "Thinking-off response must omit reasoning");
  if (mode !== "warmup") {
    const status = { thinking: mode, status: "ok", latency_ms: Math.round(performance.now() - started) };
    samples.push(status); console.log(JSON.stringify(status));
  }
}
const browser = await browserSession();
const { send, evaluate, waitFor } = browser;
let live;
try {
  await send("Page.navigate", { url: "http://localhost:3100/stylist" });
  await waitFor("document.querySelector('#stylist-message') && performance.getEntriesByType('resource').some(entry=>entry.name.endsWith('/api/stylist/chat'))", "live chat hydration");
  const configured = await evaluate("fetch('/api/stylist/chat').then(r=>r.json()).then(r=>r.status==='configured')");
  assert.ok(configured, "Live endpoint must be configured");
  await evaluate("window.__quietChatCheck=true; (()=>{const e=document.querySelector('#stylist-message'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'Say hello in one short sentence. Do not use tools.'); e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  const started = performance.now();
  await evaluate("document.querySelector('.stylist-compose').requestSubmit()");
  await waitFor("document.querySelector('.stylist-pending')", "live optimistic pending state");
  await waitFor("document.querySelector('.stylist-answer') || document.querySelector('[role=alert]')", "live local reply");
  assert.ok(await evaluate("window.__quietChatCheck && document.querySelector('.stylist-turn[data-state=complete]') && !document.querySelector('[role=alert]')"), "Request must finish without navigation or error");
  assert.deepEqual(browser.errors, []);
  live = { status: "ok", page_reloaded: false, latency_ms: Math.round(performance.now() - started) };
  console.log("LIVE CHAT " + JSON.stringify(live));
} finally { await browser.close(); }
await mkdir(".codex-garment-check", { recursive: true });
await writeFile(".codex-garment-check/stylist-latency.json", JSON.stringify({ model, status_only: true, samples, live }, null, 2));
