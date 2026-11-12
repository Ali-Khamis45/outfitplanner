"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { RenderStats } from "./types";
/** Continuous measurement: ten-second, non-overlapping samples of rendered frame intervals. */
export function PerformanceOverlay({ onStats }: { onStats: (stats: RenderStats) => void }) {
  const sample = useRef<{ start: number; previous: number; times: number[] }>({ start: 0, previous: 0, times: [] });
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => { invalidate(); }, [invalidate]);
  useFrame(({ gl }) => {
    const now = performance.now(), s = sample.current;
    if (!s.start) { s.start = now; s.previous = now; }
    else { s.times.push(now - s.previous); s.previous = now; }
    if (now - s.start >= 10000 && s.times.length) {
      const sorted = [...s.times].sort((a, b) => a - b);
      const mean = s.times.reduce((a, b) => a + b, 0) / s.times.length;
      const worst = sorted.slice(Math.floor(sorted.length * 0.99));
      const worstMean = worst.reduce((a, b) => a + b, 0) / worst.length;
      onStats({ fps: Math.round(1000 / mean), low: Math.round(1000 / worstMean), frameMs: mean, calls: gl.info.render.calls, triangles: gl.info.render.triangles });
      sample.current = { start: now, previous: now, times: [] };
    }
    invalidate();
  });
  return null;
}
