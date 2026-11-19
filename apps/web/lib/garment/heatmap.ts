import type { BufferGeometry, MeshStandardMaterial } from "three";
import { easeAttributeName } from "./fitMap.ts";

/** Keep the skinned/morphed material and replace only its fragment colour. */
export function configureHeatmap(material: MeshStandardMaterial, geometry: BufferGeometry, enabled: boolean): boolean {
  const attribute = easeAttributeName(Object.keys(geometry.attributes));
  const active = !!(enabled && attribute && geometry.getAttribute(attribute).itemSize === 1 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(attribute));
  material.onBeforeCompile = shader => {
    if (!active || !attribute) return;
    shader.vertexShader = `attribute float ${attribute};\nvarying float vEaseMm;\n${shader.vertexShader}`.replace("#include <begin_vertex>", "#include <begin_vertex>\nvEaseMm = " + attribute + ";");
    shader.fragmentShader = `varying float vEaseMm;\n${shader.fragmentShader}`.replace("#include <color_fragment>", `#include <color_fragment>
      vec3 tight = vec3(0.92, 0.32, 0.06);
      vec3 good = vec3(0.12, 0.70, 0.28);
      vec3 loose = vec3(0.10, 0.32, 0.88);
      diffuseColor.rgb = vEaseMm < 0.0 ? mix(good, tight, clamp(-vEaseMm / 20.0, 0.0, 1.0)) : mix(good, loose, clamp(vEaseMm / 40.0, 0.0, 1.0));`);
  };
  material.customProgramCacheKey = () => active ? `fit-heatmap-${attribute}` : "fit-heatmap-off";
  material.needsUpdate = true;
  return active;
}
