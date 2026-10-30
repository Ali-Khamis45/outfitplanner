"use client";
import { ArrowsClockwise, ArrowsOut, Camera, GridFour } from "@phosphor-icons/react";
import type { CameraView } from "./types";

export function SceneControls({ view, setView, grid, setGrid, fullscreen, screenshot, ready }: { view: CameraView; setView: (view: CameraView) => void; grid: boolean; setGrid: (value: boolean) => void; fullscreen: () => void; screenshot: () => void; ready: boolean }) {
  return <>
    <div className="view-controls" aria-label="Camera presets">
      {(["front", "back", "left", "right"] as const).map((item) => <button key={item} className={view === item ? "selected" : ""} aria-pressed={view === item} onClick={() => setView(item)} disabled={!ready}>{item}</button>)}
      <span className="control-divider" />
      <button className="icon-button" aria-label="Reset camera" title="Reset camera" onClick={() => setView("reset")} disabled={!ready}><ArrowsClockwise size={17} /></button>
    </div>
    <div className="scene-actions">
      <button className={grid ? "icon-button selected" : "icon-button"} aria-label="Toggle floor grid" aria-pressed={grid} title="Toggle grid" onClick={() => setGrid(!grid)}><GridFour size={17} /></button>
      <button className="icon-button" aria-label="Take screenshot" title="Take screenshot" onClick={screenshot} disabled={!ready}><Camera size={17} /></button>
      <button className="icon-button" aria-label="Toggle fullscreen" title="Toggle fullscreen" onClick={fullscreen}><ArrowsOut size={17} /></button>
    </div>
  </>;
}
