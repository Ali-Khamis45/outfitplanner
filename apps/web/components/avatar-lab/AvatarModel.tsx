"use client";
import { useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Box3, Mesh, MeshStandardMaterial, SkeletonHelper, SkinnedMesh, Vector3 } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { ModelInfo } from "./types";

export function AvatarModel({ wireframe, skeleton, onReady }: { wireframe: boolean; skeleton: boolean; onReady: (info: ModelInfo) => void }) {
  const gltf = useGLTF("/api/demo-avatar");
  const invalidate = useThree((state) => state.invalidate);
  const model = useMemo(() => {
    const object = clone(gltf.scene);
    const materials: MeshStandardMaterial[] = [];
    let vertices = 0, triangles = 0, skinnedMeshes = 0, hasSkinning = false;
    const bones = new Set<string>();
    object.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const geometry = child.geometry;
      vertices += geometry.getAttribute("position")?.count ?? 0;
      triangles += (geometry.index?.count ?? geometry.getAttribute("position")?.count ?? 0) / 3;
      if (child instanceof SkinnedMesh) {
        skinnedMeshes++;
        child.skeleton.bones.forEach((bone) => bones.add(bone.uuid));
        hasSkinning ||= Boolean(geometry.getAttribute("skinIndex") && geometry.getAttribute("skinWeight"));
      }
      const material = new MeshStandardMaterial({ color: "#c8d1cc", roughness: 0.72, metalness: 0.05 });
      materials.push(material); child.material = material; child.castShadow = true; child.receiveShadow = true;
    });
    object.updateMatrixWorld(true);
    const box = new Box3().setFromObject(object);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    if (box.isEmpty() || !Number.isFinite(size.length()) || vertices === 0 || skinnedMeshes === 0 || !hasSkinning) {
      materials.forEach((material) => material.dispose());
      throw new Error("The demo GLB is missing a valid skinned mesh.");
    }
    const helper = new SkeletonHelper(object);
    return { object, materials, helper, info: { vertices, triangles, joints: bones.size, skinnedMeshes, hasSkinning, size: size.toArray(), center: center.toArray() } as ModelInfo };
  }, [gltf.scene]);
  useEffect(() => { onReady(model.info); }, [model, onReady]);
  useEffect(() => { model.materials.forEach((material) => { material.wireframe = wireframe; }); invalidate(); }, [model, wireframe, invalidate]);
  useEffect(() => () => { model.materials.forEach((material) => material.dispose()); model.helper.dispose(); }, [model]);
  return <><primitive object={model.object} dispose={null} /><primitive object={model.helper} visible={skeleton} dispose={null} /></>;
}
