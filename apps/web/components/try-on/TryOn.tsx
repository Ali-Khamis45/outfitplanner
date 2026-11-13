"use client";
import { ArrowClockwise, ArrowLeft, ArrowsClockwise, Check, UploadSimple } from "@phosphor-icons/react";
import { useGLTF } from "@react-three/drei";
import Link from "next/link";
import { Component, Suspense, useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { createPantsChecker, createSidecarLoader } from "../../lib/garment/demoResources";
import type { Sidecar } from "../../lib/garment/correctives";
import { LocalGlbError, readLocalGlb, type LocalGlb } from "../../lib/localGlb";
import type { CameraView } from "../avatar-lab/types";
import { TryOnScene, type OutfitItem } from "./TryOnScene";

const TOP_URL = "/api/demo-garment?variant=v5.2", BOTTOM_URL = "/api/demo-garment?variant=pants-v2";
const NEUTRAL_URL = "/api/demo-avatar";
const loadTopSidecar = createSidecarLoader(), loadBottomSidecar = createSidecarLoader();
const checkBottom = createPantsChecker(BOTTOM_URL);
const colors = [
  { name: "Chalk", value: "#e9e3d5" }, { name: "Ink", value: "#303338" },
  { name: "Moss", value: "#777f69" }, { name: "Clay", value: "#a66f5c" },
  { name: "Ocean", value: "#536b80" }, { name: "Sand", value: "#c3ae92" },
  { name: "Wine", value: "#734e52" }, { name: "Slate", value: "#85888a" },
];
const poses = [{ label: "Stand", value: "rest" }, { label: "Walk", value: "walk" }, { label: "Arms out", value: "both-90" }] as const;
type Pose = (typeof poses)[number]["value"];

class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? <div className="try-stage-message">This avatar could not be displayed. Please choose another file.</div> : this.props.children; }
}

function OutfitSlot({ number, name, description, enabled, onEnabled, color, onColor, available }: {
  number: string; name: string; description: string; enabled: boolean; onEnabled: (value: boolean) => void;
  color: string; onColor: (value: string) => void; available: boolean;
}) {
  return <section className="try-slot" aria-label={name}>
    <div className="try-slot-heading"><span className="try-slot-number">{number}</span><div><h3>{name}</h3><p>{description}</p></div>
      <label className="try-switch"><span className="try-sr-only">Show {name.toLowerCase()}</span><input type="checkbox" checked={enabled} disabled={!available} onChange={event => onEnabled(event.target.checked)} /><span aria-hidden="true" /></label>
    </div>
    <div className="try-color-heading"><span>COLOUR</span><span>{colors.find(item => item.value === color)?.name}</span></div>
    <div className="try-swatches" role="group" aria-label={`${name} colour`}>
      {colors.map(item => <button key={item.value} type="button" title={item.name} aria-label={`${name}: ${item.name}`} aria-pressed={color === item.value} disabled={!enabled || !available} className={color === item.value ? "try-swatch selected" : "try-swatch"} onClick={() => onColor(item.value)}><span style={{ backgroundColor: item.value }} /></button>)}
    </div>
    {!available && <p className="try-hint">Pants are not available yet.</p>}
  </section>;
}

