import { MathUtils, Vector3, type Bone, type Quaternion, type SkinnedMesh } from "three";

export interface Corrective { target: string; joint: string; child?: string; measure: "swing_deg" | "signed_swing_deg"; axis?: [number, number, number]; ramp: [number, number] }
export interface Sidecar { version: 1 | 2; correctives: Corrective[] }
export function parseSidecar(value: unknown): Sidecar {
  const v = value as Sidecar;
  if (!v || (v.version !== 1 && v.version !== 2) || !Array.isArray(v.correctives) || !v.correctives.every(c => c && typeof c.target === "string" && typeof c.joint === "string" && (c.child === undefined || (typeof c.child === "string" && c.child.length > 0)) && (c.measure === "swing_deg" || (v.version === 2 && c.measure === "signed_swing_deg" && Array.isArray(c.axis) && c.axis.length === 3 && c.axis.every(Number.isFinite) && c.axis.some(n => n !== 0))) && Array.isArray(c.ramp) && c.ramp.length === 2 && c.ramp.every(Number.isFinite) && (v.version === 1 ? c.ramp[1] > c.ramp[0] : c.ramp[1] !== c.ramp[0]))) throw new Error("Invalid corrective sidecar.");
  return v;
}
/** Legacy sidecars without a child use the first nonzero child bone, with a warning. */
export function createCorrectiveDriver(mesh: SkinnedMesh, bones: ReadonlyMap<string, Bone>, rest: ReadonlyMap<string, Quaternion>, sidecar: Sidecar | null, warn: (message: string) => void = console.warn) {
  const influences = mesh.morphTargetInfluences;
  if (influences) influences.fill(0);
  const entries = (sidecar?.correctives ?? []).flatMap(c => {
    const index = mesh.morphTargetDictionary?.[c.target];
    if (index === undefined || !influences) { warn(`Corrective target not found: ${c.target}`); return []; }
    const bone = bones.get(c.joint), bind = rest.get(c.joint);
    if (c.child === undefined) warn(`Corrective ${c.target} has no child; using first nonzero child bone.`);
    const child = bone?.children.find(item => (item as Bone).isBone && item.position.lengthSq() > 1e-12 && (c.child === undefined || item.name === c.child));
    if (!bone || !bind || !child) { warn(`Corrective joint or bone direction not found: ${c.joint}`); return []; }
    const direction = child.position.clone().normalize();
    const restDirection = direction.clone().applyQuaternion(bind).normalize();
    let planeAxis: Vector3 | null = null;
    if (c.measure === "signed_swing_deg") {
      if (!c.axis) { warn(`Corrective axis missing: ${c.target}`); return []; }
      const axis = new Vector3(...c.axis).normalize();
      planeAxis = axis.addScaledVector(restDirection, -axis.dot(restDirection));
      if (planeAxis.lengthSq() < 1e-12) { warn(`Corrective axis is parallel to its rest direction: ${c.target}`); return []; }
      planeAxis.normalize();
    }
    return [{ ...c, index, bone, direction, restDirection, planeAxis }];
  });
  const current = new Vector3();
  return (enabled: boolean): Record<string, number> => {
    if (influences) influences.fill(0);
    const weights: Record<string, number> = {};
    for (const e of entries) {
      current.copy(e.direction).applyQuaternion(e.bone.quaternion);
      let measuredAngle = e.planeAxis ? MathUtils.radToDeg(Math.atan2(current.dot(e.planeAxis), current.dot(e.restDirection))) : MathUtils.radToDeg(e.restDirection.angleTo(current));
      if (measuredAngle <= -180) measuredAngle = 180;
      const angle = Math.abs(measuredAngle) < 0.01 ? 0 : measuredAngle;
      const weight = enabled ? MathUtils.clamp((angle - e.ramp[0]) / (e.ramp[1] - e.ramp[0]), 0, 1) : 0;
      influences![e.index] = weight; weights[e.target] = weight;
    }
    return weights;
  };
}
