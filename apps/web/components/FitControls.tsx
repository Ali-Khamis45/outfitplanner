"use client";
import { useEffect, useId, useState } from "react";
import { emptyMeasurements, measurementError, measurementFields, names, serializeMeasurements, type Measurements } from "../lib/measurements";
import { parseSidecar, type Sidecar } from "../lib/garment/correctives";
import { formatRegion, isFullyClampedAndTight, parseFitMap, regionEstimateNote, SIZES, type Size, type SizeOption, type Slot } from "../lib/garment/fitMap";

export function useSizes(body: string | null, slot: Slot, fixtures = false, preferredSize = "", candidate = false) {
  const key = JSON.stringify([body, slot, fixtures, preferredSize, candidate]);
  const [discovery, setDiscovery] = useState<{ key: string; options: SizeOption[]; initial: Size | null } | null>(null);
  const [choice, setChoice] = useState<{ key: string; size: Size } | null>(null);
  const [loaded, setLoaded] = useState<{ url: string; sidecar: Sidecar | null } | null>(null);
  useEffect(() => {
    let active = true;
    if (!body) return;
    const query = new URLSearchParams({ body, slot });
    if (candidate) query.set("gen", "v5.3");
    if (fixtures) query.set("fixtures", "1");
    fetch(`/api/size-garment?${query}`, { cache: "no-store" })
      .then(response => response.ok ? response.json() : [])
      .then((items: SizeOption[]) => {
        if (!active) return;
        const options = Array.isArray(items) ? items.filter(item => { try { const fit = parseFitMap(item.fit); return fit.body === body && fit.size === item.size && SIZES.includes(item.size) && typeof item.glb === "string" && typeof item.sidecar === "string"; } catch { return false; } }) : [];
        const initial = options.find(item => item.size === preferredSize)?.size ?? options.find(item => item.fit.recommended)?.size ?? options[0]?.size ?? null;
        setDiscovery({ key, options, initial });
      }).catch(() => { if (active) setDiscovery({ key, options: [], initial: null }); });
    return () => { active = false; };
  }, [body, slot, fixtures, preferredSize, candidate, key]);
  const resolved = !body || discovery?.key === key;
  const options = resolved && body ? discovery?.options ?? [] : [];
  const size = resolved ? (choice?.key === key ? choice.size : discovery?.initial ?? null) : null;
  const selected = options.find(option => option.size === size) ?? null;
  useEffect(() => {
    if (!selected) return;
    let active = true;
    fetch(selected.sidecar, { cache: "no-store" }).then(response => { if (!response.ok) throw new Error("Sidecar unavailable"); return response.json(); }).then(value => { if (active) setLoaded({ url: selected.glb, sidecar: parseSidecar(value) }); }).catch(() => { if (active) setLoaded({ url: selected.glb, sidecar: null }); });
    return () => { active = false; };
  }, [selected]);
  const setSize = (next: Size) => setChoice({ key, size: next });
  return { options, size, setSize, selected, resolved, garment: selected && loaded?.url === selected.glb ? { url: selected.glb, sidecar: loaded.sidecar } : null };
}

export function FitPicker({ title, options, selected, onSize, editorial = false }: { title: string; options: SizeOption[]; selected: Size | null; onSize: (size: Size) => void; editorial?: boolean }) {
  const fit = options.find(option => option.size === selected)?.fit;
  return <section className={`fit-picker${editorial ? " fit-editorial" : ""}`} aria-label={`${title} fit`}>
    <div className="fit-heading"><strong>{title} size</strong>{options.some(option => option.fit.recommended) && <span>● Recommended</span>}</div>
    <div className="fit-sizes" role="group" aria-label={`${title} size`}>{SIZES.map(size => { const recommended = options.some(option => option.size === size && option.fit.recommended); return <button type="button" key={size} disabled={!options.some(option => option.size === size)} aria-label={recommended ? `${size}, Recommended` : size} aria-pressed={selected === size} onClick={() => onSize(size)}>{size}{recommended && <span className="fit-recommended-dot" aria-hidden="true" title="Recommended" />}</button>; })}</div>
    {fit ? <div className="fit-summary">{isFullyClampedAndTight(fit) && <p className="fit-clamped-warning">Too small for this body. Shown at the closest wearable fit.</p>}<strong>{editorial ? "Fit analysis" : "Fit summary"}</strong>{Object.entries(fit.regions).map(([name, region]) => <p key={name} className="fit-label" data-fit={region.status}>{editorial && <><span className="fit-region-name">{name.replaceAll("_", " ")}</span><span className="fit-status">{region.status}</span></>}<span className="fit-region-detail">{formatRegion(name, region, fit.garment)}</span>{regionEstimateNote(region) && <small className="fit-estimate-note"> {regionEstimateNote(region)}</small>}</p>)}</div> : <p className="fit-unavailable">Size fits are not available yet.</p>}
  </section>;
}

export function MeasurementsForm() {
  const [values, setValues] = useState<Measurements>(emptyMeasurements), [saved, setSaved] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const id = useId();
  useEffect(() => { let active = true; Promise.resolve().then(() => { try { const raw = localStorage.getItem("vw-measurements-v1"); if (raw && active) { const stored = JSON.parse(raw); setValues(Object.fromEntries(names.map(key => [key, typeof stored[key] === "string" ? stored[key] : ""])) as Measurements); } } catch { /* local storage may be unavailable */ } }); return () => { active = false; }; }, []);
  const errors = Object.fromEntries(names.map(name => [name, measurementError(name, values[name])]));
  function validate() { setAttempted(true); return names.every(name => !errors[name]); }
  function store() { if (!validate()) return; try { localStorage.setItem("vw-measurements-v1", JSON.stringify(values)); setSaved(true); } catch { setSaved(false); } }
  function download() {
    if (!validate()) return;
    const url = URL.createObjectURL(new Blob([serializeMeasurements(values, new Date())], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "measurements.json"; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="measurements" aria-label="My measurements">
    <h3>My measurements</h3><p>Enter measurements in cm. Height is required; leave unknown measurements blank. The download uses today’s date.</p>
    <div className="measurement-grid">{names.map(name => {
      const field = measurementFields[name], error = errors[name], showError = !!error && (attempted || values[name] !== "");
      return <div key={name} className="measurement-field"><label htmlFor={`${id}-${name}`}>{field.label}{name === "height" ? " (required)" : " (optional)"}</label>
        <input id={`${id}-${name}`} type="number" min={field.min} max={field.max} step="0.1" value={values[name]} aria-invalid={showError} aria-describedby={`${id}-${name}-hint${showError ? ` ${id}-${name}-error` : ""}`} onChange={event => { setSaved(false); setValues(previous => ({ ...previous, [name]: event.target.value })); }} />
        <span id={`${id}-${name}-hint`} className="measurement-hint">{field.hint}</span>{showError && <span id={`${id}-${name}-error`} className="measurement-error">{error}</span>}
      </div>;
    })}</div>
    <div className="measurement-actions"><button type="button" onClick={store}>Save locally</button><button type="button" onClick={download}>Download JSON</button></div>{saved && <p role="status">Saved on this device.</p>}
  </section>;
}
