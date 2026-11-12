"use client";
import { ArrowCounterClockwise, TShirt } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { TEST_POSES, type PoseName } from "../../lib/garment/poses";
import { parseSidecar } from "../../lib/garment/correctives";
import { DEFAULT_DEMO_VARIANT } from "../../lib/garment/demoResources";
import { LocalGlbError, readLocalGlb } from "../../lib/localGlb";
import type { DemoGarmentVariant, GarmentSource, GarmentStatus } from "./types";

const DEMO_LABELS: Record<DemoGarmentVariant, string> = { v5: "T-shirt v5 \u00b7 corrective morphs", v1: "Original T-shirt (Sprint 1.0)", v2: "Improved T-shirt (Sprint 1.1)", "v2-lod": "Improved T-shirt · low detail", v3: "Experimental v3 · geometry test", v4: "Experimental v4 · underarm gusset" };
export const demoGarment = (variant: DemoGarmentVariant): GarmentSource => ({ kind: "demo", variant, url: `/api/demo-garment?variant=${variant}`, label: DEMO_LABELS[variant] });
export const DEMO_GARMENT = demoGarment(DEFAULT_DEMO_VARIANT);

interface Props {
  enabled: boolean; setEnabled: (value: boolean) => void;
  source: GarmentSource; onSource: (source: GarmentSource) => void;
  visible: boolean; setVisible: (value: boolean) => void;
  color: string; setColor: (value: string) => void;
  pose: PoseName; setPose: (value: PoseName) => void;
  status: GarmentStatus; avatarReady: boolean; correctives: boolean; setCorrectives: (value: boolean) => void; weights: Record<string, number>;
}

