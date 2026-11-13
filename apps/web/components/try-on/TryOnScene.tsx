"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MeshStandardMaterial, SkinnedMesh, Vector3, type Object3D } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Sidecar } from "../../lib/garment/correctives";
import { advancePoseTransition, beginPoseTransition, type PoseTransition } from "../../lib/garment/poseTransition";
import type { PoseName } from "../../lib/garment/poses";
import { AvatarModel, type LoadedRig } from "../avatar-lab/AvatarModel";
import { GarmentErrorBoundary, GarmentModel } from "../avatar-lab/GarmentModel";
import type { CameraView, ModelInfo } from "../avatar-lab/types";

export interface OutfitItem { url: string; color: string; sidecar: Sidecar | null }
const ignoreWeights = () => {};
const ignoreInfo = () => {};

function TryOnCamera({ model, command, turntable }: { model: ModelInfo | null; command: { view: CameraView; id: number }; turntable: boolean }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size } = useThree();
  useEffect(() => {
    if (!model || !controls.current) return;
    const center = new Vector3(...model.center), height = Math.max(model.size[1], 0.01);
    const aspect = size.width / Math.max(size.height, 1);
    // The canvas itself is confined above the controls. Fit the body's height and
    // leave extra width for the arms-out pose at narrow aspect ratios.
    const distance = Math.max(height * 1.72, height * 1.55 / Math.max(aspect, 0.2));
    const directions: Record<CameraView, [number, number, number]> = { front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], reset: [0, 0, 1] };
    camera.position.copy(center).addScaledVector(new Vector3(...directions[command.view]), distance);
    controls.current.target.copy(center); controls.current.minDistance = height * 0.6; controls.current.maxDistance = height * 6; controls.current.update();
  }, [camera, command, model, size.width, size.height]);
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.12} autoRotate={turntable} autoRotateSpeed={4} />;
}

function NeutralSkin({ rig }: { rig: LoadedRig }) {
  useEffect(() => {
    let root: Object3D | undefined = rig.rig.bones.values().next().value;
    if (!root) return;
    while (root.parent && root.parent.type !== "Scene") root = root.parent;
    root.traverse(node => {
      if (!(node instanceof SkinnedMesh)) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) if (material instanceof MeshStandardMaterial) {
        material.color.set("#ead5c8"); material.metalness = 0.15; material.roughness = 0.8;
      }
    });
  }, [rig]);
  return null;
}

function PoseMotion({ rig, pose }: { rig: LoadedRig; pose: PoseName }) {
  const transition = useRef<PoseTransition | null>(null);
  useEffect(() => {
    try { transition.current = beginPoseTransition(rig.rig.bones, rig.bind, pose); }
    catch (error) { console.warn("Unable to apply this pose to the avatar", error); transition.current = null; }
  }, [rig, pose]);
  useFrame((_state, delta) => { if (transition.current && advancePoseTransition(transition.current, delta)) transition.current = null; }, -1);
  return null;
}

function FpsLogger() {
  const sample = useRef({ start: 0, frames: 0 });
  useFrame(() => {
    const now = performance.now();
    if (!sample.current.start) sample.current.start = now;
    sample.current.frames++;
    const elapsed = now - sample.current.start;
    if (elapsed >= 10000) {
      console.info(`Try-on average FPS: ${(sample.current.frames * 1000 / elapsed).toFixed(1)}`);
      sample.current = { start: now, frames: 0 };
    }
  });
  return null;
}

function NoWebGL({ onError }: { onError: () => void }) {
  useEffect(() => { onError(); }, [onError]);
  return <div className="try-stage-message">3D viewing is unavailable in this browser.</div>;
}

export function TryOnScene({ avatarUrl, pose, top, bottom, view, turntable, onAvatarReady, onAvatarError, onTopError, onBottomError }: {
  avatarUrl: string; pose: PoseName; top: OutfitItem | null; bottom: OutfitItem | null;
  view: { view: CameraView; id: number }; turntable: boolean; onAvatarReady: () => void; onAvatarError: () => void;
  onTopError: (message: string) => void; onBottomError: (message: string) => void;
}) {
  const [rig, setRig] = useState<LoadedRig | null>(null);
  const [model, setModel] = useState<ModelInfo | null>(null);
  const onReady = useCallback((info: ModelInfo) => { setModel(info); onAvatarReady(); }, [onAvatarReady]);
  return <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 1, 3], fov: 40 }} gl={{ antialias: true }} fallback={<NoWebGL onError={onAvatarError} />}>
    <color attach="background" args={["#202321"]} />
    <ambientLight intensity={0.8} /><hemisphereLight args={["#f8eee3", "#313a33", 1.1]} />
    <directionalLight position={[3, 5, 4]} intensity={2.6} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-2} shadow-camera-right={2} shadow-camera-top={2} shadow-camera-bottom={-2} shadow-normalBias={0.02} />
    <directionalLight position={[-3, 2, -3]} intensity={1.1} color="#d2dfd3" />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.003, 0]} receiveShadow><circleGeometry args={[8, 64]} /><meshStandardMaterial color="#202321" roughness={1} /></mesh>
    <Suspense fallback={null}><AvatarModel url={avatarUrl} pose="rest" wireframe={false} inspection={false} skeleton={false} onReady={onReady} onRig={setRig} /></Suspense>
    {rig && avatarUrl === "/api/demo-avatar" && <NeutralSkin rig={rig} />}
    {rig && <PoseMotion rig={rig} pose={pose} />}
    {rig && top && <GarmentErrorBoundary key={`top|${top.url}|${rig.id}`} onError={onTopError}><Suspense fallback={null}><GarmentModel layer="upper" url={top.url} rig={rig} color={top.color} visible wireframe={false} inspection={false} onReady={ignoreInfo} sidecar={top.sidecar} correctives onWeights={ignoreWeights} /></Suspense></GarmentErrorBoundary>}
    {rig && bottom && <GarmentErrorBoundary key={`bottom|${bottom.url}|${rig.id}`} onError={onBottomError}><Suspense fallback={null}><GarmentModel layer="lower" url={bottom.url} rig={rig} color={bottom.color} visible wireframe={false} inspection={false} onReady={ignoreInfo} sidecar={bottom.sidecar} correctives onWeights={ignoreWeights} /></Suspense></GarmentErrorBoundary>}
    <TryOnCamera model={model} command={view} turntable={turntable} /><FpsLogger />
  </Canvas>;
}
