"use client";
import { ArrowsClockwise, CaretDown, Check, UploadSimple } from "@phosphor-icons/react";
import { useGLTF } from "@react-three/drei";
import Link from "next/link";
import { Component, Suspense, useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { createPantsChecker, createSidecarLoader } from "../../lib/garment/demoResources";
import { parseSidecar, type Sidecar } from "../../lib/garment/correctives";
import { LocalGlbError, readLocalGlb, type LocalGlb } from "../../lib/localGlb";
import type { CameraView } from "../avatar-lab/types";
import { TryOnScene, type OutfitItem } from "./TryOnScene";
import { FitPicker, MeasurementsForm, useSizes } from "../FitControls";
import { parseWardrobe, type WardrobeItem } from "../../lib/wardrobe/schema";
import { PieceImage, canTryOn } from "../wardrobe/PieceImage";
import { TemplateThumbnail } from "../wardrobe/TemplateThumbnail";

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
type PersonalFit = { body: string; bodyId: string | null; shirt: string; pants: string; shirtSidecar: Sidecar | null; pantsSidecar: Sidecar | null };

async function loadPersonalFit(): Promise<PersonalFit | null> {
  const response = await fetch("/api/personal-fit", { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Could not load your personal fit.");
  const data = await response.json();
  const allowed = (value: unknown) => typeof value === "string" && /^\/api\/personal-fit\?asset=(body|shirt|pants|shirtSidecar|pantsSidecar)$/.test(value);
  if (![data.body, data.shirt, data.pants].every(allowed)) throw new Error("Could not load your personal fit.");
  async function sidecar(url: unknown): Promise<Sidecar | null> {
    if (url === null) return null;
    if (!allowed(url)) throw new Error("Could not load your personal fit.");
    const result = await fetch(url as string, { cache: "no-store" });
    if (!result.ok) throw new Error("Could not load your personal fit.");
    return parseSidecar(await result.json());
  }
  const [shirtSidecar, pantsSidecar] = await Promise.all([sidecar(data.shirtSidecar), sidecar(data.pantsSidecar)]);
  return { body: data.body, bodyId: typeof data.bodyId === "string" ? data.bodyId : null, shirt: data.shirt, pants: data.pants, shirtSidecar, pantsSidecar };
}

class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? <div className="try-stage-message">This avatar could not be displayed. Please choose another file.</div> : this.props.children; }
}

function OutfitSlot({ number, name, description, enabled, onEnabled, color, onColor, available, hasOriginal, original, onOriginal }: {
  number: string; name: string; description: string; enabled: boolean; onEnabled: (value: boolean) => void;
  color: string; onColor: (value: string) => void; available: boolean; hasOriginal: boolean; original: boolean; onOriginal: () => void;
}) {
  return <section className="try-slot" aria-label={name}>
    <div className="try-slot-heading"><span className="try-slot-number">{number}</span><div><h3>{name}</h3><p>{description}</p></div>
      <label className="try-switch"><span className="try-sr-only">Show {name.toLowerCase()}</span><input type="checkbox" checked={enabled} disabled={!available} onChange={event => onEnabled(event.target.checked)} /><span aria-hidden="true" /></label>
    </div>
    <div className="try-color-heading"><span>COLOUR</span><span>{original ? "Original" : colors.find(item => item.value.toLowerCase() === color.toLowerCase())?.name ?? color}</span></div>
    <div className="try-swatches" role="group" aria-label={`${name} colour`}>
      {hasOriginal && <button type="button" title="Original texture" aria-label={`${name}: Original`} aria-pressed={original} disabled={!enabled || !available} className={original ? "try-swatch selected try-original" : "try-swatch try-original"} onClick={onOriginal}><span aria-hidden="true" /></button>}
      {colors.map(item => <button key={item.value} type="button" title={item.name} aria-label={`${name}: ${item.name}`} aria-pressed={!original && color === item.value} disabled={!enabled || !available} className={!original && color === item.value ? "try-swatch selected" : "try-swatch"} onClick={() => onColor(item.value)}><span style={{ backgroundColor: item.value }} /></button>)}
    </div>
    {!available && <p className="try-hint">Pants are not available yet.</p>}
  </section>;
}

export function TryOn({ candidate = false, textureFixture = false, fixtures = false, outfitId = null, topId = null, bottomId = null, initialPose = null }: { candidate?: boolean; initialPose?: string | null; textureFixture?: boolean; fixtures?: boolean; outfitId?: string | null; topId?: string | null; bottomId?: string | null }) {
  const [topEnabled, setTopEnabled] = useState(true), [bottomEnabled, setBottomEnabled] = useState(true);
  const [topColor, setTopColor] = useState(colors[4].value), [bottomColor, setBottomColor] = useState(colors[1].value);
  const [topTexture, setTopTexture] = useState<string | null>(textureFixture ? (candidate ? "fixture:/shirt-v3.png" : "fixture:/shirt.png") : null), [bottomTexture, setBottomTexture] = useState<string | null>(textureFixture ? (candidate ? "fixture:/pants-v3.png" : "fixture:/pants.png") : null);
  const [topOriginal, setTopOriginal] = useState(true), [bottomOriginal, setBottomOriginal] = useState(true);
  const [topSidecar, setTopSidecar] = useState<Sidecar | null | undefined>(undefined), [bottomSidecar, setBottomSidecar] = useState<Sidecar | null | undefined>(undefined);
  const [bottomAvailability, setBottomAvailability] = useState<"checking" | "available" | "missing" | "error">("checking");
  const [pose, setPose] = useState<Pose>(initialPose === "walk" || initialPose === "both-90" ? initialPose : "rest"), [turntable, setTurntable] = useState(false);
  const [view, setView] = useState<{ view: CameraView; id: number }>({ view: "front", id: 0 });
  const [personal, setPersonal] = useState<LocalGlb | null>(null), [avatar, setAvatar] = useState<"neutral" | "personal">("neutral");
  const [personalFit, setPersonalFit] = useState<PersonalFit | null>(null), [personalSource, setPersonalSource] = useState<"manifest" | "file">("manifest");
  const [avatarReady, setAvatarReady] = useState(false), [avatarFailed, setAvatarFailed] = useState(false), [message, setMessage] = useState("");
  const [topReady, setTopReady] = useState(false), [bottomReady, setBottomReady] = useState(false);
  const personalUrl = useRef<string | null>(null);
  const selection = useRef(0);
  const stageRef = useRef<HTMLElement>(null);
  const activeFit = avatar === "personal" && personalSource === "manifest" ? personalFit : null;
  const bodyId = textureFixture && !candidate ? null : avatar === "neutral" ? "neutral" : activeFit?.bodyId ?? null;
  const [outfitSizes, setOutfitSizes] = useState({ top: "", bottom: "" });
  const topSizes = useSizes(bodyId, "top", fixtures && bodyId === "neutral", outfitSizes.top, candidate), bottomSizes = useSizes(bodyId, "bottom", fixtures && bodyId === "neutral", outfitSizes.bottom, candidate);
  const [heatmap, setHeatmap] = useState(false);
  const [slot, setSlot] = useState<"top" | "bottom">("top");
  const [expanded, setExpanded] = useState(false);
  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItem[]>([]);
  const [wardrobeStatus, setWardrobeStatus] = useState("Opening your wardrobe...");
  const [chosen, setChosen] = useState<{ top: WardrobeItem | null; bottom: WardrobeItem | null }>({ top: null, bottom: null });
  useEffect(() => {
    let active = true;
    fetch("/api/wardrobe", { cache: "no-store" }).then(response => { if (!response.ok) throw new Error("This outfit is only available on the local development server."); return response.json(); }).then(value => {
      if (!active) return;
      const wardrobe = parseWardrobe(value);
      setWardrobeItems(wardrobe.items); setWardrobeStatus("");
      if (!outfitId && !topId && !bottomId) return;
      const outfit = outfitId ? wardrobe.outfits.find(item => item.id === outfitId) : { name: "selected pieces", items: [topId, bottomId].filter((id): id is string => !!id) };
      if (!outfit) throw new Error("Outfit not found in your wardrobe.");
      const items = outfit.items.map(id => wardrobe.items.find(item => item.id === id)).filter(item => item !== undefined);
      const topItem = items.find(item => item.category === "top"), bottomItem = items.find(item => item.category === "bottom");
      const topSupported = topItem?.template === "tshirt-v5.2", bottomSupported = bottomItem?.template === "pants-basic-v2" || bottomItem?.template === "pants-v2";
      setTopEnabled(topSupported); setBottomEnabled(bottomSupported);
      setChosen({ top: topSupported ? topItem : null, bottom: bottomSupported ? bottomItem : null });
      setOutfitSizes({ top: topSupported ? topItem.size.trim().toUpperCase() : "", bottom: bottomSupported ? bottomItem.size.trim().toUpperCase() : "" });
      const mainColor = (item: NonNullable<typeof topItem>) => item.colors.reduce((best, color) => color.share > best.share ? color : best).hex;
      if (topSupported) { setTopColor(mainColor(topItem)); setTopTexture(topItem.texture ?? null); setTopOriginal(true); }
      if (bottomSupported) { setBottomColor(mainColor(bottomItem)); setBottomTexture(bottomItem.texture ?? null); setBottomOriginal(true); }
      if ((topItem && !topSupported) || (bottomItem && !bottomSupported) || !items.length) setMessage("Some pieces have no supported 3D template. Add tshirt-v5.2 for a top or pants-basic-v2 for a bottom to preview them.");
      else setMessage(`Showing ${outfit.name} from your wardrobe.`);
    }).catch(error => { if (active) { setWardrobeStatus("Your wardrobe is unavailable. You can still explore the demo pieces."); if (outfitId || topId || bottomId) setMessage(error instanceof Error ? error.message : "Could not load the outfit."); } });
    return () => { active = false; };
  }, [outfitId, topId, bottomId]);
  const avatarUrl = activeFit?.body ?? (avatar === "personal" && personalSource === "file" && personal ? personal.url : NEUTRAL_URL);
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
  const top: OutfitItem | null = topEnabled && (!candidate || !!topSizes.selected) && topSizes.resolved && (!topSizes.selected || topSizes.garment) && (topSizes.garment || activeFit || topSidecar !== undefined) ? { url: topSizes.garment?.url ?? activeFit?.shirt ?? TOP_URL, color: topColor, texture: topOriginal ? topTexture : null, sidecar: topSizes.garment ? topSizes.garment.sidecar : (activeFit ? activeFit.shirtSidecar : topSidecar!) } : null;
  const bottom: OutfitItem | null = bottomEnabled && (!candidate || !!bottomSizes.selected) && bottomSizes.resolved && (!bottomSizes.selected || bottomSizes.garment) && (bottomSizes.garment || activeFit || (bottomAvailability === "available" && bottomSidecar !== undefined)) ? { url: bottomSizes.garment?.url ?? activeFit?.pants ?? BOTTOM_URL, color: bottomColor, texture: bottomOriginal ? bottomTexture : null, sidecar: bottomSizes.garment ? bottomSizes.garment.sidecar : (activeFit ? activeFit.pantsSidecar : bottomSidecar!) } : null;
  const outfitReady = avatarReady && (!topEnabled || (candidate && topSizes.resolved && !topSizes.selected) || topReady) && (!bottomEnabled || (candidate && bottomSizes.resolved && !bottomSizes.selected) || (!activeFit && (bottomAvailability === "missing" || bottomAvailability === "error")) || bottomReady);
  const showTop = (enabled: boolean) => { if (enabled) setTopReady(false); setTopEnabled(enabled); };
  const showBottom = (enabled: boolean) => { if (enabled) setBottomReady(false); setBottomEnabled(enabled); };
  const changeView = (next: CameraView) => { setTurntable(false); setView(previous => ({ view: next, id: previous.id + 1 })); };
  const switchAvatar = (next: "neutral" | "personal") => { setAvatar(next); setAvatarReady(false); setTopReady(false); setBottomReady(false); setAvatarFailed(false); setMessage(""); };
  async function selectPersonalFit() {
    const request = ++selection.current;
    try {
      const fit = await loadPersonalFit();
      if (request !== selection.current) return;
      if (!fit) { setExpanded(true); setMessage("No personal fit found. Open Avatar & measurements to choose your avatar file."); return; }
      setPersonalFit(fit); setPersonalSource("manifest"); switchAvatar("personal");
    } catch { if (request === selection.current) { setExpanded(true); setMessage("Could not load your personal fit. Open Avatar & measurements to choose your avatar file."); } }
  }
  async function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    try {
      const loaded = await readLocalGlb(file);
      const previous = personalUrl.current;
      selection.current++; personalUrl.current = loaded.url; setPersonal(loaded); setPersonalSource("file"); setAvatar("personal"); setAvatarReady(false); setTopReady(false); setBottomReady(false); setAvatarFailed(false); setMessage("");
      if (previous) URL.revokeObjectURL(previous);
    } catch (error) { setMessage(error instanceof LocalGlbError ? error.message : "Could not open that file. Please try another GLB."); }
  }
  function choosePiece(item: WardrobeItem | null, target: "top" | "bottom" = slot) {
    if (item && !canTryOn(item)) return;
    const color = item?.colors.reduce((best, entry) => entry.share > best.share ? entry : best).hex;
    setChosen(previous => ({ ...previous, [target]: item }));
    setOutfitSizes(previous => ({ ...previous, [target]: item?.size.trim().toUpperCase() ?? "" }));
    if (target === "top") { if (!topEnabled) showTop(true); setTopColor(color ?? colors[4].value); setTopTexture(item?.texture ?? (textureFixture ? (candidate ? "fixture:/shirt-v3.png" : "fixture:/shirt.png") : null)); setTopOriginal(true); }
    else { if (!bottomEnabled) showBottom(true); setBottomColor(color ?? colors[1].value); setBottomTexture(item?.texture ?? (textureFixture ? (candidate ? "fixture:/pants-v3.png" : "fixture:/pants.png") : null)); setBottomOriginal(true); }
    setMessage("");
  }
  const current = chosen[slot], currentSizes = slot === "top" ? topSizes : bottomSizes;
  const pieceName = (target: "top" | "bottom") => chosen[target]?.name ?? (target === "top" ? "Demo T-shirt" : "Demo pants");
  const categories = <div className="try-categories" role="group" aria-label="Garment category">{(["top", "bottom"] as const).map(value => <button key={value} type="button" aria-pressed={slot === value} onClick={() => setSlot(value)}>{value === "top" ? "Tops" : "Bottoms"}</button>)}</div>;
  const outfitQuery = new URLSearchParams();
  if (topEnabled && chosen.top) outfitQuery.set("top", chosen.top.id);
  if (bottomEnabled && chosen.bottom) outfitQuery.set("bottom", chosen.bottom.id);
  return <main className={`try-page${expanded ? " try-expanded" : ""}`}>
    <h1 className="try-sr-only">Fitting room</h1>
    <aside className="try-wearing" aria-label="Choose garments">
      <h2>Wearing</h2>{categories}
      <ul className="try-piece-list">
        <li><button className="try-piece" aria-pressed={!current} onClick={() => choosePiece(null)}><span className="try-piece-image"><TemplateThumbnail item={{ category: slot, template: slot === "top" ? "tshirt-v5.2" : "pants-v2", colors: [{ name: "Demo", hex: slot === "top" ? colors[4].value : colors[1].value, share: 1 }] }} /></span><span><strong>{slot === "top" ? "Demo T-shirt" : "Demo pants"}</strong><small>Example &middot; {!current ? "Selected" : "Explore the fit"}</small></span></button></li>
        {wardrobeItems.filter(item => item.category === slot).map(item => <li key={item.id}><button className="try-piece" disabled={!canTryOn(item)} aria-pressed={current?.id === item.id} onClick={() => choosePiece(item)}><span className="try-piece-image"><PieceImage item={item} /></span><span><strong>{item.name}</strong><small>{item.id.startsWith("example-") ? "Example \u00b7 " : ""}{!canTryOn(item) ? "No 3D template" : current?.id === item.id ? "Selected" : item.material || "From your wardrobe"}</small></span></button></li>)}
      </ul>
      {wardrobeStatus && <p className="try-hint" role="status">{wardrobeStatus}</p>}
      <Link className="try-wardrobe-link" href="/wardrobe">Explore wardrobe &rarr;</Link>
      <div className="try-layers"><span className="try-eyebrow">Layers</span>{(["top", "bottom"] as const).map(value => <button key={value} aria-pressed={slot === value} onClick={() => setSlot(value)}><span>{value === "top" ? "Top" : "Bottom"}</span><span>{(value === "top" ? topEnabled : bottomEnabled) ? pieceName(value) : "Hidden"}</span></button>)}</div>
    </aside>
    <section className="try-stage" ref={stageRef} aria-label="3D outfit preview">
      <div className={outfitReady || avatarFailed ? "try-viewport ready" : "try-viewport"}><SceneBoundary key={avatarUrl} onError={onAvatarError}><Suspense fallback={null}><TryOnScene key={avatarUrl} controlsExpanded={expanded} stageRef={stageRef} avatarUrl={avatarUrl} pose={pose} top={top} bottom={bottom} heatmap={heatmap} view={view} turntable={turntable} onAvatarReady={onAvatarReady} onTopReady={onTopReady} onBottomReady={onBottomReady} onTopError={onTopError} onBottomError={onBottomError} /></Suspense></SceneBoundary></div>
      {!outfitReady && !avatarFailed && <div className="try-stage-loading" role="status">Preparing your fitting room<span>...</span><span className="try-loading-bar" aria-hidden="true"><i /></span></div>}
      <div className="try-stage-top">
        <div className="try-avatar-options" id="avatar" role="group" aria-label="Avatar"><button type="button" aria-label="Neutral avatar" aria-pressed={avatar === "neutral"} className={avatar === "neutral" ? "selected" : ""} onClick={() => { selection.current++; if (avatar !== "neutral") switchAvatar("neutral"); }}>Demo body</button><button type="button" aria-pressed={avatar === "personal"} className={avatar === "personal" ? "selected" : ""} onClick={() => { if (avatar !== "personal" || personalSource !== "manifest") void selectPersonalFit(); }}>My avatar</button></div>
        <label className="fit-heatmap"><input type="checkbox" checked={heatmap} onChange={event => setHeatmap(event.target.checked)} /> Fit map</label>
      </div>
      <div className="try-stage-category">{categories}</div>
      {heatmap && <div className="try-fit-legend" aria-label="Fit map legend"><span data-fit="tight">Tight</span><span data-fit="good">Good</span><span data-fit="loose">Loose</span></div>}
      <div className="try-pose-group" role="group" aria-label="Pose">{poses.map(item => <button key={item.value} type="button" aria-pressed={pose === item.value} className={pose === item.value ? "selected" : ""} onClick={() => setPose(item.value)}>{item.label}</button>)}</div>
      <div className="try-camera" aria-label="Camera views"><button aria-pressed={!turntable && view.view === "front"} onClick={() => changeView("front")}>Front</button><button aria-pressed={!turntable && view.view === "left"} onClick={() => changeView("left")}>Side</button><button aria-pressed={!turntable && view.view === "back"} onClick={() => changeView("back")}>Back</button><button aria-label="Rotate 360 degrees" aria-pressed={turntable} onClick={() => setTurntable(!turntable)}><ArrowsClockwise size={16} /> 360&deg;</button></div>
    </section>
    <aside className="try-panel" aria-label="Outfit controls">
      <div className="try-panel-inner">
        <button type="button" className="try-sheet-toggle" aria-expanded={expanded} aria-controls="try-more-controls" onClick={() => setExpanded(!expanded)}><span aria-hidden="true" /><span>{expanded ? "Less detail" : "Pieces & details"} <CaretDown size={14} /></span></button>
        <header className="try-item-heading"><div><span className="try-eyebrow">{current ? current.material || "From your wardrobe" : "Example piece"}</span><h2>{pieceName(slot)}</h2></div>{currentSizes.selected?.fit.recommended && <span className="try-recommended"><Check size={13} /> Recommended size</span>}</header>
        {(["top", "bottom"] as const).map(target => {
          const isTop = target === "top", sizes = isTop ? topSizes : bottomSizes;
          return <div key={target} hidden={slot !== target}>
            <FitPicker editorial title={isTop ? "Top" : "Bottom"} options={sizes.options} selected={sizes.size} onSize={sizes.setSize} />
            {outfitSizes[target] && sizes.resolved && !sizes.options.some(option => option.size === outfitSizes[target] && option.status !== "withheld") && <p className="try-hint">Saved {target} size {outfitSizes[target]} is unavailable for this avatar; showing the available default.</p>}
            <div className="try-extra"><OutfitSlot number={isTop ? "01" : "02"} name={isTop ? "Top" : "Bottom"} description={pieceName(target)} enabled={isTop ? topEnabled : bottomEnabled} onEnabled={isTop ? showTop : showBottom} color={isTop ? topColor : bottomColor} onColor={value => { if (isTop) { setTopColor(value); setTopOriginal(false); } else { setBottomColor(value); setBottomOriginal(false); } }} hasOriginal={!!(isTop ? topTexture : bottomTexture)} original={isTop ? !!topTexture && topOriginal : !!bottomTexture && bottomOriginal} onOriginal={() => isTop ? setTopOriginal(true) : setBottomOriginal(true)} available={isTop || !!activeFit || bottomAvailability === "available" || bottomAvailability === "checking"} /></div>
          </div>;
        })}
        <div id="try-more-controls" className="try-extra">
          <details className="try-avatar-details"><summary>Avatar & measurements</summary><label htmlFor="try-avatar-file" className="try-upload"><UploadSimple size={17} /> {personal ? "Choose a different avatar" : "Choose your avatar file"}</label><input className="try-file" id="try-avatar-file" type="file" accept=".glb,model/gltf-binary" onChange={chooseAvatar} /><p className="try-hint">Your GLB stays on this device. Garments need a matching avatar fit.</p><MeasurementsForm /></details>
          <div className="try-outfit-actions"><Link className="button-primary" href={`/outfits?${outfitQuery}`}>{outfitQuery.has("top") && outfitQuery.has("bottom") ? "Save as outfit" : "Build an outfit"}</Link><Link className="button-secondary" href="/stylist">Ask stylist</Link></div><p className="try-hint">Save wardrobe pieces in the outfit builder. Preview colours and sizes stay in this session.</p>
        </div>
        {textureFixture && <p className="try-hint" role="status">Synthetic texture fixtures are active.</p>}{fixtures && <p className="try-hint" role="status">Synthetic size fixtures are active for the neutral avatar. Fit values and heatmap are illustrative.</p>}
        {message && <p className="try-message" role="status">{message}</p>}
      </div>
    </aside>
  </main>;
}
