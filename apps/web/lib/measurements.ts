export const measurementFields = {
  height: { label: "Height", min: 120, max: 230, hint: "Barefoot, standing straight, floor to top of head." },
  chest: { label: "Chest", min: 50, max: 200, hint: "Horizontal circumference at the fullest part of the chest, under the armpits, relaxed breath." },
  waist: { label: "Waist", min: 50, max: 200, hint: "Horizontal circumference at the narrowest point, or at the navel if there is no clear narrowing." },
  hips: { label: "Hips", min: 50, max: 200, hint: "Horizontal circumference at the fullest part of the buttocks." },
  inseam: { label: "Inseam", min: 50, max: 110, hint: "Crotch to floor along the inside of the leg, barefoot." },
} as const;
export type MeasurementName = keyof typeof measurementFields;
export type Measurements = Record<MeasurementName, string>;
export const names = Object.keys(measurementFields) as MeasurementName[];
export const emptyMeasurements: Measurements = { height: "", chest: "", waist: "", hips: "", inseam: "" };

export function measurementError(name: MeasurementName, value: string): string | null {
  const { label, min, max } = measurementFields[name];
  if (value.trim() === "") return name === "height" ? "Height is required." : null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return `${label} must be between ${min} and ${max} cm.`;
  if (!/^\d+(\.\d)?$/.test(value)) return `${label} must have at most one decimal place.`;
  return null;
}

export function serializeMeasurements(values: Measurements, date: Date): string {
  if (names.some(name => measurementError(name, values[name]))) throw new Error("Invalid measurements");
  const measuredAt = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const fields = names.map(name => `  "${name}_cm": ${values[name] === "" ? "null" : Number(values[name]).toFixed(1)},`);
  return ['{', '  "version": 1,', '  "units": "cm",', ...fields, `  "measured_at": "${measuredAt}"`, '}'].join('\n');
}
