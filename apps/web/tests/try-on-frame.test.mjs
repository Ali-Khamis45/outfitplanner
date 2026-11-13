import assert from "node:assert/strict";
import { tryOnFraming } from "../lib/garment/tryOnFraming.ts";

const height = 1.7268, width = 1.3064, fov = 40;
// Stage sizes measured from a 390 -> 1024 -> 1440 -> 390 resize sequence.
const stages = [[375, 506], [565, 844], [798, 844], [375, 506]];
const frames = stages.map(([w, h], i) => tryOnFraming(height, width, w, h, fov, false, i === 0 || i === 3));
for (const [index, frame] of frames.entries()) {
  assert.ok(Number.isFinite(frame.distance) && frame.distance > 0);
  const coverage = height / (2 * Math.tan(fov * Math.PI / 360) * frame.distance);
  if (index === 0 || index === 3) assert.ok(coverage >= 0.8 && coverage <= 0.820001, `stacked stage ${index}: coverage ${coverage}`);
  else assert.ok((0.5 + 0.43 * coverage) * stages[index][1] <= stages[index][1] - 150 + 1e-6, `desktop stage ${index}: space above the caption`);
  assert.equal(frame.targetYOffset, -height * 0.07);
}
assert.ok(frames[1].distance > frames[0].distance, "desktop must reserve space for the caption");
assert.equal(frames[3].distance, frames[0].distance, "returning to phone restores its framing");
const armsOut = tryOnFraming(height, width, 375, 506, fov, true, true);
assert.ok(armsOut.distance > frames[0].distance, "arms out needs additional horizontal space");
const landscape = tryOnFraming(height, width, 844, 234, fov, false, true);
const landscapeCoverage = height / (2 * Math.tan(fov * Math.PI / 360) * landscape.distance);
assert.ok(Math.abs(landscapeCoverage - 0.82) < 1e-6, "landscape fills the stage with controls to the side");
const shortPortrait = tryOnFraming(height, width, 220, 234, fov, false, true);
const shortCoverage = height / (2 * Math.tan(fov * Math.PI / 360) * shortPortrait.distance);
assert.ok((0.5 + 0.43 * shortCoverage) * 234 <= 234 - 72 + 1e-6, "short portrait reserves room for the controls");
console.log("Try-on framing responds to the complete resize sequence");
