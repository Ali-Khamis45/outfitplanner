"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

/** Photo preview stays in the browser; reconstruction runs separately from the CLI. */
export function ReconstructionPanel() {
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const currentUrl = useRef<string | null>(null);
  useEffect(() => () => { if (currentUrl.current) URL.revokeObjectURL(currentUrl.current); }, []);

  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    currentUrl.current = null;
    setPreview(null); setName(""); setError("");
    if (!file) return;
    const supported = /\.(jpe?g|jfif|png|webp|bmp|tiff?)$/i.test(file.name);
    if (!supported || file.size === 0 || file.size > 20 * 1024 * 1024) {
      setError("Choose a non-empty JPEG, JFIF, PNG, WebP, BMP, or TIFF image under 20 MB.");
      event.target.value = "";
      return;
    }
    const url = URL.createObjectURL(file);
    currentUrl.current = url;
    setPreview(url); setName(file.name);
  }

  return <section className="side-section reconstruction-panel" aria-labelledby="reconstruction-heading">
    <div className="section-title"><span className="section-icon">◎</span><h2 id="reconstruction-heading">Reconstruction</h2></div>
    <p className="side-note">Choose a photo to preview locally. It stays in your browser.</p>
    <label className="photo-picker" htmlFor="reconstruction-photo">{name ? "Choose another photo" : "Choose a photo"}</label>
    <input id="reconstruction-photo" className="photo-input" type="file" accept=".jpg,.jpeg,.jfif,.png,.webp,.bmp,.tif,.tiff" onChange={selectPhoto} />
    {preview && <div className="photo-preview"><Image src={preview} width={180} height={150} unoptimized alt="Selected photo preview" onError={() => setError("This image could not be previewed in your browser.")} /><span>{name}</span></div>}
    {error && <p className="reconstruction-error" role="alert">{error}</p>}
    <button className="reconstruct-button" disabled title="Reconstruction runs from the local command line in Sprint 0">Start reconstruction</button>
    <p className="reconstruction-blocked" role="status"><strong>RECONSTRUCTION RUNS IN THE LOCAL CLI</strong><br />This photo preview does not create or load an avatar. To view an existing result, select <strong>Avatar → Personal</strong>, then choose your exported GLB from <code>outputs/avatars/</code>. The file stays in this browser.</p>
  </section>;
}
