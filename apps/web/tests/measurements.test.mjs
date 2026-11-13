import assert from "node:assert/strict";
import { emptyMeasurements, measurementError, measurementFields, names, serializeMeasurements } from "../lib/measurements.ts";

assert.equal(measurementError("height", ""), "Height is required.");
for (const name of names) {
  const { min, max } = measurementFields[name];
  assert.equal(measurementError(name, String(min)), null);
  assert.equal(measurementError(name, String(max)), null);
  assert.ok(measurementError(name, String(min - 0.1)));
  assert.ok(measurementError(name, String(max + 0.1)));
  assert.ok(measurementError(name, `${min}.01`));
}
const output = serializeMeasurements({ ...emptyMeasurements, height: "178", chest: "102.5" }, new Date(2026, 10, 13));
assert.deepEqual(JSON.parse(output), { version: 1, units: "cm", height_cm: 178, chest_cm: 102.5, waist_cm: null, hips_cm: null, inseam_cm: null, measured_at: "2026-11-13" });
assert.match(output, /"height_cm": 178\.0/);
assert.throws(() => serializeMeasurements(emptyMeasurements, new Date()));
console.log("Measurement validation and export checks passed");
