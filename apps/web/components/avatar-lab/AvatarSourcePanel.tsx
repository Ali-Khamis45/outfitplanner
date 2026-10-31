"use client";
import { Fingerprint, Cube, UserFocus } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { LocalGlbError, readLocalGlb } from "../../lib/localGlb";
import type { AvatarSource, PersonalSource } from "./types";

export const NEUTRAL_SOURCE: AvatarSource = { kind: "neutral", url: "/api/demo-avatar", label: "MHR neutral" };

/** Personal GLBs never leave the browser: no upload, no server route, only a revocable blob URL. */
export function AvatarSourcePanel({ source, onSelect }: { source: AvatarSource; onSelect: (source: AvatarSource) => void }) {
  const [choice, setChoice] = useState<AvatarSource["kind"]>(source.kind);
  const [personal, setPersonal] = useState<PersonalSource | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const blobUrl = useRef<string | null>(null);
  useEffect(() => () => { if (blobUrl.current) URL.revokeObjectURL(blobUrl.current); }, []);

  function choose(kind: AvatarSource["kind"]) {
    setChoice(kind); setError("");
    if (kind === "neutral") onSelect(NEUTRAL_SOURCE);
    else if (personal) onSelect(personal);
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setError("");
    if (!file) return;
    setReading(true);
    try {
      const local = await readLocalGlb(file);
      const next: PersonalSource = { kind: "personal", label: "Personal reconstruction", ...local };
      const previous = blobUrl.current;
      blobUrl.current = local.url;
      setPersonal(next); onSelect(next);
      if (previous) URL.revokeObjectURL(previous);
    } catch (reason) {
      if (reason instanceof LocalGlbError) { setError(reason.message); return; }
      console.error("Unable to read the selected GLB:", reason);
      setError("The selected file could not be read by this browser.");
    } finally { setReading(false); }
  }

  const active = source.kind === "personal" ? source : null;
  return <section className="side-section" aria-labelledby="avatar-heading"><div className="section-title"><Fingerprint size={18} /><h2 id="avatar-heading">Avatar</h2></div>
    <div className="avatar-summary"><div className="avatar-symbol">{active ? <UserFocus size={25} weight="light" /> : <Cube size={25} weight="light" />}</div><div><strong>{source.label}</strong><small>{active ? "SAM 3D Body → MHR · rigged GLB" : "Research reference · LOD 1"}</small></div></div>
    <label className="field-label" htmlFor="model-select">ACTIVE MODEL</label>
    <select id="model-select" value={choice} onChange={(event) => choose(event.target.value as AvatarSource["kind"])}><option value="neutral">MHR / Neutral body</option><option value="personal">Personal / Reconstructed avatar</option></select>
    {choice === "neutral" && <p className="side-note">Official MHR export with a skinned armature.</p>}
    {choice === "personal" && <div className="avatar-source-personal">
      <p className="side-note">Choose your personal avatar GLB from <code>outputs/avatars/</code>. For a fitted shirt, choose the matching rest-pose avatar and garment. Files are read locally in this browser and are never uploaded or served.</p>
      <label className="photo-picker" htmlFor="personal-glb">{reading ? "Reading…" : personal ? "Choose another GLB" : "Choose personal GLB"}</label>
      <input id="personal-glb" className="photo-input" type="file" accept=".glb,model/gltf-binary" onChange={selectFile} disabled={reading} />
      {personal && <dl className="data-list source-details"><div className="data-row"><dt>File</dt><dd title={personal.fileName}>{personal.fileName}</dd></div><div className="data-row"><dt>Size</dt><dd>{(personal.bytes / 1024 / 1024).toFixed(2)} MB</dd></div><div className="data-row"><dt>SHA-256</dt><dd title={personal.sha256 ?? undefined}>{personal.sha256 ? `${personal.sha256.slice(0, 12)}…` : "Unavailable (insecure context)"}</dd></div></dl>}
      {!personal && !error && <p className="reconstruction-blocked" role="status">No personal avatar selected yet. The neutral body stays on screen until you choose a file.</p>}
    </div>}
    {error && <p className="reconstruction-error" role="alert">{error}</p>}
  </section>;
}
