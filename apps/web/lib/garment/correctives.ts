import { MathUtils, Vector3, type Bone, type Quaternion, type SkinnedMesh } from "three";

export interface Corrective { target: string; joint: string; measure: "swing_deg"; ramp: [number, number] }
export interface Sidecar { version: 1; correctives: Corrective[] }
export function parseSidecar(value: unknown): Sidecar {
  const v = value as Sidecar;
  if (!v || v.version !== 1 || !Array.isArray(v.correctives) || !v.correctives.every(c => typeof c.target === "string" && typeof c.joint === "string" && c.measure === "swing_deg" && Array.isArray(c.ramp) && c.ramp.length === 2 && c.ramp.every(Number.isFinite) && c.ramp[1] > c.ramp[0])) throw new Error("Invalid corrective sidecar.");
  return v;
}
/** The direction is the first nonzero child-bone offset, rotated into the joint's parent space. */
export function createCorrectiveDriver(mesh: SkinnedMesh, bones: ReadonlyMap<string, Bone>, rest: ReadonlyMap<string, Quaternion>, sidecar: Sidecar | null, warn: (message: string) => void = console.warn) {
  const influences = mesh.morphTargetInfluences;
  if (influences) influences.fill(0);
  const entries = (sidecar?.correctives ?? []).flatMap(c => {
    const index = mesh.morphTargetDictionary?.[c.target];
    if (index === undefined || !influences) { warn(`Corrective target not found: ${c.target}`); return []; }
    const bone = bones.get(c.joint), bind = rest.get(c.joint);
    const child = bone?.children.find(item => (item as Bone).isBone && item.position.lengthSq() > 1e-12);
    if (!bone || !bind || !child) { warn(`Corrective joint or bone direction not found: ${c.joint}`); return []; }
    const direction = child.position.clone().normalize();
    return [{ ...c, index, bone, direction, restDirection: direction.clone().applyQuaternion(bind) }];
  });
  const current = new Vector3();
  return (enabled: boolean): Record<string, number> => {
    if (influences) influences.fill(0);
    const weights: Record<string, number> = {};
    for (const e of entries) {
      current.copy(e.direction).applyQuaternion(e.bone.quaternion);
      const angle = MathUtils.radToDeg(e.restDirection.angleTo(current));
      const weight = enabled ? MathUtils.clamp((angle - e.ramp[0]) / (e.ramp[1] - e.ramp[0]), 0, 1) : 0;
      influences![e.index] = weight; weights[e.target] = weight;
    }
    return weights;
  };
}
