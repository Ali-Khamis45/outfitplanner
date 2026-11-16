"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Wardrobe } from "../../lib/wardrobe/schema";
import type { Plan, Planner } from "../../lib/planner/schema";
import { localDate, shiftDate, weekStart } from "../../lib/planner/dates";
import { CollectionNav } from "../wardrobe/CollectionNav";
import { LookItems } from "../wardrobe/LookItems";

type Forecast = { date: string; city: string; condition: string; temperature_min_c: number; temperature_max_c: number; attribution: string };
const dateLabel = (date: string, options: Intl.DateTimeFormatOptions) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, options);
export function PlannerPage() {
  const [today, setToday] = useState(() => localDate()), [start, setStart] = useState(() => weekStart(localDate()));
  const [wardrobe, setWardrobe] = useState<Wardrobe | null>(null), [planner, setPlanner] = useState<Planner | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [weather, setWeather] = useState<Record<string, Forecast>>({}), [editing, setEditing] = useState<Plan | null>(null);
  const [outfit, setOutfit] = useState(""), [top, setTop] = useState(""), [bottom, setBottom] = useState("");
  const version = useRef<string | null>(null), editor = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([fetch("/api/wardrobe", { signal: controller.signal, cache: "no-store" }), fetch("/api/planner", { signal: controller.signal, cache: "no-store" })]).then(async ([w, p]) => {
      if (!w.ok || !p.ok) throw new Error("The local planner is available only on localhost in development.");
      const [items, plans] = await Promise.all([w.json(), p.json()]);
      if (!controller.signal.aborted) { setWardrobe(items); setPlanner(plans); version.current = p.headers.get("X-Planner-Version"); }
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    const clock = setInterval(() => setToday(localDate()), 30000);
    return () => { controller.abort(); clearInterval(clock); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    for (let day = 0; day < 7; day++) {
      const date = shiftDate(start, day);
      void fetch("/api/stylist/get_weather", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, city: "Cairo" }) })
        .then(async response => { if (!response.ok) return; const forecast = await response.json();
          if (!controller.signal.aborted && forecast.date === date && Number.isFinite(forecast.temperature_min_c) && Number.isFinite(forecast.temperature_max_c)) setWeather(current => ({ ...current, [date]: forecast }));
        }).catch(() => { /* Unavailable dates intentionally show no weather. */ });
    }
    return () => controller.abort();
  }, [start]);
  useEffect(() => { if (editing) editor.current?.focus(); }, [editing?.date]); // eslint-disable-line react-hooks/exhaustive-deps

  function assign(date: string) {
    const current = planner?.plans.find(plan => plan.date === date);
    setEditing(current ?? { date, outfit_id: null, item_ids: [], occasion: "casual", note: "", created_at: today });
    setOutfit(current?.outfit_id ?? "");
    setTop(wardrobe?.items.find(item => current?.item_ids.includes(item.id) && item.category === "top")?.id ?? "");
    setBottom(wardrobe?.items.find(item => current?.item_ids.includes(item.id) && item.category === "bottom")?.id ?? "");
    setError(""); setNotice("");
  }
  async function persist(method: "PUT" | "DELETE", body: Plan | { date: string }) {
    setBusy(true); setError(""); setNotice("");
    try {
      if (!version.current) throw new Error("Planner version unavailable. Reload before saving.");
      const response = await fetch("/api/planner", { method, headers: { "Content-Type": "application/json", "If-Match": version.current }, body: JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not save your plan.");
      version.current = response.headers.get("X-Planner-Version"); setPlanner(data); setEditing(null); setNotice(method === "PUT" ? "Plan saved." : "Plan removed.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save your plan."); } finally { setBusy(false); }
  }
  function save(event: FormEvent) {
    event.preventDefault(); if (!editing || !wardrobe) return;
    const selected = wardrobe.outfits.find(o => o.id === outfit);
    void persist("PUT", { ...editing, outfit_id: selected?.id ?? null, item_ids: selected ? selected.items : [top, bottom] });
  }
  async function wear(plan: Plan) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/stylist/log_worn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outfit_or_item_ids: plan.item_ids, date: today }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not log wear.");
      setNotice("Wear recorded for today's look.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not log wear."); } finally { setBusy(false); }
  }
  return <main className="wardrobe-page"><CollectionNav /><div className="wardrobe-shell">
    <section className="wardrobe-intro"><div><span className="wardrobe-eyebrow">A LITTLE PREPARATION</span><h1>Your week<span>.</span></h1><p>A place for every look, whatever the day brings.</p></div><Link className="wardrobe-try" href="/stylist">Ask your stylist</Link></section>
    {error && <p role="alert" className="wardrobe-error">{error} <button type="button" onClick={() => window.location.reload()}>Reload</button></p>}
    {notice && <p role="status">{notice}</p>}
    <div className="planner-week-nav"><button aria-label="Previous week" disabled={busy} onClick={() => { setStart(shiftDate(start, -7)); setEditing(null); }}>← Previous</button><h2>{dateLabel(start, { month: "short", day: "numeric" })} – {dateLabel(shiftDate(start, 6), { month: "short", day: "numeric", year: "numeric" })}</h2><button aria-label="Next week" disabled={busy} onClick={() => { setStart(shiftDate(start, 7)); setEditing(null); }}>Next →</button><button disabled={busy} onClick={() => { setStart(weekStart(today)); setEditing(null); }}>This week</button></div>
    {!planner && !error && <p role="status">Opening your planner…</p>}
    {planner && wardrobe && <div className="planner-week" aria-label="Weekly plans">{Array.from({ length: 7 }, (_, day) => {
      const date = shiftDate(start, day), plan = planner.plans.find(p => p.date === date), forecast = weather[date];
      const items = plan ? plan.item_ids.flatMap(id => wardrobe.items.find(item => item.id === id) ?? []) : [];
      const topItem = items.find(i => i.category === "top"), bottomItem = items.find(i => i.category === "bottom");
      return <article className="planner-day" key={date} data-date={date} aria-label={date} aria-current={date === today ? "date" : undefined}>
        <h3><time dateTime={date}>{dateLabel(date, { weekday: "short", day: "numeric" })}</time>{date === today && <small>Today</small>}</h3>
        {forecast && <p className="planner-weather" title={forecast.attribution}>{forecast.city} · {forecast.condition}<br />{forecast.temperature_min_c}–{forecast.temperature_max_c}°C</p>}
        {plan ? <><LookItems items={items} /><p className="planner-occasion">{plan.occasion}</p>{plan.note && <p className="planner-note">{plan.note}</p>}{items.length !== plan.item_ids.length && <p>Some pieces are no longer in your wardrobe.</p>}
          <div className="planner-actions">{date === today && <button disabled={busy || items.length !== plan.item_ids.length} onClick={() => void wear(plan)}>Wear it</button>}
          {topItem && bottomItem && <Link href={`/try-on?${new URLSearchParams({ top: topItem.id, bottom: bottomItem.id })}`}>Try it on</Link>}
          <button disabled={busy} onClick={() => assign(date)}>Edit look</button><button disabled={busy} onClick={() => void persist("DELETE", { date })}>Remove</button></div></> : <button className="planner-assign" disabled={busy} onClick={() => assign(date)}>+ Assign a look</button>}
      </article>;
    })}</div>}
    {editing && wardrobe && <section className="planner-editor" aria-labelledby="plan-title"><h2 id="plan-title" tabIndex={-1} ref={editor}>A look for {dateLabel(editing.date, { weekday: "long", month: "short", day: "numeric" })}</h2><form className="wardrobe-form" onSubmit={save}>
      <label className="wardrobe-wide">Saved outfit<select aria-label="Saved outfit" value={outfit} onChange={e => { setOutfit(e.target.value); const selected = wardrobe.outfits.find(o => o.id === e.target.value); if (selected) setEditing({ ...editing, occasion: selected.occasion || "casual" }); }}><option value="">Choose a top + bottom instead</option>{wardrobe.outfits.map(o => <option value={o.id} key={o.id}>{o.name}</option>)}</select></label>
      {!outfit && <><label>Top<select required aria-label="Top" value={top} onChange={e => setTop(e.target.value)}><option value="">Choose a top</option>{wardrobe.items.filter(i => i.category === "top").map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label><label>Bottom<select required aria-label="Bottom" value={bottom} onChange={e => setBottom(e.target.value)}><option value="">Choose a bottom</option>{wardrobe.items.filter(i => i.category === "bottom").map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label></>}
      <label>Occasion<input required maxLength={100} value={editing.occasion} onChange={e => setEditing({ ...editing, occasion: e.target.value })} /></label><label>Note<textarea maxLength={1000} value={editing.note} onChange={e => setEditing({ ...editing, note: e.target.value })} /></label>
      <div className="wardrobe-wide wardrobe-form-actions"><button className="wardrobe-primary" disabled={busy}>Save plan</button><button type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></div>
    </form></section>}
  </div></main>;
}
