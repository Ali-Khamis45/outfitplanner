"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage, ChatResult } from "../../lib/stylist/chatTypes";
import { CollectionNav } from "../wardrobe/CollectionNav";
import { LookItems } from "../wardrobe/LookItems";
import { LookActions } from "./LookActions";

type Turn = { id: number; question: string; state: "pending" | "complete" | "failed"; result: ChatResult | null };
export function StylistPage() {
  const [turns, setTurns] = useState<Turn[]>([]), [input, setInput] = useState(""), [busy, setBusy] = useState(false);
  const [disconnected, setDisconnected] = useState(false), [error, setError] = useState("");
  const [warming, setWarming] = useState(true);
  const inFlight = useRef(false);
  const sequence = useRef(0), activeRequest = useRef<AbortController | null>(null);
  const latestTurn = useRef<HTMLDivElement>(null);
  useEffect(() => { latestTurn.current?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); }, [turns.length, busy]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/stylist/chat", { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data = await response.json(); if (!controller.signal.aborted) { setDisconnected(data.status === "not_connected"); if (!response.ok && data.status !== "not_connected") setError("The local stylist is available only on localhost in development."); }
    }).catch(() => { if (!controller.signal.aborted) setError("Could not open the local stylist."); });
    void fetch("/api/stylist/chat?warmup=1", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: "{}" }).then(response => {
      if (!response.ok && !controller.signal.aborted) setError("Model warm-up did not finish. You can still try sending your message.");
    }).catch(() => { if (!controller.signal.aborted) setError("Model warm-up is unavailable. You can still try sending your message."); }).finally(() => { if (!controller.signal.aborted) setWarming(false); });
    return () => { controller.abort(); activeRequest.current?.abort(); };
  }, []);
  async function send(event: FormEvent) {
    event.preventDefault(); if (!input.trim() || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); const question = input.trim(), id = ++sequence.current;
    const controller = new AbortController(); activeRequest.current = controller;
    const messages: ChatMessage[] = turns.filter(turn => turn.state === "complete").flatMap(turn => [{ role: "user" as const, content: turn.question }, ...(turn.result?.message ? [{ role: "assistant" as const, content: turn.result.message }] : [])]).slice(-38);
    messages.push({ role: "user", content: question });
    setTurns(current => [...current.filter(turn => turn.state !== "failed" || turn.question !== question), { id, question, state: "pending", result: null }]);
    try {
      const response = await fetch("/api/stylist/chat", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages }) });
      const data = await response.json();
      setDisconnected(data.status === "not_connected");
      if (!response.ok || data.status !== "ok") {
        if (Array.isArray(data.calls) && Array.isArray(data.recommendations)) setTurns(current => current.map(turn => turn.id === id ? { ...turn, state: "failed", result: data } : turn));
        throw new Error(data.error || "The local stylist could not answer. Try again.");
      }
      setTurns(current => current.map(turn => turn.id === id ? { ...turn, state: "complete", result: data } : turn)); setInput("");
    } catch (e) {
      if (!controller.signal.aborted) {
        setTurns(current => current.map(turn => turn.id === id ? { ...turn, state: "failed" } : turn));
        setError(e instanceof TypeError ? "Could not reach the local stylist. Your message is kept below; try again." : e instanceof Error ? e.message : "The local stylist could not answer. Your message is kept below.");
      }
    } finally { inFlight.current = false; activeRequest.current = null; setBusy(false); }
  }
  return <main className="wardrobe-page"><CollectionNav /><div className="wardrobe-shell stylist-shell">
    <section className="wardrobe-intro"><div><span className="wardrobe-eyebrow">MAKE MORE OF WHAT YOU OWN</span><h1>Your stylist<span>.</span></h1><p>A little inspiration, drawn from your own wardrobe.</p></div><Link className="wardrobe-try" href="/planner">Plan your week</Link></section>
    {disconnected && <section className="stylist-connection" role="status"><h2>Stylist model not connected yet</h2><p>Set these in <code>apps/web/.env.local</code>, then restart your local app server. Choose a model installed locally that supports structured JSON.</p><pre>STYLIST_BASE_URL=http://localhost:11434/v1{"\n"}STYLIST_MODEL=your-local-model-name</pre></section>}
    <div className="stylist-transcript" aria-label="Stylist conversation" aria-live="polite">{turns.map(turn => <section className="stylist-turn" key={turn.id} data-state={turn.state}>
      <p className="stylist-question" dir="auto"><strong dir="ltr">You</strong>{turn.question}</p>
      {turn.state === "pending" && <p className="stylist-pending" dir="auto" role="status"><span aria-hidden="true">•••</span> Your stylist is thinking…</p>}
      {turn.state === "failed" && <p className="stylist-failed" dir="auto">Request failed. Your message is ready to retry below.</p>}
      {turn.result && <><div className="stylist-tools" aria-label="Tools used">{turn.result.calls.map((call, i) => <span className="stylist-chip" data-ok={call.ok} key={i}>{call.label}</span>)}</div>
      {turn.result.message && <p className="stylist-answer" dir="auto"><strong dir="ltr">Stylist</strong>{turn.result.message}</p>}
      {turn.result.keep_alive_status && <p role="status">The model stay-loaded setting is unavailable.</p>}
      {turn.result.recommendations.map(card => <article className="stylist-recommendation" key={card.url} dir="auto"><h2>{turn.result?.structured?.language === "arz" ? "طقم من دولابك" : "A look from your wardrobe"}</h2><LookItems items={card.items} />{turn.result?.structured?.gap_note && <p dir="auto" className="stylist-gap">{turn.result.structured.gap_note}</p>}{turn.result?.structured?.weather_note && <p dir="auto">{turn.result.structured.weather_note}</p>}<LookActions card={card} arabic={turn.result?.structured?.language === "arz"} look={turn.result?.structured} /></article>)}</>}
    </section>)}<div ref={latestTurn} /></div>
    {error && <p role="alert" className="wardrobe-error">{error}</p>}
    {warming && <p role="status">Warming up your local stylist…</p>}
    <form className="stylist-compose" onSubmit={send}><label htmlFor="stylist-message">What are you dressing for?<textarea id="stylist-message" dir="auto" placeholder="Help me choose a casual look for tomorrow in Cairo." required maxLength={4000} value={input} onChange={e => setInput(e.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} disabled={busy} /></label><button className="wardrobe-primary" disabled={busy || !input.trim()}>{busy ? "Thinking…" : "Send"}</button></form>
    <p className="stylist-privacy">Chat stays with your local model. Wardrobe photos and body measurements stay out of prompts. Keep your messages about clothes and occasions.</p>
  </div></main>;
}
