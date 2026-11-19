// The compatibility endpoint currently ignores keep_alive. Native empty chat
// requests preload the same model and refresh its actual residency lease.
const pending = new Map<string, Promise<void>>();
export async function refreshModelLease(config: { url: URL; model: string; keepAlive: string }, fetcher: typeof fetch = fetch) {
  const url = new URL(config.url); url.pathname = "/api/chat";
  const key = `${url}|${config.model}|${config.keepAlive}`;
  const existing = pending.get(key); if (existing) return existing;
  const task = (async () => {
    const response = await fetcher(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(180000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: config.model, messages: [], stream: false, keep_alive: config.keepAlive, think: false }) });
    if (!response.ok) throw new Error("Could not warm the local model.");
    await response.arrayBuffer(); // Discard all content; never log reasoning.
  })();
  pending.set(key, task);
  try { await task; } finally { pending.delete(key); }
}
