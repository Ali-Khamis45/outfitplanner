"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Recommendation } from "../../lib/stylist/chatTypes";

export function LookActions({ card, arabic }: { card: Recommendation; arabic: boolean }) {
  const router = useRouter(), pending = useRef(false);
  const [busy, setBusy] = useState(false), [logged, setLogged] = useState(false), [error, setError] = useState("");
  async function action(name: "show_on_avatar" | "log_worn") {
    if (pending.current || name === "log_worn" && logged) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const body = name === "show_on_avatar" ? { item_ids: card.items.filter(item => item.category === "top" || item.category === "bottom").map(item => item.id) }
        : { outfit_or_item_ids: card.items.map(item => item.id), date: new Date().toISOString().slice(0, 10) };
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
    <button className="wardrobe-try" disabled={busy || logged} onClick={() => void action("log_worn")}>{logged ? arabic ? "اتسجل لبسه النهارده" : "Logged for today" : arabic ? "سجل إني لبسته النهارده" : "Log worn today"}</button>
    {card.items.some(item => item.category === "outerwear") && <p>{arabic ? "المعاينة بتعرض التوب والبنطلون بس." : "The preview shows the top and bottom only."}</p>}
    {logged && <p role="status">{arabic ? "اتحفظ في سجل اللبس." : "Saved to wear history."}</p>}
    {error && <p role="alert" className="wardrobe-error">{error}</p>}
  </div>;
}
