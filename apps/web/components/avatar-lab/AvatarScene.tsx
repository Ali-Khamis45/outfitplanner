"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import type { Sidecar } from "../../lib/garment/correctives";
import type { PoseName } from "../../lib/garment/poses";
import { AvatarModel, type LoadedRig } from "./AvatarModel";
import { CameraController } from "./CameraController";
import { GarmentErrorBoundary, GarmentModel } from "./GarmentModel";
import { LightingRig } from "./LightingRig";
import { PerformanceOverlay } from "./PerformanceOverlay";
import type { CameraView, GarmentInfo, ModelInfo, RenderStats } from "./types";

export interface GarmentLayer { sidecar: Sidecar | null; correctives: boolean; onWeights: (weights: Record<string, number>) => void; url: string; color: string; visible: boolean; onReady: (info: GarmentInfo) => void; onError: (message: string) => void }
interface Props { url: string; turntable: boolean; wireframe: boolean; garmentWireframe: boolean; skeleton: boolean; grid: boolean; pose: PoseName; garment: GarmentLayer | null; model: ModelInfo | null; command: { view: CameraView; id: number }; onReady: (info: ModelInfo) => void; onStats: (stats: RenderStats) => void; onError: () => void; }
function WebGLFallback({ onError }: { onError: () => void }) {
  useEffect(() => { onError(); }, [onError]);
  return <div className="scene-message">WebGL is unavailable in this browser.</div>;
}
export function AvatarScene({ url, turntable, wireframe, garmentWireframe, skeleton, grid, pose, garment, model, command, onReady, onStats, onError }: Props) {
  const [rig, setRig] = useState<LoadedRig | null>(null);
  const onRig = useCallback((next: LoadedRig | null) => setRig(next), []);
  return <Canvas shadows dpr={[1, 1.5]} frameloop="demand" camera={{ position: [1, 1.1, 3], fov: 40 }} gl={{ antialias: true, preserveDrawingBuffer: true }} fallback={<WebGLFallback onError={onError} />}>
    <color attach="background" args={["#192326"]} /><fog attach="fog" args={["#192326", 8, 18]} /><LightingRig />
    {grid && <gridHelper args={[8, 32, "#507069", "#2a3a39"]} position={[0, 0.002, 0]} />}
    <Suspense fallback={null}><AvatarModel url={url} wireframe={wireframe} inspection={wireframe || garmentWireframe} skeleton={skeleton} pose={pose} onReady={onReady} onRig={onRig} /></Suspense>
    {garment && rig && <GarmentErrorBoundary key={`${garment.url}|${rig.id}`} onError={garment.onError}>
      <Suspense fallback={null}><GarmentModel sidecar={garment.sidecar} correctives={garment.correctives} onWeights={garment.onWeights} url={garment.url} rig={rig} color={garment.color} visible={garment.visible} wireframe={garmentWireframe} inspection={wireframe || garmentWireframe} onReady={garment.onReady} /></Suspense>
    </GarmentErrorBoundary>}
    <CameraController model={model} command={command} turntable={turntable} /><PerformanceOverlay onStats={onStats} />
  </Canvas>;
}
