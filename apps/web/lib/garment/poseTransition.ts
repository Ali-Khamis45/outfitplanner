import type { Bone, Quaternion } from "three";
import { applyPose, findPose, type JointRotation, type PoseName } from "./poses.ts";

/** Try-on only, in degrees relative to the MHR rest pose; world-space axes as in poses.ts. */
export const TRY_ON_ARM_CONFIG = { adductionDeg: 18, walkSwingDeg: 10 } as const;

export function tryOnPose(name: PoseName) {
  const base = findPose(name);
  if (name !== "rest" && name !== "walk") return base;
  const arms: JointRotation[] = [
    { joint: "l_uparm", axis: [0, 0, 1], degrees: -TRY_ON_ARM_CONFIG.adductionDeg },
    { joint: "r_uparm", axis: [0, 0, 1], degrees: TRY_ON_ARM_CONFIG.adductionDeg },
  ];
  if (name === "walk") arms.push(
    { joint: "l_uparm", axis: [1, 0, 0], degrees: TRY_ON_ARM_CONFIG.walkSwingDeg },
    { joint: "r_uparm", axis: [1, 0, 0], degrees: -TRY_ON_ARM_CONFIG.walkSwingDeg },
  );
  return { ...base, rotations: [...base.rotations, ...arms] };
}

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
    applyPose(bones, bind, tryOnPose(pose));
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
