export const SIZES = ["S", "M", "L", "XL"] as const;
export type Size = typeof SIZES[number];
export type Slot = "top" | "bottom";
export type FitStatus = "tight" | "good" | "loose";
export type Region = { status: FitStatus; ease_mm?: number; delta_mm?: number; clamped?: boolean };
export interface FitMap { version: 1; garment: string; size: Size; body: string; regions: Record<string, Region>; recommended: boolean }
export type AvailableSize = { size: Size; status?: "available"; fit: FitMap; glb: string; sidecar: string };
export type SizeOption = AvailableSize | { size: Size; status: "withheld" };

/** Parse discovery results without requiring assets for deliberately withheld sizes. */
export function parseSizeOptions(value: unknown, body: string): SizeOption[] {
  if (!Array.isArray(value)) return [];
  const sizes = new Map<Size, SizeOption>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || !SIZES.includes(entry.size)) continue;
    const size = entry.size as Size;
    // A withheld declaration wins over a duplicate available entry in either order.
    if (entry.status === "withheld" || entry.withheld === true) { sizes.set(size, { size, status: "withheld" }); continue; }
    if (sizes.get(size)?.status === "withheld" || (entry.status !== undefined && entry.status !== "available")) continue;
    try {
      const fit = parseFitMap(entry.fit);
      if (fit.body === body && fit.size === size && typeof entry.glb === "string" && typeof entry.sidecar === "string") sizes.set(size, { size, fit, glb: entry.glb, sidecar: entry.sidecar });
    } catch { /* Ignore incomplete or malformed entries. */ }
  }
  return SIZES.flatMap(size => sizes.has(size) ? [sizes.get(size)!] : []);
}

export function isAvailableSize(option: SizeOption): option is AvailableSize {
  return option.status !== "withheld";
}

export function parseFitMap(value: unknown): FitMap {
  if (!value || typeof value !== "object") throw new Error("Invalid fit map");
  const data = value as FitMap;
  if (data.version !== 1 || typeof data.garment !== "string" || !SIZES.includes(data.size) || typeof data.body !== "string" || typeof data.recommended !== "boolean" || !data.regions || typeof data.regions !== "object" || Array.isArray(data.regions)) throw new Error("Invalid fit map");
  for (const [name, region] of Object.entries(data.regions)) {
    if (!region || !["tight", "good", "loose"].includes(region.status) || !Number.isFinite(name === "length" ? region.delta_mm : region.ease_mm) || (region.clamped !== undefined && typeof region.clamped !== "boolean")) throw new Error("Invalid fit region");
  }
  return data;
}

export function regionEstimateNote(region: Region): string | null {
  return region.clamped === true ? "estimated from size chart" : null;
}

export function isFullyClampedAndTight(fit: FitMap): boolean {
  const majorRegions = ["tshirt-v5.2", "tshirt-v5.3"].includes(fit.garment) ? ["chest", "waist", "hips"] : ["pants-v2", "pants-v3", "pants-v3.1"].includes(fit.garment) ? ["waist", "hips"] : [];
  return majorRegions.length > 0 && majorRegions.every(name => fit.regions[name]?.clamped === true && fit.regions[name]?.status === "tight");
}

export function formatRegion(name: string, region: Region, garment: string): string {
  const label = name.replaceAll("_", " ").replace(/^./, char => char.toUpperCase());
  const minima: Record<string, Record<string, number>> = {
    "tshirt-v5.2": { chest: 76, waist: 76, hips: 51, shoulders: 0, length: -40 },
    "pants-v2": { waist: 0, hips: 51, length: -40 },
  };
  const baseGarment = garment === "tshirt-v5.3" ? "tshirt-v5.2" : garment === "pants-v3" || garment === "pants-v3.1" ? "pants-v2" : garment;
  const minimum = region.status === "tight" ? minima[baseGarment]?.[name] : undefined;
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
