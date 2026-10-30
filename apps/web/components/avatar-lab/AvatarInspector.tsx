"use client";
import { Cube, Fingerprint, SquaresFour } from "@phosphor-icons/react";
import type { AssetStatus, ModelInfo, RenderStats } from "./types";

function Value({ label, value }: { label: string; value: string }) { return <div className="data-row"><dt>{label}</dt><dd>{value}</dd></div>; }
function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (value: boolean) => void }) {
  return <label className="toggle-row"><span><strong>{label}</strong><small>{hint}</small></span><input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} /><span className="toggle-track" aria-hidden="true"><span /></span></label>;
}
export function LeftInspector({ skeleton, wireframe, grid, setSkeleton, setWireframe, setGrid, status }: { skeleton: boolean; wireframe: boolean; grid: boolean; setSkeleton: (v: boolean) => void; setWireframe: (v: boolean) => void; setGrid: (v: boolean) => void; status: AssetStatus }) {
  return <aside className="lab-sidebar left-sidebar" aria-label="Avatar controls">
    <div className="panel-heading"><span>WORKSPACE</span><span>01</span></div>
    <section className="side-section"><div className="section-title"><Fingerprint size={18} /><h2>Avatar</h2></div>
      <div className="avatar-summary"><div className="avatar-symbol"><Cube size={25} weight="light" /></div><div><strong>MHR neutral</strong><small>Research reference · LOD 1</small></div></div>
      <label className="field-label" htmlFor="model-select">ACTIVE MODEL</label><select id="model-select" defaultValue="mhr"><option value="mhr">MHR / Neutral body</option></select>
      <p className="side-note">Official MHR export with a skinned armature.</p>
    </section>
    <section className="side-section"><div className="section-title"><SquaresFour size={18} /><h2>Mesh inspection</h2></div>
      <Toggle label="Skeleton" hint="Show joint hierarchy" value={skeleton} onChange={setSkeleton} />
      <Toggle label="Wireframe" hint="Inspect mesh topology" value={wireframe} onChange={setWireframe} />
    </section>
    <section className="side-section"><div className="section-title"><span className="section-icon">◫</span><h2>Display settings</h2></div><Toggle label="Floor grid" hint="Spatial reference" value={grid} onChange={setGrid} /></section>
    <div className="side-footer"><span className={status === "ready" ? "status-dot" : "status-dot muted"} />{status === "ready" ? "Model loaded locally" : status === "error" ? "Asset unavailable" : "Loading local asset"}</div>
  </aside>;
}
export function AvatarInspector({ model, stats }: { model: ModelInfo | null; stats: RenderStats }) {
  const n = (value: number | undefined) => value === undefined ? "—" : value.toLocaleString();
  return <aside className="lab-sidebar right-sidebar" aria-label="Model metadata">
    <div className="panel-heading"><span>INSPECTOR</span><span>LIVE</span></div>
    <section className="side-section"><div className="inspector-eyebrow">ASSET DETAILS</div><h2 className="inspector-title">Model metadata</h2><p className="side-note">Geometry read directly from the loaded GLB.</p>
      <dl className="data-list"><Value label="Format" value={model ? "GLB 2.0" : "—"} /><Value label="Source" value="Meta · MHR" /><Value label="Level of detail" value="LOD 1" /><Value label="Vertices" value={n(model?.vertices)} /><Value label="Triangles" value={n(model?.triangles)} /></dl>
    </section>
    <section className="side-section"><div className="inspector-eyebrow">STRUCTURE</div><h2 className="inspector-title">Rig &amp; scale</h2>
      <dl className="data-list"><Value label="Joints" value={n(model?.joints)} /><Value label="Skinned meshes" value={n(model?.skinnedMeshes)} /><Value label="Skin attributes" value={model ? (model.hasSkinning ? "Present" : "Missing") : "—"} /><Value label="Height" value={model ? `${model.size[1].toFixed(2)} m` : "—"} /><Value label="Up axis" value="+Y" /></dl>
      <p className="side-note">Four normalized influences per vertex in the official export.</p>
    </section>
    <section className="side-section"><div className="inspector-eyebrow">RENDERING</div><h2 className="inspector-title">Scene performance</h2><dl className="data-list"><Value label="Draw calls" value={stats.fps === null ? "—" : n(stats.calls)} /><Value label="Rendered triangles" value={stats.fps === null ? "—" : n(stats.triangles)} /><Value label="Pixel ratio" value="Up to 1.5×" /></dl><p className="side-note">Stats sample while the scene is active.</p></section>
  </aside>;
}
