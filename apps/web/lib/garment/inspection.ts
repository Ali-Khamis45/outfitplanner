import type { Mesh } from "three";

/** Apply wireframe to the existing mesh only; keep depth testing and restore shadows in solid mode. */
export function applyMeshInspection(mesh: Mesh, wireframe: boolean, inspection: boolean): void {
  mesh.receiveShadow = !inspection;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    if ("wireframe" in material && typeof material.wireframe === "boolean") material.wireframe = wireframe;
    material.needsUpdate = true;
  }
}
