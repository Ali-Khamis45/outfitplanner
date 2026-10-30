"use client";
import { Suspense, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { AvatarModel } from "./AvatarModel";
import { CameraController } from "./CameraController";
import { LightingRig } from "./LightingRig";
import { PerformanceOverlay } from "./PerformanceOverlay";
import type { CameraView, ModelInfo, RenderStats } from "./types";
interface Props { wireframe: boolean; skeleton: boolean; grid: boolean; model: ModelInfo | null; command: { view: CameraView; id: number }; onReady: (info: ModelInfo) => void; onStats: (stats: RenderStats) => void; onError: () => void; }
function WebGLFallback({ onError }: { onError: () => void }) {
  useEffect(() => { onError(); }, [onError]);
  return <div className="scene-message">WebGL is unavailable in this browser.</div>;
}
export function AvatarScene({ wireframe, skeleton, grid, model, command, onReady, onStats, onError }: Props) {
  return <Canvas shadows dpr={[1, 1.5]} frameloop="demand" camera={{ position: [1, 1.1, 3], fov: 40 }} gl={{ antialias: true, preserveDrawingBuffer: true }} fallback={<WebGLFallback onError={onError} />}>
    <color attach="background" args={["#192326"]} /><fog attach="fog" args={["#192326", 8, 18]} /><LightingRig />
    {grid && <gridHelper args={[8, 32, "#507069", "#2a3a39"]} position={[0, 0.002, 0]} />}
    <Suspense fallback={null}><AvatarModel wireframe={wireframe} skeleton={skeleton} onReady={onReady} /></Suspense>
    <CameraController model={model} command={command} /><PerformanceOverlay onStats={onStats} />
  </Canvas>;
}
