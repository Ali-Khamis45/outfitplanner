"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Heart, PencilSimple, Plus } from "@phosphor-icons/react";
import type { WardrobeItem } from "../../lib/wardrobe/schema";
import { formatRegion, type Region } from "../../lib/garment/fitMap";
import { Panel } from "../shell/Panel";
import { PieceImage, canTryOn, itemTryOnUrl } from "./PieceImage";
type Fit = { status: "available"; size: string; body: string; regions: Record<string, Region>; recommended_size: string | null } | { status: "unknown" };
function ItemFit({ item }: { item: WardrobeItem }) {
  const [body, setBody] = useState("neutral");
  const [result, setResult] = useState<{ key: string; fit: Fit | null } | null>(null);
  const key = `${item.id}:${item.size}:${body}`;
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/stylist/get_fit", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id: item.id, body }) })
      .then(async response => { if (!response.ok) throw new Error("Fit unavailable"); return response.json() as Promise<Fit>; })
      .then(fit => { if (!controller.signal.aborted) setResult({ key, fit }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ key, fit: null }); });
    return () => controller.abort();
  }, [item.id, body, key]);
  const fit = result?.key === key ? result.fit : null;
  const tight = fit?.status === "available" && Object.values(fit.regions).some(region => region.status === "tight");
  return <section className="item-fit" aria-label="Item size fit"><div className="item-fit-heading"><h3>How it fits</h3><span>Size {item.size || "not set"}</span></div><label>Compare with<select value={body} onChange={event => setBody(event.target.value)}><option value="neutral">Neutral avatar</option><option value="personal-scaled">My avatar</option></select></label>
    {result?.key !== key ? <p role="status">Checking this size…</p> : fit?.status === "available" ? <>
      {tight && <p className="fit-warning" role="status">This size is tight in one or more areas. Check the fit before wearing.</p>}
      {Object.entries(fit.regions).map(([name, region]) => <p className="fit-label" data-fit={region.status} key={name}><span className="fit-status">{region.status}</span>{formatRegion(name, region, item.template === "pants-basic-v2" ? "pants-v2" : item.template ?? "")}{region.clamped && <small>Estimated from size chart</small>}</p>)}
      {fit.recommended_size && <p className="fit-recommendation">Recommended size: <strong>{fit.recommended_size}</strong></p>}
    </> : <p className="muted">{result?.fit === null ? "Fit could not be loaded. Try another avatar or reopen this piece." : "No fit map is available for this item, size and avatar. Fit is unknown."}</p>}
  </section>;
}
export function WardrobeDetails({ item, onClose, onEdit, onFavorite, onOutfit, saving, error, inline = false }: { item: WardrobeItem; onClose: () => void; onEdit: () => void; onFavorite: () => void; onOutfit: () => void; saving: boolean; error: string; inline?: boolean }) {
  const fields: [string, string][] = [["Name", item.name], ["Category", item.category], ["Type", item.type], ["Size", item.size || "Not set"], ["Material", item.material || "Not set"], ["Pattern", item.pattern], ["Formality", `${item.formality} / 5`], ["Warmth", `${item.warmth} / 5`], ["Seasons", item.seasons.join(", ") || "Not set"], ["Occasions", item.occasions.join(", ") || "Not set"], ["Added on", item.added_at], ["Last worn", item.last_worn ?? "Not recorded"], ["Times worn", String(item.times_worn)], ["Favourite", item.favorite ? "Yes" : "No"], ["Notes", item.notes || "No notes yet"]];
  const content = <>
    {error && <p role="alert" className="wardrobe-error">{error}</p>}
    <div className="detail-image"><PieceImage item={item} />{item.id.startsWith("example-") && <span className="example-badge">Example</span>}</div>
    <div className="detail-title"><h3>{item.name}</h3><button className="icon-button" disabled={saving} aria-label={`${item.favorite ? "Unfavourite" : "Favourite"} ${item.name}`} aria-pressed={item.favorite} onClick={onFavorite}><Heart size={20} weight={item.favorite ? "fill" : "regular"} /></button></div>
    <div className="detail-actions">{canTryOn(item) ? <Link className="button-primary" href={itemTryOnUrl(item)}>Try on <ArrowUpRight size={18} /></Link> : <p className="muted">3D try-on is unavailable for this template.</p>}<button className="button-secondary" onClick={onOutfit}><Plus size={16} /> Add to outfit</button><button className="text-link" onClick={onEdit}><PencilSimple size={16} /> Edit piece</button></div>
    <ItemFit item={item} /><h3 className="detail-section-title">The details</h3><dl className="item-fields">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <h3 className="detail-section-title">Colours</h3><ul className="detail-colors">{item.colors.map((color, i) => <li key={i}><span style={{ backgroundColor: color.hex }} aria-hidden="true" /><strong>{color.name}</strong><span>{color.hex} · {Math.round(color.share * 100)}%</span></li>)}</ul>
    <details className="item-references"><summary>Item and image references</summary><dl className="item-fields">{[["Item ID", item.id], ["Template", item.template ?? "None"], ["Photo", item.photo || "None"], ["Texture", item.texture ?? "None"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details>
  </>;
  return inline ? <aside className="wardrobe-detail-panel" aria-label="Piece details">{content}</aside> : <Panel title="Piece details" onClose={onClose}>{content}</Panel>;
}
