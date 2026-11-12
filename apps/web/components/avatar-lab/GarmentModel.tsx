"use client";
import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Component, useEffect, useMemo, type ReactNode } from "react";
import { MeshStandardMaterial, SkinnedMesh } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { createCorrectiveDriver, type Sidecar } from "../../lib/garment/correctives";
import { bindGarment } from "../../lib/garment/binding";
import { applyMeshInspection } from "../../lib/garment/inspection";
import type { LoadedRig } from "./AvatarModel";
import type { GarmentInfo } from "./types";

/** Keeps a garment failure (e.g. a skeleton mismatch) from taking down the avatar scene. */
export class GarmentErrorBoundary extends Component<{ children: ReactNode; onError: (message: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error("Garment failed to load or bind:", error); this.props.onError(error.message || "The garment could not be loaded."); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function GarmentModel({ url, rig, color, visible, wireframe, inspection, onReady, sidecar, correctives, onWeights, layer }: { url: string; rig: LoadedRig; color: string; visible: boolean; wireframe: boolean; inspection: boolean; onReady: (info: GarmentInfo) => void; sidecar: Sidecar | null; correctives: boolean; onWeights: (weights: Record<string, number>) => void; layer: "upper" | "lower" }) {
  const gltf = useGLTF(url);
  const invalidate = useThree((state) => state.invalidate);
  const garment = useMemo(() => {
    const scene = clone(gltf.scene); // never mutate the loader's cached scene
    const meshes: SkinnedMesh[] = [];
    scene.traverse((child) => { if (child instanceof SkinnedMesh) meshes.push(child); });
    if (meshes.length !== 1) throw new Error(`Expected one skinned garment mesh, found ${meshes.length}.`);
    const mesh = meshes[0];
    const original = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const material = original instanceof MeshStandardMaterial ? original.clone() : new MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
    material.color.set(color);
    const binding = bindGarment(mesh, rig.rig); // throws GarmentBindingError on a skeleton mismatch
    mesh.removeFromParent();
    mesh.material = material;
    mesh.frustumCulled = false;
    // Bias near-coplanar shirt fragments toward the camera at the waist; preserve depth testing.
    material.polygonOffset = layer === "upper";
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -2;
    mesh.renderOrder = layer === "upper" ? 2 : 1;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const extras = (gltf.parser.json as { asset?: { extras?: { garment?: { garmentId?: string; bodyVariant?: string } } } }).asset?.extras?.garment;
    const geometry = mesh.geometry;
    const info: GarmentInfo = { garmentId: extras?.garmentId ?? mesh.name, bodyVariant: extras?.bodyVariant ?? "unknown", vertices: geometry.getAttribute("position").count, triangles: (geometry.index?.count ?? 0) / 3, joints: binding.joints, maxInverseBindDelta: binding.maxInverseBindDelta };
    return { mesh, material, info };
    // Colour is applied in an effect so changing it never rebuilds or rebinds the garment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf, rig, layer]);
  const drive = useMemo(() => createCorrectiveDriver(garment.mesh, rig.rig.bones, rig.bind, sidecar), [garment, rig, sidecar]);
  // Initialise influences before the mesh's first rendered frame.
  drive(correctives);
  useFrame(() => { const weights = drive(correctives); onWeights(weights); });
  useEffect(() => { onWeights(drive(correctives)); }, [drive, correctives, onWeights]);
  useEffect(() => { invalidate(); }, [drive, correctives, invalidate]);
  useEffect(() => { onReady(garment.info); }, [garment, onReady]);
  useEffect(() => { garment.material.color.set(color); invalidate(); }, [garment, color, invalidate]);
  useEffect(() => { applyMeshInspection(garment.mesh, wireframe, inspection); invalidate(); }, [garment, wireframe, inspection, invalidate]);
  useEffect(() => { invalidate(); }, [visible, invalidate]);
  useEffect(() => () => { garment.material.dispose(); }, [garment]); // geometry belongs to the loader cache
  useEffect(() => () => { if (url.startsWith("blob:")) useGLTF.clear(url); }, [url]);
  return <primitive object={garment.mesh} visible={visible} dispose={null} />;
}
