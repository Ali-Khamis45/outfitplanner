export const SIZES = ["S", "M", "L", "XL"] as const;
export type Size = typeof SIZES[number];
export type Slot = "top" | "bottom";
export type FitStatus = "tight" | "good" | "loose";
export type Region = { status: FitStatus; ease_mm?: number; delta_mm?: number };
export interface FitMap { version: 1; garment: string; size: Size; body: string; regions: Record<string, Region>; recommended: boolean }
export interface SizeOption { size: Size; fit: FitMap; glb: string; sidecar: string }

export function parseFitMap(value: unknown): FitMap {
  if (!value || typeof value !== "object") throw new Error("Invalid fit map");
  const data = value as FitMap;
  if (data.version !== 1 || typeof data.garment !== "string" || !SIZES.includes(data.size) || typeof data.body !== "string" || typeof data.recommended !== "boolean" || !data.regions || typeof data.regions !== "object" || Array.isArray(data.regions)) throw new Error("Invalid fit map");
  for (const [name, region] of Object.entries(data.regions)) {
    if (!region || !["tight", "good", "loose"].includes(region.status) || !Number.isFinite(name === "length" ? region.delta_mm : region.ease_mm)) throw new Error("Invalid fit region");
  }
  return data;
}

export function formatRegion(name: string, region: Region, garment: string): string {
  const label = name.replaceAll("_", " ").replace(/^./, char => char.toUpperCase());
  const minima: Record<string, Record<string, number>> = {
    "tshirt-v5.2": { chest: 76, waist: 76, hips: 51, shoulders: 0, length: -40 },
    "pants-v2": { waist: 0, hips: 51, length: -40 },
  };
  const minimum = region.status === "tight" ? minima[garment]?.[name] : undefined;
  const suffix = minimum === undefined ? "" : ` (min ${(minimum / 10).toFixed(1)} cm${name === "length" ? " from target" : ""})`;
  if (name === "length") {
    const cm = Math.abs(region.delta_mm ?? 0) / 10;
    return `${label}: ${cm.toFixed(1)} cm ${region.delta_mm === 0 ? "on target" : (region.delta_mm ?? 0) < 0 ? "short" : "long"}${suffix}`;
  }
  return `${label}: ${region.status}, ${((region.ease_mm ?? 0) / 10).toFixed(1)} cm ease${suffix}`;
}

export function easeAttributeName(names: string[]): string | undefined {
  return names.find(name => name.toLowerCase() === "_ease_mm");
}
