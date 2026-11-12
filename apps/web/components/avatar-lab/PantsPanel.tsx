"use client";
import { useCallback, useEffect, useState } from "react";
import { createPantsChecker, type PantsAvailability } from "../../lib/garment/demoResources";
import type { GarmentStatus } from "./types";

export const PANTS_URL = "/api/demo-garment?variant=pants";
const checkPants = createPantsChecker(PANTS_URL);
type Availability = "checking" | PantsAvailability;
export function PantsPanel({ enabled, setEnabled, visible, setVisible, color, setColor, wireframe, setWireframe, correctives, setCorrectives, weights, status, avatarReady }: {
  enabled: boolean; setEnabled: (value: boolean) => void; visible: boolean; setVisible: (value: boolean) => void;
  color: string; setColor: (value: string) => void; wireframe: boolean; setWireframe: (value: boolean) => void;
  correctives: boolean; setCorrectives: (value: boolean) => void; weights: Record<string, number>; status: GarmentStatus; avatarReady: boolean;
}) {
  const [availability, setAvailability] = useState<Availability>("checking");
  const check = useCallback(async () => {
    setAvailability(await checkPants(true));
  }, []);
  useEffect(() => {
    let active = true;
    checkPants().then(result => { if (active) setAvailability(result); });
    return () => { active = false; };
  }, []);
  return <section className="side-section" aria-labelledby="pants-heading">
    <div className="section-title"><h2 id="pants-heading">Pants</h2></div>
    <p className="side-note" role="status">{availability === "checking" ? "Checking pants asset…" : availability === "missing" ? "Pants not generated yet." : availability === "error" ? "Could not check the pants asset." : "Neutral-fit pants available."}</p>
    {(availability === "missing" || availability === "error") && <button className="photo-picker" type="button" onClick={() => { setAvailability("checking"); void check(); }}>Check again</button>}
    <label className="toggle-row"><span><strong>Load pants</strong><small>Neutral avatar fit</small></span><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={!avatarReady || availability !== "available"} /><span className="toggle-track" aria-hidden="true"><span /></span></label>
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
