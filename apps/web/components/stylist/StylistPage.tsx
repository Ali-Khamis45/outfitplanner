"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage, ChatResult } from "../../lib/stylist/chatTypes";
import { CollectionNav } from "../wardrobe/CollectionNav";
import { LookItems } from "../wardrobe/LookItems";

type Turn = { question: string; result: ChatResult };
export function StylistPage() {
  const [turns, setTurns] = useState<Turn[]>([]), [input, setInput] = useState(""), [busy, setBusy] = useState(false);
  const [disconnected, setDisconnected] = useState(false), [error, setError] = useState("");
  const inFlight = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/stylist/chat", { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data = await response.json(); if (!controller.signal.aborted) { setDisconnected(data.status === "not_connected"); if (!response.ok && data.status !== "not_connected") setError("The local stylist is available only on localhost in development."); }
    }).catch(() => { if (!controller.signal.aborted) setError("Could not open the local stylist."); });
    return () => controller.abort();
  }, []);
  async function send(event: FormEvent) {
    event.preventDefault(); if (!input.trim() || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); const question = input.trim();
    const messages: ChatMessage[] = turns.flatMap(turn => [{ role: "user" as const, content: turn.question }, ...(turn.result.message ? [{ role: "assistant" as const, content: turn.result.message }] : [])]).slice(-38);
    messages.push({ role: "user", content: question });
    try {
      const response = await fetch("/api/stylist/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages }) });
      const data = await response.json();
      if (!data.status) throw new Error(data.error || "The local stylist could not answer.");
      setDisconnected(data.status === "not_connected"); setTurns(current => [...current, { question, result: data }]); setInput("");
    } catch (e) { setError(e instanceof Error ? e.message : "The local stylist could not answer."); } finally { inFlight.current = false; setBusy(false); }
  }
  return <main className="wardrobe-page"><CollectionNav /><div className="wardrobe-shell stylist-shell">
    <section className="wardrobe-intro"><div><span className="wardrobe-eyebrow">MAKE MORE OF WHAT YOU OWN</span><h1>Your stylist<span>.</span></h1><p>A little inspiration, drawn from your own wardrobe.</p></div><Link className="wardrobe-try" href="/planner">Plan your week</Link></section>
    {disconnected && <section className="stylist-connection" role="status"><h2>Stylist model not connected yet</h2><p>Set these in <code>apps/web/.env.local</code>, then restart your local app server. Choose a model installed locally that supports tools.</p><pre>STYLIST_BASE_URL=http://localhost:11434/v1{"\n"}STYLIST_MODEL=your-local-model-name</pre></section>}
    <div className="stylist-transcript" aria-label="Stylist conversation" aria-live="polite">{turns.map((turn, index) => <section className="stylist-turn" key={index}>
      <p className="stylist-question"><strong>You</strong>{turn.question}</p>
      <div className="stylist-tools" aria-label="Tools used">{turn.result.calls.map((call, i) => <span className="stylist-chip" data-ok={call.ok} key={i}>{call.label}</span>)}</div>
      {turn.result.message && <p className="stylist-answer"><strong>Stylist</strong>{turn.result.message}</p>}
      {turn.result.error && turn.result.status !== "not_connected" && <p role="status">{turn.result.error}</p>}
      {turn.result.recommendations.map(card => <article className="stylist-recommendation" key={card.url}><h2>A look from your wardrobe</h2><LookItems items={card.items} />{card.reason && <p>{card.reason}</p>}<Link className="wardrobe-try" href={card.url}>Try it on</Link></article>)}
    </section>)}</div>
    {error && <p role="alert" className="wardrobe-error">{error}</p>}{busy && <p role="status">Your local stylist is thinking…</p>}
    <form className="stylist-compose" onSubmit={send}><label htmlFor="stylist-message">What are you dressing for?<textarea id="stylist-message" placeholder="Help me choose a casual look for tomorrow in Cairo." required maxLength={4000} value={input} onChange={e => setInput(e.target.value)} disabled={busy} /></label><button className="wardrobe-primary" disabled={busy || !input.trim()}>Send</button></form>
    <p className="stylist-privacy">Chat stays with your local model. Wardrobe photos and body measurements stay out of prompts. Keep your messages about clothes and occasions.</p>
  </div></main>;
}
