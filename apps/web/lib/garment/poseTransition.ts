import type { Bone, Quaternion } from "three";
import { applyPose, findPose, type PoseName } from "./poses.ts";

export interface PoseTransition {
  bones: ReadonlyMap<string, Bone>;
  from: Map<string, Quaternion>;
  to: Map<string, Quaternion>;
  elapsed: number;
}

/** Calculate the contract pose without snapping the visible skeleton. */
export function beginPoseTransition(bones: ReadonlyMap<string, Bone>, bind: ReadonlyMap<string, Quaternion>, pose: PoseName): PoseTransition {
  const from = new Map([...bones].map(([name, bone]) => [name, bone.quaternion.clone()]));
  try {
    applyPose(bones, bind, findPose(pose));
    const to = new Map([...bones].map(([name, bone]) => [name, bone.quaternion.clone()]));
    return { bones, from, to, elapsed: 0 };
  } finally {
    for (const [name, bone] of bones) bone.quaternion.copy(from.get(name)!);
  }
}

/** Smoothstep timing and quaternion interpolation; interrupted changes start at the current pose. */
export function advancePoseTransition(transition: PoseTransition, delta: number): boolean {
  transition.elapsed = Math.min(0.4, transition.elapsed + Math.max(0, delta));
  const t = transition.elapsed / 0.4;
  const eased = t * t * (3 - 2 * t);
  for (const [name, bone] of transition.bones) bone.quaternion.slerpQuaternions(transition.from.get(name)!, transition.to.get(name)!, eased);
  return t === 1;
}
