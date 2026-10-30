"use client";
import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { CameraView, ModelInfo } from "./types";
export function CameraController({ model, command }: { model: ModelInfo | null; command: { view: CameraView; id: number } }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, invalidate, size } = useThree();
  useEffect(() => {
    if (!model || !controls.current) return;
    const center = new Vector3(...model.center);
    const height = Math.max(model.size[1], 0.01);
    const aspect = size.width / Math.max(size.height, 1);
    const distance = Math.max(height * 1.65, model.size[0] * 1.7 / Math.max(aspect, 0.2));
    const directions: Record<CameraView, [number, number, number]> = { front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], reset: [0.38, 0.09, 1] };
    camera.position.copy(center).addScaledVector(new Vector3(...directions[command.view]).normalize(), distance);
    controls.current.target.copy(center); controls.current.minDistance = height * 0.6; controls.current.maxDistance = height * 6; controls.current.update(); invalidate();
  }, [camera, command, invalidate, model, size.width, size.height]);
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.12} />;
}
