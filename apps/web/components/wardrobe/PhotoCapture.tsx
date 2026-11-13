"use client";
/* eslint-disable @next/next/no-img-element */
import { useState, type PointerEvent } from "react";

type Capture = { file: File; url: string; x: number; y: number; scale: number };
type View = "front" | "back";
export type Captures = Partial<Record<View, Capture>>;

export async function saveCaptures(item: string, captures: Captures) {
  for (const view of ["front", "back"] as const) {
    const capture = captures[view]; if (!capture) continue;
    const bitmap = await createImageBitmap(capture.file);
    const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); if (!context) { bitmap.close(); throw new Error("Could not prepare photo."); }
    context.drawImage(bitmap, 0, 0); bitmap.close();
    const data = canvas.toDataURL("image/jpeg", 0.9);
    const s = capture.scale, matrix = [s, 0, 0, s, capture.x - s / 2, capture.y - s / 2];
    const response = await fetch("/api/wardrobe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item, view, alignment: matrix, data }) });
    if (!response.ok) throw new Error((await response.json()).error || "Could not save capture.");
  }
}
export function PhotoCapture({ pants, captures, onChange }: { pants: boolean; captures: Captures; onChange: (value: Captures) => void }) {
  const [drag, setDrag] = useState<{ view: View; x: number; y: number; startX: number; startY: number } | null>(null);
  function move(e: PointerEvent<HTMLDivElement>, view: View) {
    if (!drag || drag.view !== view || !captures[view]) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onChange({ ...captures, [view]: { ...captures[view]!, x: drag.startX + (e.clientX - drag.x) / rect.width, y: drag.startY + (e.clientY - drag.y) / rect.height } });
  }
  return <fieldset className="capture-field wardrobe-wide"><legend>Create 3D from photos</legend><p>Photograph the garment flat on a bed or on a hanger. Drag and scale the outline to match the garment. A front photo is required; the back is optional.</p>{(["front", "back"] as const).map(view => {
    const capture = captures[view]; return <div key={view} className="capture-view"><label>{view === "front" ? "Front photo" : "Back photo (optional)"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 10000000 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) { e.target.value = ""; return; } const reader = new FileReader(); reader.onload = () => onChange({ ...captures, [view]: { file, url: String(reader.result), x: 0.5, y: 0.5, scale: 0.8 } }); reader.readAsDataURL(file); }} /></label>
      {capture && <><div className="capture-image" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setDrag({ view, x: e.clientX, y: e.clientY, startX: capture.x, startY: capture.y }); }} onPointerMove={e => move(e, view)} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}><img src={capture.url} alt={`${view} garment to align`} draggable={false} /><svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ left: `${(capture.x - capture.scale / 2) * 100}%`, top: `${(capture.y - capture.scale / 2) * 100}%`, width: `${capture.scale * 100}%`, height: `${capture.scale * 100}%` }}><path d={pants ? "M25 4 L75 4 L80 38 L91 96 L58 96 L50 48 L42 96 L9 96 L20 38 Z" : "M30 8 L40 4 Q50 20 60 4 L70 8 L98 28 L83 46 L73 37 L73 96 L27 96 L27 37 L17 46 L2 28 Z"} /></svg></div><label>Outline size<input type="range" min="0.2" max="1.8" step="0.01" value={capture.scale} onChange={e => onChange({ ...captures, [view]: { ...capture, scale: Number(e.target.value) } })} /></label><button type="button" onClick={() => { const next = { ...captures }; delete next[view]; onChange(next); }}>Remove {view}</button></>}
    </div>;
  })}</fieldset>;
}