/** Garment experiment controls. Local garment files (e.g. personal fits) stay in the browser like personal avatars. */
export function GarmentPanel({ enabled, setEnabled, source, onSource, visible, setVisible, color, setColor, pose, setPose, status, avatarReady, correctives, setCorrectives, weights }: Props) {
  const [local, setLocal] = useState<GarmentSource | null>(null);
  const [error, setError] = useState("");
  const blobUrl = useRef<string | null>(null);
  useEffect(() => () => { if (blobUrl.current) URL.revokeObjectURL(blobUrl.current); }, []);

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const file = files.find(item => item.name.toLowerCase().endsWith(".glb"));
    event.target.value = "";
    setError("");
    if (!file) return;
    try {
      const sidecarFile = files.find(item => item.name === `${file.name.replace(/\.glb$/i, "")}.correctives.json` || item.name === `${file.name}.correctives.json`);
      const sidecar = sidecarFile ? parseSidecar(JSON.parse(await sidecarFile.text())) : null;
      const glb = await readLocalGlb(file);
      const next: GarmentSource = { kind: "local", label: "Local garment", ...glb, sidecar };
      const previous = blobUrl.current;
      blobUrl.current = glb.url;
      setLocal(next); onSource(next);
      if (previous) URL.revokeObjectURL(previous);
    } catch (reason) {
      setError(reason instanceof LocalGlbError ? reason.message : "The selected file could not be read by this browser.");
    }
  }

  function chooseKind(kind: DemoGarmentVariant | "local") {
    setError("");
    if (kind !== "local") onSource(demoGarment(kind));
    else if (local) onSource(local);
    else onSource({ kind: "local", url: "", label: "Local garment", fileName: "", bytes: 0, sha256: null });
  }

  return <section className="side-section garment-panel" aria-labelledby="garment-heading">
    <div className="section-title"><TShirt size={18} /><h2 id="garment-heading">Garment experiment</h2></div>
    <label className="toggle-row"><span><strong>Show garment layer</strong><small>Skinned T-shirt bound to the avatar skeleton</small></span><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={!avatarReady} /><span className="toggle-track" aria-hidden="true"><span /></span></label>
    {enabled && <>
      <label className="field-label" htmlFor="garment-select">GARMENT</label>
      <select id="garment-select" value={source.kind === "demo" ? source.variant : "local"} onChange={(event) => chooseKind(event.target.value as DemoGarmentVariant | "local")}><option value="v2">Improved T-shirt (v2) · neutral fit</option><option value="v1">Original T-shirt (v1) · neutral fit</option><option value="v2-lod">Improved T-shirt (v2, low detail) · neutral fit</option><option value="v3">Experimental v3 · unverified geometry test</option><option value="v4">Experimental v4 · underarm gusset (failed gates)</option><option value="v5">T-shirt v5 &#183; corrective morphs</option><option value="local">Local garment GLB…</option></select>
      {source.kind === "demo" && source.variant === "v3" && <p className="side-note">Experimental geometry test, not an approved fix. Neutral body only.</p>}
      {source.kind === "demo" && source.variant === "v4" && <p className="side-note">Explicit stitched underarm gusset panel. Experimental: it fails the stretch and +120° gates and is not the default. Neutral body only.</p>}
      {source.kind === "demo" && (source.variant === "v2" || source.variant === "v2-lod") && <p className="side-note">Underarm fins reduced and weights rebuilt; residual underarm stretch remains at large arm raises (its numeric gate is not passed). Neutral body only.</p>}
      {source.kind === "local" && <>
        <p className="side-note">Select the GLB and its matching .correctives.json together (sidecar optional), fitted to this avatar&apos;s skeleton. It is read locally and never uploaded.</p>
        <label className="photo-picker" htmlFor="garment-glb">{local ? "Choose another garment" : "Choose garment GLB"}</label>
        <input id="garment-glb" className="photo-input" type="file" accept=".glb,.json,model/gltf-binary,application/json" multiple onChange={selectFile} />
        {source.fileName && <p className="side-note garment-file" title={source.sha256 ?? undefined}>{source.fileName}{source.sha256 ? ` · ${source.sha256.slice(0, 10)}…` : ""}</p>}
      </>}
      <label className="toggle-row"><span><strong>Correctives</strong><small>Pose-driven morph targets</small></span><input type="checkbox" checked={correctives} onChange={event => setCorrectives(event.target.checked)} /><span className="toggle-track" aria-hidden="true"><span /></span></label>
      <p className="side-note">{Object.entries(weights).length ? Object.entries(weights).map(([name, weight]) => <span key={name}>{name}: {weight.toFixed(2)}<br /></span>) : "No corrective targets loaded."}</p>
      <label className="toggle-row"><span><strong>Visible</strong><small>Hide without unloading</small></span><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /><span className="toggle-track" aria-hidden="true"><span /></span></label>
      <label className="color-row" htmlFor="garment-color"><span><strong>Base colour</strong><small>PBR base colour (roughness/metalness from the asset)</small></span><input id="garment-color" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
      <p className={status.state === "error" ? "reconstruction-error" : "reconstruction-blocked"} role={status.state === "error" ? "alert" : "status"}>
        {status.state === "loading" && "Loading and binding garment…"}
        {status.state === "ready" && <>BOUND · {status.info.joints} joints · inverse-bind Δ {status.info.maxInverseBindDelta.toExponential(1)}<br />{status.info.vertices.toLocaleString()} vertices · fitted to {status.info.bodyVariant}</>}
        {status.state === "error" && status.message}
        {status.state === "off" && "Choose a garment file to load it."}
      </p>
    </>}
    {error && <p className="reconstruction-error" role="alert">{error}</p>}
    <label className="field-label" htmlFor="pose-select">TEST POSE</label>
    <div className="pose-row"><select id="pose-select" value={pose} onChange={(event) => setPose(event.target.value as PoseName)} disabled={!avatarReady}><optgroup label="Supported">{TEST_POSES.filter(item => item.name !== "both-120").map((item) => <option key={item.name} value={item.name}>{item.label}</option>)}</optgroup><optgroup label="Unsupported (diagnostic)">{TEST_POSES.filter(item => item.name === "both-120").map((item) => <option key={item.name} value={item.name}>{item.label}</option>)}</optgroup></select>
      <button className="icon-button" aria-label="Reset avatar pose" title="Reset avatar pose" onClick={() => setPose("rest")} disabled={!avatarReady || pose === "rest"}><ArrowCounterClockwise size={16} /></button></div>
    <button className="photo-picker" type="button" disabled={!avatarReady} onClick={() => setPose(pose === "both-90" ? "rest" : "both-90")}>{pose === "both-90" ? "Compare: return to rest" : "Compare: raise both arms"}</button>
    <p className="side-note">Switch between the original and improved shirts at the same pose to compare them.</p>
    <p className="side-note">Above 90&#176; arm raise needs cloth simulation.</p>
    <p className="side-note">Rigid joint rotations for skinning tests only; not animation or cloth simulation.</p>
  </section>;
}
