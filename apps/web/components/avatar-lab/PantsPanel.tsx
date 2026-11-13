"use client";
import { useCallback, useEffect, useState } from "react";
import { createPantsChecker, pantsUrl, type PantsAvailability } from "../../lib/garment/demoResources";
import type { GarmentStatus } from "./types";

export type PantsVariant = "pants" | "pants-v2";
const checkers = { pants: createPantsChecker(pantsUrl("pants")), "pants-v2": createPantsChecker(pantsUrl("pants-v2")) };
type Availability = "checking" | PantsAvailability;
export function PantsPanel({ variant, setVariant, enabled, setEnabled, visible, setVisible, color, setColor, wireframe, setWireframe, correctives, setCorrectives, weights, status, avatarReady }: {
  variant: PantsVariant; setVariant: (value: PantsVariant) => void;
  enabled: boolean; setEnabled: (value: boolean) => void; visible: boolean; setVisible: (value: boolean) => void;
  color: string; setColor: (value: string) => void; wireframe: boolean; setWireframe: (value: boolean) => void;
  correctives: boolean; setCorrectives: (value: boolean) => void; weights: Record<string, number>; status: GarmentStatus; avatarReady: boolean;
}) {
  const [checked, setChecked] = useState<{ variant: PantsVariant; status: Availability }>({ variant, status: "checking" });
  const availability = checked.variant === variant ? checked.status : "checking";
  const check = useCallback(async () => {
    const status = await checkers[variant](true);
    setChecked(previous => previous.variant === variant ? { variant, status } : previous);
  }, [variant]);
  useEffect(() => {
    let active = true;
    checkers[variant]().then(result => { if (active) setChecked({ variant, status: result }); });
    return () => { active = false; };
  }, [variant]);
  return <section className="side-section" aria-labelledby="pants-heading">
    <div className="section-title"><h2 id="pants-heading">Pants</h2></div>
    <label className="field-label" htmlFor="pants-select">PANTS VERSION</label>
    <select id="pants-select" value={variant} onChange={event => setVariant(event.target.value as PantsVariant)}><option value="pants-v2">Basic pants v2</option><option value="pants">Basic pants v1</option></select>
    <p className="side-note" role="status">{availability === "checking" ? "Checking pants asset…" : availability === "missing" ? "Pants not generated yet." : availability === "error" ? "Could not check the pants asset." : "Neutral-fit pants available."}</p>
    {(availability === "missing" || availability === "error") && <button className="photo-picker" type="button" onClick={() => { setChecked({ variant, status: "checking" }); void check(); }}>Check again</button>}
    <label className="toggle-row"><span><strong>Load pants</strong><small>Neutral avatar fit</small></span><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={!avatarReady || (!enabled && availability !== "available")} /><span className="toggle-track" aria-hidden="true"><span /></span></label>
    {enabled && <>
      <label className="toggle-row"><span><strong>Pants correctives</strong><small>Pose-driven morph targets</small></span><input type="checkbox" checked={correctives} onChange={event => setCorrectives(event.target.checked)} /><span className="toggle-track" aria-hidden="true"><span /></span></label>
      <p className="side-note">{Object.entries(weights).length ? Object.entries(weights).map(([name, weight]) => <span key={name}>{name}: {weight.toFixed(2)}<br /></span>) : "No pants corrective targets loaded."}</p>
      <label className="toggle-row"><span><strong>Pants visible</strong></span><input type="checkbox" checked={visible} onChange={event => setVisible(event.target.checked)} /><span className="toggle-track" aria-hidden="true"><span /></span></label>
      <label className="toggle-row"><span><strong>Pants wireframe</strong></span><input type="checkbox" checked={wireframe} onChange={event => setWireframe(event.target.checked)} /><span className="toggle-track" aria-hidden="true"><span /></span></label>
      <label className="color-row" htmlFor="pants-color"><span><strong>Pants colour</strong></span><input id="pants-color" type="color" value={color} onChange={event => setColor(event.target.value)} /></label>
      <p className={status.state === "error" ? "reconstruction-error" : "side-note"} role="status">{status.state === "ready" ? `Bound · ${status.info.joints} joints` : status.state === "loading" ? "Loading pants…" : status.state === "error" ? status.message : "Pants off."}</p>
    </>}
  </section>;
}
