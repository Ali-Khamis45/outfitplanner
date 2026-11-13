"use client";
import { useEffect, useId, useState } from "react";
import { emptyMeasurements, measurementError, measurementFields, names, serializeMeasurements, type Measurements } from "../lib/measurements";
import { parseSidecar, type Sidecar } from "../lib/garment/correctives";
import { formatRegion, parseFitMap, SIZES, type Size, type SizeOption, type Slot } from "../lib/garment/fitMap";

export function useSizes(body: string | null, slot: Slot, fixtures = false) {
  const [options, setOptions] = useState<SizeOption[]>([]), [size, setSize] = useState<Size | null>(null);
  const [loaded, setLoaded] = useState<{ url: string; sidecar: Sidecar } | null>(null);
  useEffect(() => {
    let active = true;
    if (!body) return;
    const query = new URLSearchParams({ body, slot });
    if (fixtures) query.set("fixtures", "1");
    fetch(`/api/size-garment?${query}`, { cache: "no-store" })
      .then(response => response.ok ? response.json() : [])
      .then((items: SizeOption[]) => {
        if (!active) return;
        const valid = Array.isArray(items) ? items.filter(item => { try { parseFitMap(item.fit); return SIZES.includes(item.size) && typeof item.glb === "string" && typeof item.sidecar === "string"; } catch { return false; } }) : [];
        setOptions(valid); setSize(valid.find(item => item.fit.recommended)?.size ?? valid[0]?.size ?? null); setLoaded(null);
      }).catch(() => { if (active) { setOptions([]); setSize(null); setLoaded(null); } });
    return () => { active = false; };
  }, [body, slot, fixtures]);
  const selected = body ? options.find(option => option.size === size && option.fit.body === body) ?? null : null;
  useEffect(() => {
    if (!selected) return;
    let active = true;
    fetch(selected.sidecar, { cache: "no-store" }).then(response => { if (!response.ok) throw new Error("Sidecar unavailable"); return response.json(); }).then(value => { if (active) setLoaded({ url: selected.glb, sidecar: parseSidecar(value) }); }).catch(() => { if (active) setLoaded(null); });
    return () => { active = false; };
  }, [selected]);
  return { options: body ? options.filter(option => option.fit.body === body) : [], size, setSize, selected, garment: selected && loaded?.url === selected.glb ? { url: selected.glb, sidecar: loaded.sidecar } : null };
}

export function FitPicker({ title, options, selected, onSize }: { title: string; options: SizeOption[]; selected: Size | null; onSize: (size: Size) => void }) {
  const fit = options.find(option => option.size === selected)?.fit;
  return <section className="fit-picker" aria-label={`${title} fit`}>
    <div className="fit-heading"><strong>{title} size</strong>{options.some(option => option.fit.recommended) && <span>● Recommended</span>}</div>
    <div className="fit-sizes" role="group" aria-label={`${title} size`}>{SIZES.map(size => { const recommended = options.some(option => option.size === size && option.fit.recommended); return <button type="button" key={size} disabled={!options.some(option => option.size === size)} aria-label={recommended ? `${size}, Recommended` : size} aria-pressed={selected === size} onClick={() => onSize(size)}>{size}{recommended && <span className="fit-recommended-dot" aria-hidden="true" title="Recommended" />}</button>; })}</div>
    {fit ? <div className="fit-summary"><strong>Fit summary</strong>{Object.entries(fit.regions).map(([name, region]) => <p key={name}>{formatRegion(name, region, fit.garment)}</p>)}</div> : <p className="fit-unavailable">Size fits are not available yet.</p>}
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
