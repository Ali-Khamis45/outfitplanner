"use client";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { RenderStats } from "./types";
// Demand rendering samples frames only during active rendering.
export function PerformanceOverlay({ onStats }: { onStats: (stats: RenderStats) => void }) {
  const sample = useRef({ start: 0, frames: 0 });
  useFrame(({ gl }) => {
    const now = performance.now();
    if (!sample.current.start || now - sample.current.start > 2000) sample.current = { start: now, frames: 0 };
    sample.current.frames++;
    const elapsed = now - sample.current.start;
    if (elapsed >= 750) { onStats({ fps: Math.round(sample.current.frames * 1000 / elapsed), calls: gl.info.render.calls, triangles: gl.info.render.triangles }); sample.current = { start: now, frames: 0 }; }
  });
  return null;
}
