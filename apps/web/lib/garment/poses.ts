import { MathUtils, Quaternion, Vector3 } from "three";
import type { Bone, Object3D } from "three";

export type PoseName = "rest" | "left-30" | "left-60" | "left-90" | "right-90" | "both-90" | "both-120" | "torso-twist" | "combined" | "walk" | "l-hip-60" | "step" | "squat" | "wide";

/** A rotation about a joint's own pivot, expressed in the MHR rest frame: +X subject's left, +Y up, +Z forward. */
export interface JointRotation { joint: string; axis: readonly [number, number, number]; degrees: number }
export interface TestPose { name: PoseName; label: string; rotations: readonly JointRotation[] }

/** Upper arms in the MHR rest A-pose hang about 48° below horizontal; "raised N°" is abduction from that rest pose. */
export const REST_ARM_BELOW_HORIZONTAL_DEG = 48;
const raise = (side: "l" | "r", degrees: number): JointRotation => ({ joint: `${side}_uparm`, axis: [0, 0, 1], degrees: side === "l" ? degrees : -degrees });
const twist = (degrees: number): JointRotation[] => ["c_spine1", "c_spine2", "c_spine3"].map((joint) => ({ joint, axis: [0, 1, 0] as const, degrees: degrees / 3 }));

/** Provisional MHR names and world-space axes. Replace as a unit when the leg-pose contract lands. */
export const LEG_JOINTS = {
  leftHip: { joint: "l_upleg", flexAxis: [-1, 0, 0], abductAxis: [0, 0, 1] },
  rightHip: { joint: "r_upleg", flexAxis: [-1, 0, 0], abductAxis: [0, 0, -1] },
  leftKnee: { joint: "l_lowleg", flexAxis: [1, 0, 0] },
  rightKnee: { joint: "r_lowleg", flexAxis: [1, 0, 0] },
} as const;
const leg = (entry: { joint: string; flexAxis: readonly [number, number, number] }, degrees: number): JointRotation => ({ joint: entry.joint, axis: entry.flexAxis, degrees });
const abduct = (entry: { joint: string; abductAxis: readonly [number, number, number] }, degrees: number): JointRotation => ({ joint: entry.joint, axis: entry.abductAxis, degrees });
export const LEG_POSE_NAMES = ["walk", "l-hip-60", "step", "squat", "wide"] as const;

export const TEST_POSES: readonly TestPose[] = [
  { name: "rest", label: "Rest (A-pose)", rotations: [] },
  { name: "left-30", label: "Left arm raised 30°", rotations: [raise("l", 30)] },
  { name: "left-60", label: "Left arm raised 60°", rotations: [raise("l", 60)] },
  { name: "left-90", label: "Left arm raised 90°", rotations: [raise("l", 90)] },
  { name: "right-90", label: "Right arm raised 90°", rotations: [raise("r", 90)] },
  { name: "both-90", label: "Both arms raised 90°", rotations: [raise("l", 90), raise("r", 90)] },
  { name: "both-120", label: "Both arms raised 120°", rotations: [raise("l", 120), raise("r", 120)] },
  { name: "torso-twist", label: "Torso rotation 21°", rotations: twist(21) },
  { name: "walk", label: "Walk", rotations: [leg(LEG_JOINTS.leftHip, 30), leg(LEG_JOINTS.rightHip, -15), leg(LEG_JOINTS.leftKnee, 20), leg(LEG_JOINTS.rightKnee, 20)] },
  { name: "l-hip-60", label: "Left hip flex 60\u00b0", rotations: [leg(LEG_JOINTS.leftHip, 60)] },
  { name: "step", label: "Step (hip and knee 90\u00b0)", rotations: [leg(LEG_JOINTS.leftHip, 90), leg(LEG_JOINTS.leftKnee, 90)] },
  { name: "squat", label: "Squat", rotations: [leg(LEG_JOINTS.leftHip, 45), leg(LEG_JOINTS.rightHip, 45), leg(LEG_JOINTS.leftKnee, 60), leg(LEG_JOINTS.rightKnee, 60)] },
  { name: "wide", label: "Wide stance", rotations: [abduct(LEG_JOINTS.leftHip, 20), abduct(LEG_JOINTS.rightHip, 20)] },
  { name: "combined", label: "Arms 45°/30° + torso 15°", rotations: [raise("l", 45), raise("r", 30), ...twist(15)] },
];

export function findPose(name: PoseName): TestPose {
  const pose = TEST_POSES.find((item) => item.name === name);
  if (!pose) throw new Error(`Unknown test pose: ${name}`);
  return pose;
}

export function captureBindPose(bones: ReadonlyMap<string, Bone>): Map<string, Quaternion> {
  return new Map([...bones].map(([name, bone]) => [name, bone.quaternion.clone()]));
}

function topmost(object: Object3D): Object3D {
  let cursor = object;
  while (cursor.parent) cursor = cursor.parent;
  return cursor;
}

const scratchParent = new Quaternion();
const scratchDelta = new Quaternion();
const scratchAxis = new Vector3();

/** Resets every bone to its bind rotation, then applies the pose's rotations in order (no per-frame allocation). */
export function applyPose(bones: ReadonlyMap<string, Bone>, bind: ReadonlyMap<string, Quaternion>, pose: TestPose): void {
  for (const [name, bone] of bones) {
    const rest = bind.get(name);
    if (rest) bone.quaternion.copy(rest);
  }
  const first = bones.values().next().value;
  if (!first) return;
  topmost(first).updateMatrixWorld(true);
  for (const rotation of pose.rotations) {
    const bone = bones.get(rotation.joint);
    if (!bone || !bone.parent) throw new Error(`Pose ${pose.name} needs joint ${rotation.joint}, which the avatar lacks.`);
    bone.parent.getWorldQuaternion(scratchParent);
    scratchDelta.setFromAxisAngle(scratchAxis.set(...rotation.axis).normalize(), MathUtils.degToRad(rotation.degrees));
    // local' = parentWorld⁻¹ · delta · parentWorld · local  (a world-space rotation about the joint's pivot)
    bone.quaternion.premultiply(scratchParent).premultiply(scratchDelta).premultiply(scratchParent.invert());
    bone.updateMatrixWorld(true);
  }
}
