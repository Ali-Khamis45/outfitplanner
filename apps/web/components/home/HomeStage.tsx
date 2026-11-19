"use client";
import { Component, useCallback, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "@phosphor-icons/react";
import { TryOnScene } from "../try-on/TryOnScene";
const view = { view: "front" as const, id: 0 };
const top = { url: "/api/demo-garment?variant=v5.2", color: "#d8cdbb", sidecar: null };
const bottom = { url: "/api/demo-garment?variant=pants-v2", color: "#777a61", sidecar: null };
class PreviewBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? <p className="home-preview-message">The 3D preview is unavailable.<br />You can still explore your wardrobe.</p> : this.props.children; }
}
export default function HomeStage() {
  const stage = useRef<HTMLDivElement>(null), [loaded, setLoaded] = useState({ avatar: false, top: false, bottom: false }), [error, setError] = useState(false);
  const avatarReady = useCallback(() => setLoaded(value => ({ ...value, avatar: true })), []);
  const topReady = useCallback(() => setLoaded(value => ({ ...value, top: true })), []);
  const bottomReady = useCallback(() => setLoaded(value => ({ ...value, bottom: true })), []);
  const failed = useCallback(() => setError(true), []);
  const ready = loaded.avatar && loaded.top && loaded.bottom;
  return <div className="home-stage-card"><div className="home-stage-label"><span className="studio-dot" /> Your fitting room<span>3D preview</span></div>
    <div className="home-stage-canvas" ref={stage} style={{ visibility: ready && !error ? "visible" : "hidden" }}><PreviewBoundary onError={failed}><TryOnScene preview stageRef={stage} avatarUrl="/api/demo-avatar" pose="rest" top={top} bottom={bottom} heatmap={false} view={view} turntable={false} onAvatarReady={avatarReady} onTopReady={topReady} onBottomReady={bottomReady} onTopError={failed} onBottomError={failed} /></PreviewBoundary></div>
    {!ready && !error && <span className="home-stage-status">Loading neutral preview…</span>}
    {error && <p className="home-preview-message">The 3D preview is unavailable.<br />You can still explore your wardrobe.</p>}
    <div className="home-stage-footer"><div><span>{error ? "Garment preview unavailable" : "Neutral fit preview"}</span><strong>See it on. Make it yours.</strong></div><Link href="/try-on" className="icon-button" aria-label="Explore the fitting room"><ArrowUpRight size={22} /></Link></div></div>;
}