export function TryOn() {
  const [topEnabled, setTopEnabled] = useState(true), [bottomEnabled, setBottomEnabled] = useState(true);
  const [topColor, setTopColor] = useState(colors[4].value), [bottomColor, setBottomColor] = useState(colors[1].value);
  const [topSidecar, setTopSidecar] = useState<Sidecar | null | undefined>(undefined), [bottomSidecar, setBottomSidecar] = useState<Sidecar | null | undefined>(undefined);
  const [bottomAvailability, setBottomAvailability] = useState<"checking" | "available" | "missing" | "error">("checking");
  const [pose, setPose] = useState<Pose>("rest"), [turntable, setTurntable] = useState(false);
  const [view, setView] = useState<{ view: CameraView; id: number }>({ view: "front", id: 0 });
  const [personal, setPersonal] = useState<LocalGlb | null>(null), [avatar, setAvatar] = useState<"neutral" | "personal">("neutral");
  const [avatarReady, setAvatarReady] = useState(false), [avatarFailed, setAvatarFailed] = useState(false), [message, setMessage] = useState("");
  const [topReady, setTopReady] = useState(false), [bottomReady, setBottomReady] = useState(false);
  const personalUrl = useRef<string | null>(null);
  const stageRef = useRef<HTMLElement>(null);
  const avatarUrl = avatar === "personal" && personal ? personal.url : NEUTRAL_URL;
  useEffect(() => {
    let active = true;
    useGLTF.preload(NEUTRAL_URL);
    useGLTF.preload(TOP_URL);
    loadTopSidecar(TOP_URL).then(value => { if (active) setTopSidecar(value); });
    checkBottom().then(result => {
      if (active) setBottomAvailability(result);
      if (result === "available") { useGLTF.preload(BOTTOM_URL); loadBottomSidecar(BOTTOM_URL).then(value => { if (active) setBottomSidecar(value); }); }
    });
    return () => { active = false; };
  }, []);
  useEffect(() => () => { if (personalUrl.current) URL.revokeObjectURL(personalUrl.current); }, []);
  const onAvatarReady = useCallback(() => setAvatarReady(true), []);
  const onAvatarError = useCallback(() => { setAvatarReady(false); setAvatarFailed(true); }, []);
  const onTopReady = useCallback(() => setTopReady(true), []);
  const onBottomReady = useCallback(() => setBottomReady(true), []);
  const onTopError = useCallback(() => { setTopReady(true); setMessage("This top could not be fitted to the selected avatar."); }, []);
  const onBottomError = useCallback(() => { setBottomReady(true); setMessage("These pants could not be fitted to the selected avatar."); }, []);
  const top: OutfitItem | null = topEnabled && topSidecar !== undefined ? { url: TOP_URL, color: topColor, sidecar: topSidecar } : null;
  const bottom: OutfitItem | null = bottomEnabled && bottomAvailability === "available" && bottomSidecar !== undefined ? { url: BOTTOM_URL, color: bottomColor, sidecar: bottomSidecar } : null;
  const outfitReady = avatarReady && (!topEnabled || topReady) && (!bottomEnabled || bottomAvailability === "missing" || bottomAvailability === "error" || bottomReady);
  const showTop = (enabled: boolean) => { if (enabled) setTopReady(false); setTopEnabled(enabled); };
  const showBottom = (enabled: boolean) => { if (enabled) setBottomReady(false); setBottomEnabled(enabled); };
  const changeView = (next: CameraView) => { setTurntable(false); setView(previous => ({ view: next, id: previous.id + 1 })); };
  const switchAvatar = (next: "neutral" | "personal") => { setAvatar(next); setAvatarReady(false); setTopReady(false); setBottomReady(false); setAvatarFailed(false); setMessage(""); };
  async function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    try {
      const loaded = await readLocalGlb(file);
      const previous = personalUrl.current;
      personalUrl.current = loaded.url; setPersonal(loaded); setAvatar("personal"); setAvatarReady(false); setTopReady(false); setBottomReady(false); setAvatarFailed(false); setMessage("");
      if (previous) URL.revokeObjectURL(previous);
    } catch (error) { setMessage(error instanceof LocalGlbError ? error.message : "Could not open that file. Please try another GLB."); }
  }
  return <main className="try-page">
    <section className="try-stage" ref={stageRef} aria-label="3D outfit preview">
      <div className="try-stage-top"><Link href="/" className="try-brand"><span className="try-brand-icon">v<span>.</span></span><span>virtual<br />wardrobe</span></Link><span className="try-stage-caption">THE FITTING ROOM <i /> 01</span></div>
      <div className={outfitReady || avatarFailed ? "try-viewport ready" : "try-viewport"}><SceneBoundary key={avatarUrl} onError={onAvatarError}><Suspense fallback={null}><TryOnScene key={avatarUrl} stageRef={stageRef} avatarUrl={avatarUrl} pose={pose} top={top} bottom={bottom} view={view} turntable={turntable} onAvatarReady={onAvatarReady} onTopReady={onTopReady} onBottomReady={onBottomReady} onTopError={onTopError} onBottomError={onBottomError} /></Suspense></SceneBoundary></div>
      {!outfitReady && !avatarFailed && <div className="try-stage-loading" role="status">Preparing your fitting room<span>...</span><span className="try-loading-bar" aria-hidden="true"><i /></span></div>}
      <div className="try-stage-bottom"><div><span className="try-eyebrow light">YOUR PERSPECTIVE</span><p>Make it yours.</p></div><span className="try-drag-hint">DRAG TO ROTATE <ArrowClockwise size={17} /></span></div>
      <div className="try-camera" aria-label="Camera views"><button onClick={() => changeView("front")}>Front</button><button onClick={() => changeView("left")}>Side</button><button onClick={() => changeView("back")}>Back</button><span className="try-camera-rule" /><button className={turntable ? "active" : ""} aria-pressed={turntable} onClick={() => setTurntable(!turntable)}><ArrowsClockwise size={16} /> 360°</button></div>
    </section>
    <aside className="try-panel" aria-label="Outfit controls">
      <div className="try-panel-inner"><div className="try-panel-top"><Link href="/" className="try-back"><ArrowLeft size={15} /> BACK</Link><span>YOUR SPACE / 01</span></div>
        <header className="try-heading"><span className="try-eyebrow">THE VIRTUAL FITTING ROOM</span><h1>Make yourself<br /><em>at home.</em></h1><p>Good style starts with a little exploration. Find a look that feels like you.</p></header>
        <div className="try-section-heading"><div><span className="try-eyebrow">THE EDIT</span><h2>Your outfit<span>.</span></h2></div><span className="try-section-label">01 / 03</span></div>
        <OutfitSlot number="01" name="Top" description="The everyday T-shirt" enabled={topEnabled} onEnabled={showTop} color={topColor} onColor={setTopColor} available />
        <OutfitSlot number="02" name="Bottom" description="The essential pants" enabled={bottomEnabled} onEnabled={showBottom} color={bottomColor} onColor={setBottomColor} available={bottomAvailability === "available" || bottomAvailability === "checking"} />
        <div className="try-divider" />
        <div className="try-section-heading compact"><div><span className="try-eyebrow">SEE THE FIT</span><h2>Strike a pose<span>.</span></h2></div><span className="try-section-label">02 / 03</span></div>
        <div className="try-pose-group" role="group" aria-label="Pose">{poses.map(item => <button key={item.value} type="button" aria-pressed={pose === item.value} className={pose === item.value ? "selected" : ""} onClick={() => setPose(item.value)}>{item.label}</button>)}</div>
        <div className="try-divider" />
        <div className="try-section-heading compact"><div><span className="try-eyebrow">MADE PERSONAL</span><h2>Your avatar<span>.</span></h2></div><span className="try-section-label">03 / 03</span></div>
        <div className="try-avatar-options"><button type="button" className={avatar === "neutral" ? "selected" : ""} onClick={() => { if (avatar !== "neutral") switchAvatar("neutral"); }}><span>Neutral avatar</span>{avatar === "neutral" && <Check size={16} />}</button><button type="button" className={avatar === "personal" ? "selected" : ""} onClick={() => { if (personal && avatar !== "personal") switchAvatar("personal"); else if (!personal) document.getElementById("try-avatar-file")?.click(); }}><span>My avatar</span>{avatar === "personal" && <Check size={16} />}</button></div>
        <label htmlFor="try-avatar-file" className="try-upload"><UploadSimple size={17} /> {personal ? "Choose a different avatar" : "Choose your avatar file"}</label><input className="try-sr-only" id="try-avatar-file" type="file" accept=".glb,model/gltf-binary" onChange={chooseAvatar} />
        <p className="try-hint">Your GLB stays on this device. Garments need a matching avatar fit.</p>
        {message && <p className="try-message" role="status">{message}</p>}
        <footer className="try-footer"><span>VIRTUAL WARDROBE</span><span>MADE FOR YOUR WORLD&nbsp; ✳</span></footer>
      </div>
    </aside>
  </main>;
}
