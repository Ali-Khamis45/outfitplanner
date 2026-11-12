"use client";
import { useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Box3, Mesh, SkeletonHelper, SkinnedMesh, Vector3, type Material } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { rigFromSkinnedMesh, type AvatarRig } from "../../lib/garment/binding";
import { applyMeshInspection } from "../../lib/garment/inspection";
import { applyPose, captureBindPose, findPose, type PoseName } from "../../lib/garment/poses";
import type { ModelInfo } from "./types";

export interface LoadedRig { id: string; rig: AvatarRig; bind: ReturnType<typeof captureBindPose> }

export function AvatarModel({ url, wireframe, inspection, skeleton, pose, onReady, onRig }: { url: string; wireframe: boolean; inspection: boolean; skeleton: boolean; pose: PoseName; onReady: (info: ModelInfo) => void; onRig: (rig: LoadedRig | null) => void }) {
  const gltf = useGLTF(url);
  const invalidate = useThree((state) => state.invalidate);
  const model = useMemo(() => {
    const object = clone(gltf.scene);
    const materials: Material[] = [];
    let vertices = 0, triangles = 0, skinnedMeshes = 0, hasSkinning = false;
    const skinned: SkinnedMesh[] = [], meshes: Mesh[] = [];
    const bones = new Set<string>();
    object.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      meshes.push(child);
      const geometry = child.geometry;
      vertices += geometry.getAttribute("position")?.count ?? 0;
      triangles += (geometry.index?.count ?? geometry.getAttribute("position")?.count ?? 0) / 3;
      if (child instanceof SkinnedMesh) {
        skinnedMeshes++;
        skinned.push(child);
        child.frustumCulled = false; // posed vertices can leave the bind-pose bounding sphere
        child.skeleton.bones.forEach((bone) => bones.add(bone.uuid));
        hasSkinning ||= Boolean(geometry.getAttribute("skinIndex") && geometry.getAttribute("skinWeight"));
      }
      const original = Array.isArray(child.material) ? child.material : [child.material];
      const copies = original.map((material) => material.clone());
      materials.push(...copies); child.material = Array.isArray(child.material) ? copies : copies[0]; child.castShadow = true; child.receiveShadow = true;
    });
    object.updateMatrixWorld(true);
    const box = new Box3().setFromObject(object);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const primary = skinned[0];
    if (!primary || box.isEmpty() || !Number.isFinite(size.length()) || vertices === 0 || skinnedMeshes === 0 || !hasSkinning) {
      materials.forEach((material) => material.dispose());
      throw new Error("The selected GLB is missing a valid skinned mesh.");
    }
    const rig = rigFromSkinnedMesh(primary);
    const helper = new SkeletonHelper(object);
    return { object, meshes, materials, helper, rig, bind: captureBindPose(rig.bones), info: { vertices, triangles, joints: bones.size, skinnedMeshes, hasSkinning, size: size.toArray(), center: center.toArray() } as ModelInfo };
  }, [gltf.scene]);
  useEffect(() => { onReady(model.info); }, [model, onReady]);
  useEffect(() => { onRig({ id: model.object.uuid, rig: model.rig, bind: model.bind }); return () => onRig(null); }, [model, onRig]);
  useEffect(() => {
    try { applyPose(model.rig.bones, model.bind, findPose(pose)); }
    catch (error) { console.error("Test pose could not be applied to this avatar:", error); applyPose(model.rig.bones, model.bind, findPose("rest")); }
    invalidate();
  }, [model, pose, invalidate]);
  useEffect(() => { model.meshes.forEach((mesh) => applyMeshInspection(mesh, wireframe, inspection)); invalidate(); }, [model, wireframe, inspection, invalidate]);
  useEffect(() => () => { model.materials.forEach((material) => material.dispose()); model.helper.dispose(); }, [model]);
  // Blob URLs are revoked when replaced; drop them from the loader cache so a dead URL is never reused.
  useEffect(() => () => { if (url.startsWith("blob:")) useGLTF.clear(url); }, [url]);
  return <><primitive object={model.object} dispose={null} /><primitive object={model.helper} visible={skeleton} dispose={null} /></>;
}
