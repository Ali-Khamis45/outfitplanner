"use client";
import { ArrowsClockwise, Camera, Cube, SlidersHorizontal } from "@phosphor-icons/react";
import { Component, useCallback, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import Link from "next/link";
import { AvatarScene } from "./AvatarScene";
import { AvatarInspector, LeftInspector } from "./AvatarInspector";
import { SceneControls } from "./SceneControls";
import type { AssetStatus, CameraView, ModelInfo, RenderStats } from "./types";

class SceneErrorBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("Avatar scene failed:", error, info); this.props.onError(); }
  render() { return this.state.failed ? <div className="scene-message error-message"><strong>Unable to load the MHR asset</strong><span>Check that outputs/avatars/mhr-neutral.glb exists, then reload this page.</span></div> : this.props.children; }
}

export function AvatarLab() {
  const [wireframe, setWireframe] = useState(false), [skeleton, setSkeleton] = useState(false), [grid, setGrid] = useState(true);
  const [status, setStatus] = useState<AssetStatus>("loading");
  const [model, setModel] = useState<ModelInfo | null>(null);
  const [stats, setStats] = useState<RenderStats>({ fps: null, calls: 0, triangles: 0 });
  const [command, setCommand] = useState<{ view: CameraView; id: number }>({ view: "reset", id: 0 });
  const [notice, setNotice] = useState("");
  const stage = useRef<HTMLDivElement>(null);
  const onReady = useCallback((info: ModelInfo) => { setModel(info); setStatus("ready"); }, []);
  const onError = useCallback(() => setStatus("error"), []);
  const onStats = useCallback((value: RenderStats) => setStats(value), []);
  const setView = useCallback((view: CameraView) => setCommand((prev) => ({ view, id: prev.id + 1 })), []);
  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await stage.current?.requestFullscreen(); }
    catch { setNotice("Fullscreen is not available in this browser."); }
  }
  function screenshot() {
    const canvas = stage.current?.querySelector("canvas");
    if (!canvas) { setNotice("The 3D canvas is not available yet."); return; }
    try {
      canvas.toBlob((blob) => {
        if (!blob) { setNotice("Screenshot could not be created."); return; }
        const url = URL.createObjectURL(blob), link = document.createElement("a");
        link.href = url; link.download = "mhr-avatar-lab.png"; link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice("Screenshot saved from the 3D canvas.");
      }, "image/png");
    } catch { setNotice("Screenshot could not be created in this browser."); }
  }
  return <main className="lab-shell">
    <header className="lab-header"><Link href="/" className="brand"><span className="brand-mark"><Cube size={18} weight="bold" /></span><span>virtual<span className="brand-light">wardrobe</span><small>RESEARCH STUDIO</small></span></Link>
      <div className="header-center"><span className="header-divider" /><span>Avatar Reconstruction Lab</span><span className="header-badge">SPRINT 0</span></div><div className="header-right"><span className="status-dot" /> LOCAL ENVIRONMENT <span className="header-index">/ 01</span></div>
    </header>
    <div className="lab-body"><LeftInspector skeleton={skeleton} wireframe={wireframe} grid={grid} setSkeleton={setSkeleton} setWireframe={setWireframe} setGrid={setGrid} status={status} />
      <section className="workspace" aria-label="3D avatar studio"><div className="workspace-heading"><div><div className="overline">AVATAR RECONSTRUCTION <span>/</span> VIEWER</div><h1>Avatar studio<span>.</span></h1><p>Inspect the geometry behind the silhouette.</p></div><div className="workspace-id"><span>ACTIVE ASSET</span><strong>MHR / 001</strong></div></div>
        <div className="stage" ref={stage}><div className="stage-caption"><span className="status-dot" /> <span>3D VIEWPORT</span><span className="stage-caption-secondary"> / MHR NEUTRAL</span></div><span className="stage-top-right">PERSPECTIVE <span>·</span> METERS</span>
          <SceneErrorBoundary onError={onError}><AvatarScene wireframe={wireframe} skeleton={skeleton} grid={grid} model={model} command={command} onReady={onReady} onStats={onStats} onError={onError} /></SceneErrorBoundary>
          {status === "loading" && <div className="scene-message" role="status"><span className="loader" />Loading MHR geometry…</div>}
          <div className="stage-bottom-left"><span className="axis-x">X</span><span className="axis-y">Y</span><span className="axis-z">Z</span><span>DRAG TO ORBIT <i>·</i> SCROLL TO ZOOM</span></div>
          <SceneControls view={command.view} setView={setView} grid={grid} setGrid={setGrid} fullscreen={fullscreen} screenshot={screenshot} ready={status === "ready"} />
        </div>
        <div className="workspace-under"><span><span className="status-dot" /> {status === "ready" ? "ASSET READY" : status === "error" ? "ASSET ERROR" : "LOADING ASSET"}</span><span>NEUTRAL POSE <b>·</b> LOD 1 <b>·</b> SKINNED GLB</span></div>
      </section><AvatarInspector model={model} stats={stats} /></div>
    <footer className="lab-toolbar"><div className="toolbar-group"><span className="toolbar-label">PERFORMANCE</span><strong>{stats.fps === null ? "—" : stats.fps}</strong><span>FPS</span><small>ON INTERACTION</small></div><span className="toolbar-rule" /><div className="toolbar-group"><SlidersHorizontal size={16} /><span>RENDER MODE</span><strong>{wireframe ? "Wireframe" : "Solid"}</strong></div><span className="toolbar-rule" /><div className="toolbar-group toolbar-asset"><span className={status === "ready" ? "status-dot" : "status-dot muted"} /><span>{status === "ready" ? "MHR neutral loaded" : status === "error" ? "Asset unavailable" : "Loading MHR asset"}</span></div><div className="toolbar-spacer" /><button className="toolbar-reset" onClick={() => setView("reset")} disabled={status !== "ready"}><ArrowsClockwise size={16} /> Reset view</button><button className="capture-button" onClick={screenshot} disabled={status !== "ready"}><Camera size={17} /> Capture</button></footer>
    <div className="sr-only" role="status" aria-live="polite">{notice}</div>{notice && <button className="toast" onClick={() => setNotice("")}>{notice} <span>×</span></button>}
  </main>;
}
