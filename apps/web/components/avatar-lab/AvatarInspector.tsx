"use client";
import { SquaresFour } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { AssetStatus, AvatarSource, GarmentStatus, ModelInfo, RenderStats } from "./types";
import { AvatarSourcePanel } from "./AvatarSourcePanel";
import { ReconstructionPanel } from "./ReconstructionPanel";

function Value({ label, value }: { label: string; value: string }) { return <div className="data-row"><dt>{label}</dt><dd>{value}</dd></div>; }
function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (value: boolean) => void }) {
  return <label className="toggle-row"><span><strong>{label}</strong><small>{hint}</small></span><input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} /><span className="toggle-track" aria-hidden="true"><span /></span></label>;
}
export function LeftInspector({ source, onSelectSource, skeleton, wireframe, garmentWireframe, grid, turntable, setSkeleton, setWireframe, setGarmentWireframe, setGrid, setTurntable, status, children }: { children?: ReactNode; source: AvatarSource; onSelectSource: (source: AvatarSource) => void; skeleton: boolean; wireframe: boolean; garmentWireframe: boolean; grid: boolean; turntable: boolean; setSkeleton: (v: boolean) => void; setWireframe: (v: boolean) => void; setGarmentWireframe: (v: boolean) => void; setGrid: (v: boolean) => void; setTurntable: (v: boolean) => void; status: AssetStatus }) {
  return <aside className="lab-sidebar left-sidebar" aria-label="Avatar controls">
    <div className="panel-heading"><span>WORKSPACE</span><span>01</span></div>
    <AvatarSourcePanel source={source} onSelect={onSelectSource} />
    {children}
    <section className="side-section"><div className="section-title"><SquaresFour size={18} /><h2>Mesh inspection</h2></div>
      <Toggle label="Turntable" hint="Rotate 360° around the avatar" value={turntable} onChange={setTurntable} />
      <Toggle label="Skeleton" hint="Show joint hierarchy" value={skeleton} onChange={setSkeleton} />
      <Toggle label="Body wireframe" hint="Inspect body triangles" value={wireframe} onChange={setWireframe} />
      <Toggle label="Garment wireframe" hint="Inspect shirt triangles independently" value={garmentWireframe} onChange={setGarmentWireframe} />
    </section>
    <ReconstructionPanel />
    <section className="side-section"><div className="section-title"><span className="section-icon">◫</span><h2>Display settings</h2></div><Toggle label="Floor grid" hint="Spatial reference" value={grid} onChange={setGrid} /></section>
    <div className="side-footer"><span className={status === "ready" ? "status-dot" : "status-dot muted"} />{status === "ready" ? "Model loaded locally" : status === "error" ? "Asset unavailable" : "Loading local asset"}</div>
  </aside>;
}
export function AvatarInspector({ source, model, stats, garment }: { source: AvatarSource; model: ModelInfo | null; stats: RenderStats; garment: GarmentStatus | null }) {
  const n = (value: number | undefined) => value === undefined ? "—" : value.toLocaleString();
  const personal = source.kind === "personal";
  return <aside className="lab-sidebar right-sidebar" aria-label="Model metadata">
    <div className="panel-heading"><span>INSPECTOR</span><span>LIVE</span></div>
    <section className="side-section"><div className="inspector-eyebrow">ASSET DETAILS</div><h2 className="inspector-title">Model metadata</h2><p className="side-note">Geometry read directly from the loaded GLB.</p>
      <dl className="data-list"><Value label="Format" value={model ? "GLB 2.0" : "—"} /><Value label="Avatar" value={personal ? "Personal · local file" : "Neutral · MHR"} />{personal && <Value label="File" value={source.fileName} />}<Value label="Pose" value={personal ? "As exported (verify file)" : "Rest"} /><Value label="Vertices" value={n(model?.vertices)} /><Value label="Triangles" value={n(model?.triangles)} /></dl>
      {personal && <p className="side-note">Model-estimated body shape, not a measured digital twin. Loaded from a local file; nothing is uploaded.</p>}
    </section>
    {garment && <section className="side-section"><div className="inspector-eyebrow">GARMENT</div><h2 className="inspector-title">Garment binding</h2>
      {garment.state === "ready" ? <dl className="data-list"><Value label="Asset" value={garment.info.garmentId} /><Value label="Fitted to" value={garment.info.bodyVariant} /><Value label="Vertices" value={n(garment.info.vertices)} /><Value label="Triangles" value={n(garment.info.triangles)} /><Value label="Joints bound" value={n(garment.info.joints)} /><Value label="Inverse-bind Δ" value={garment.info.maxInverseBindDelta.toExponential(1)} /></dl> : <p className="side-note">{garment.state === "loading" ? "Loading and binding…" : garment.state === "error" ? garment.message : "No garment loaded."}</p>}
      <p className="side-note">Linear blend skinning only: no cloth simulation, collision response or size accuracy.</p>
    </section>}
    <section className="side-section"><div className="inspector-eyebrow">STRUCTURE</div><h2 className="inspector-title">Rig &amp; scale</h2>
      <dl className="data-list"><Value label="Joints" value={n(model?.joints)} /><Value label="Skinned meshes" value={n(model?.skinnedMeshes)} /><Value label="Skin attributes" value={model ? (model.hasSkinning ? "Present" : "Missing") : "—"} /><Value label="Height" value={model ? `${model.size[1].toFixed(2)} m` : "—"} /><Value label="Up axis" value="+Y" /></dl>
      <p className="side-note">Four normalized influences per vertex in the official export.</p>
    </section>
    <section className="side-section"><div className="inspector-eyebrow">RENDERING</div><h2 className="inspector-title">Scene performance</h2><dl className="data-list"><Value label="Draw calls" value={stats.fps === null ? "—" : n(stats.calls)} /><Value label="Rendered triangles" value={stats.fps === null ? "—" : n(stats.triangles)} /><Value label="Pixel ratio" value="Up to 1.5×" /></dl><p className="side-note">Stats sample while the scene is active.</p></section>
  </aside>;
}
