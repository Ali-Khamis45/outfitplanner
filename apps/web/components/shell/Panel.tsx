"use client";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { X } from "@phosphor-icons/react";

/** Native modal semantics provide focus trapping, Escape, and focus restoration. */
export function Panel({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    const previous = document.body.style.overflow;
    const trigger = document.activeElement as HTMLElement | null;
    element?.showModal(); document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previous; trigger?.focus(); };
  }, []);
  return <dialog ref={dialog} className={`app-panel${wide ? " app-panel-wide" : ""}`} aria-label={title} onCancel={onClose} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <header className="app-panel-heading"><h2>{title}</h2><button className="icon-button" type="button" aria-label={`Close ${title}`} onClick={onClose}><X size={22} /></button></header>
    {children}
  </dialog>;
}
