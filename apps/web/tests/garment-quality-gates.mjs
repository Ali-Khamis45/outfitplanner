/** Sprint 1.4A supported-pose gates. +120 remains diagnostic only. */
export const TARGETS = { both90MaxStretch: 8.785, penetratingBeyond3mm: 0, degenerate: 0 };
export function evaluateSupportedPoses(poses, supportedNames) {
  const gates = {}, failures = [];
  for (const name of supportedNames) {
    if (name === "both-120") continue;
    const pose = poses[name];
    if (!pose) { failures.push(`${name}: missing pose result`); continue; }
    const checks = {
      penetratingBeyond3mm: [pose.penetratingBeyond3mm, TARGETS.penetratingBeyond3mm],
      degenerate: [pose.degenerate, TARGETS.degenerate],
      ...(name === "both-90" ? { maxStretch: [pose.stretch.max, TARGETS.both90MaxStretch] } : {}),
    };
    gates[name] = {};
    for (const [key, [value, limit]] of Object.entries(checks)) {
      const pass = Number.isFinite(value) && value <= limit;
      gates[name][key] = { value, limit, pass };
      if (!pass) failures.push(`${name} ${key} ${value} > ${limit}`);
    }
  }
  if (!supportedNames.includes("both-90")) failures.push("both-90: required pose was not evaluated");
  return { gates, failures };
}
