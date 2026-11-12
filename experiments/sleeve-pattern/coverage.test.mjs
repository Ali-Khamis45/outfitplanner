import assert from "node:assert/strict";
import { sideCoverage } from "../../apps/web/lib/garment/diagnostics.ts";
import { coverageGate } from "./coverage.mjs";
const sample = (value) => ({ "both-90": { left: value, right: value }, "both-120": { left: value, right: value } });
assert.equal(coverageGate(sample(0.2), sample(0.3)), true);
assert.equal(coverageGate(sample(0.2), sample(0.2)), false);
assert.equal(coverageGate(sample(0.2), { ...sample(0.3), "both-120": { left: 0.3, right: 0.1 } }), false);
assert.equal(coverageGate(sample(0.2), { ...sample(0.3), "both-120": { left: 0.3 } }), false);
// Side rays meet the two cloth planes; removing one plane exposes that side.
const body = [0.1, 0, 0, -0.1, 0, 0];
const cloth = [0.2,-1,-1, 0.2,1,-1, 0.2,0,1, -0.2,-1,-1, -0.2,1,-1, -0.2,0,1];
assert.equal(sideCoverage(body, [0,1], cloth, [0,1,2,3,4,5]), 1);
assert.equal(sideCoverage(body, [0,1], cloth, [0,1,2]), 0.5);
console.log("Coverage gate tests passed");
