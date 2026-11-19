"use client";
/* eslint-disable @next/next/no-img-element */
import { useState, type PointerEvent } from "react";
import flatlay from "../../lib/garment/flatlay-outlines.json";

// x, y: the outline's centre as a share of the photo's width and height; scale: the outline's width as a share of the
// photo's width (Sprint 4A: the outline keeps the garment's real aspect, so its height follows from its width).
type Capture = { file: File; url: string; x: number; y: number; scale: number; width: number; height: number };
type View = "front" | "back";
export type Captures = Partial<Record<View, Capture>>;

// The capture outline is the photo-to-texture producer's flat-lay model of the template (services/texture/export_outlines.py).
const outlineFor = (pants: boolean) => { const template = pants ? "pants-v3" : "tshirt-v5.3"; return { template, ...flatlay.outlines[template] }; };

export async function saveCaptures(item: string, captures: Captures, pants: boolean) {
  const outline = outlineFor(pants);
  for (const view of ["front", "back"] as const) {
    const capture = captures[view]; if (!capture) continue;
    const bitmap = await createImageBitmap(capture.file);
    const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); if (!context) { bitmap.close(); throw new Error("Could not prepare photo."); }
    context.drawImage(bitmap, 0, 0); bitmap.close();
    const data = canvas.toDataURL("image/jpeg", 0.9);
    // Alignment version 2: guide (x 0..1, y 0..aspect, the layout scaled by its width) -> photo pixels / photo width.
    const s = capture.scale, matrix = [s, 0, 0, s, capture.x - s / 2, capture.y * canvas.height / canvas.width - s * outline.aspect / 2];
    const response = await fetch("/api/wardrobe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item, view, alignment: matrix, data, photoSize: [canvas.width, canvas.height], outline: { template: outline.template, version: flatlay.version } }) });
    if (!response.ok) throw new Error((await response.json()).error || "Could not save capture.");
  }
}
export function PhotoCapture({ pants, captures, onChange }: { pants: boolean; captures: Captures; onChange: (value: Captures) => void }) {
  const [drag, setDrag] = useState<{ view: View; x: number; y: number; startX: number; startY: number } | null>(null);
  const outline = outlineFor(pants);
  function move(e: PointerEvent<HTMLDivElement>, view: View) {
    if (!drag || drag.view !== view || !captures[view]) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onChange({ ...captures, [view]: { ...captures[view]!, x: drag.startX + (e.clientX - drag.x) / rect.width, y: drag.startY + (e.clientY - drag.y) / rect.height } });
  }
  return <fieldset className="capture-field wardrobe-wide"><legend>Create 3D from photos</legend><p>Photograph the garment flat on a bed or on a hanger. Drag and scale the outline to match the garment. A front photo is required; the back is optional.</p>{(["front", "back"] as const).map(view => {
    const capture = captures[view];
    // the outline's height as a share of the photo's height: its width share x the garment's aspect x the photo's width / height
    const height = capture ? capture.scale * outline.aspect * capture.width / capture.height : 0;
    return <div key={view} className="capture-view"><label>{view === "front" ? "Front photo" : "Back photo (optional)"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 10000000 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) { e.target.value = ""; return; } const reader = new FileReader(); reader.onload = () => { const url = String(reader.result), image = new Image(); image.onload = () => onChange({ ...captures, [view]: { file, url, x: 0.5, y: 0.5, scale: 0.8, width: image.naturalWidth, height: image.naturalHeight } }); image.src = url; }; reader.readAsDataURL(file); }} /></label>
      {capture && <><div className="capture-image" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setDrag({ view, x: e.clientX, y: e.clientY, startX: capture.x, startY: capture.y }); }} onPointerMove={e => move(e, view)} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}><img src={capture.url} alt={`${view} garment to align`} draggable={false} /><svg aria-hidden="true" viewBox={`0 0 100 ${100 * outline.aspect}`} preserveAspectRatio="none" style={{ left: `${(capture.x - capture.scale / 2) * 100}%`, top: `${(capture.y - height / 2) * 100}%`, width: `${capture.scale * 100}%`, height: `${height * 100}%` }}><path d={outline.path} /></svg></div><label>Outline size<input type="range" min="0.2" max="1.8" step="0.01" value={capture.scale} onChange={e => onChange({ ...captures, [view]: { ...capture, scale: Number(e.target.value) } })} /></label><button type="button" onClick={() => { const next = { ...captures }; delete next[view]; onChange(next); }}>Remove {view}</button></>}
    </div>;
  })}</fieldset>;
}
