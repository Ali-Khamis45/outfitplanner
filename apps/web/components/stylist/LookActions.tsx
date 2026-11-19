"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Recommendation } from "../../lib/stylist/chatTypes";
import type { StructuredLook } from "../../lib/stylist/pipeline";
import { localDate } from "../../lib/planner/dates";

export function LookActions({ card, arabic, look }: { card: Recommendation; arabic: boolean; look?: StructuredLook }) {
  const router = useRouter(), pending = useRef(false);
  const [busy, setBusy] = useState(false), [logged, setLogged] = useState(false), [error, setError] = useState("");
  const date = look?.date ?? localDate(), future = date > localDate(), today = date === localDate();
  async function action(name: "show_on_avatar" | "log_worn" | "plan") {
    if (pending.current || name !== "show_on_avatar" && logged) return;
    pending.current = true; setBusy(true); setError("");
    try {
      if (name === "log_worn" && date !== localDate()) throw new Error("Only today's look can be logged worn. Future looks belong in the planner.");
      if (name === "plan") {
        if (date <= localDate()) throw new Error("This date is no longer in the future. Ask for a new look.");
        const current = await fetch("/api/planner", { cache: "no-store" });
        const planner = await current.json(), version = current.headers.get("X-Planner-Version");
        if (!current.ok || !version) throw new Error("Could not read the planner. Try again.");
        const existing = planner.plans?.find((plan: { date: string }) => plan.date === date);
        if (existing) throw new Error("A plan already exists for this date. Open Planner to change it.");
        const response = await fetch("/api/planner", { method: "PUT", headers: { "Content-Type": "application/json", "If-Match": version }, body: JSON.stringify({ date, outfit_id: null, item_ids: card.items.map(item => item.id), occasion: look?.occasion || "Stylist look", note: [card.reason, look?.gap_note, look?.weather_note].filter(Boolean).join("\n").slice(0, 1000), created_at: localDate() }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not save the plan.");
        setLogged(true); return;
      }
      const body = name === "show_on_avatar" ? { item_ids: card.items.filter(item => item.category === "top" || item.category === "bottom").map(item => item.id) }
        : { outfit_or_item_ids: card.items.map(item => item.id), date };
      const response = await fetch(`/api/stylist/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Action failed. Try again.");
      if (name === "log_worn") setLogged(true);
      else {
        if (typeof data.url !== "string" || !data.url.startsWith("/try-on?")) throw new Error("The fitting-room link is unavailable.");
        router.push(data.url);
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Action failed. Try again."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="stylist-look-actions" dir={arabic ? "rtl" : "ltr"}>
    <button className="wardrobe-try" disabled={busy} onClick={() => void action("show_on_avatar")}>{arabic ? "جرب الطقم" : "Try it on"}</button>{" "}
    {future ? <button className="wardrobe-try" disabled={busy || logged} onClick={() => void action("plan")}>{logged ? arabic ? "اتحفظ في الخطة" : "Saved to plan" : arabic ? `احفظ في الخطة ليوم ${date}` : `Save to plan for ${date}`}</button>
      : today && <button className="wardrobe-try" disabled={busy || logged} onClick={() => void action("log_worn")}>{logged ? arabic ? "اتسجل لبسه النهارده" : "Logged for today" : arabic ? "سجل إني لبسته النهارده" : "Log worn today"}</button>}
    {card.items.some(item => item.category === "outerwear") && <p>{arabic ? "المعاينة بتعرض التوب والبنطلون بس." : "The preview shows the top and bottom only."}</p>}
    {logged && <p role="status">{future ? arabic ? `اتحفظ في خطة ${date}.` : `Saved to your plan for ${date}.` : arabic ? "اتحفظ في سجل اللبس." : "Saved to wear history."}</p>}
    {error && <p role="alert" className="wardrobe-error">{error}</p>}
  </div>;
}
