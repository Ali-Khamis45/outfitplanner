// Garment generations. tshirt-v5.3 / pants-v3 (Sprint 3.5: pattern panels, UV layout v3) are the default for every
// body and size; its sizes pass the Sprint 3.6 gates. The previous default, tshirt-v5.2 / pants-v2, is a development-only
// comparison set (?gen=v5.2), labelled "legacy, ungated": its sizes were never gated and most fail. Removed in Sprint 3.7
// (LEGACY_GENERATION and outputs/garments/sizes-v5.2). Candidates are development-only: ?gen=v5.3&pants=v3.1 swaps in
// pants-v3.1 (no knee step) under the v5.3 shirts until it is accepted.
export const GENERATIONS = {
  "v5.3": { label: "v5.3 / pants-v3 (default)", top: "tshirt-v5.3", bottom: "pants-v3", topVariant: "v5.3", bottomVariant: "pants-v3", topSizesDir: "sizes", bottomSizesDir: "sizes", topTexture: "shirt-v3", bottomTexture: "pants-v3", layout: "v3", query: {} },
  "v5.2": { label: "v5.2 / pants-v2 (legacy, ungated)", top: "tshirt-v5.2", bottom: "pants-v2", topVariant: "v5.2", bottomVariant: "pants-v2", topSizesDir: "sizes-v5.2", bottomSizesDir: "sizes-v5.2", topTexture: "shirt", bottomTexture: "pants", layout: "v2", query: { gen: "v5.2" } },
  "v5.3+pants-v3.1": { label: "v5.3 / pants-v3.1 (candidate)", top: "tshirt-v5.3", bottom: "pants-v3.1", topVariant: "v5.3", bottomVariant: "pants-v3.1", topSizesDir: "sizes", bottomSizesDir: "sizes-pants-v3.1", topTexture: "shirt-v3", bottomTexture: "pants-v3", layout: "v3", query: { gen: "v5.3", pants: "v3.1" } },
} as const;
export type Generation = keyof typeof GENERATIONS;
export const DEFAULT_GENERATION: Generation = "v5.3";
export const LEGACY_GENERATION: Generation = "v5.2";
const CANDIDATES: readonly Generation[] = ["v5.3+pants-v3.1"];

/** The generation that ?gen= (and ?pants=) ask for, in development only: "v5.2" selects the legacy, ungated set;
 * "pants=v3.1" (with gen absent or v5.3) the pants-v3.1 candidate. Anything else, and every request outside development,
 * gets the default. */
export function parseGeneration(gen: unknown, pants: unknown = null, development = process.env.NODE_ENV === "development"): Generation {
  if (!development) return DEFAULT_GENERATION;
  if (gen === LEGACY_GENERATION) return LEGACY_GENERATION;
  if (pants === "v3.1" && (gen === undefined || gen === null || gen === DEFAULT_GENERATION)) return "v5.3+pants-v3.1";
  return DEFAULT_GENERATION;
}
export const isCandidate = (generation: Generation) => CANDIDATES.includes(generation);
/** Query parameters that select a generation (none for the default). */
export const generationQuery = (generation: Generation): Record<string, string> => ({ ...GENERATIONS[generation].query });

// Wardrobe templates name a garment family; every T-shirt or pants template is shown in the active generation.
export const TOP_TEMPLATES: readonly string[] = ["tshirt-v5.3", "tshirt-v5.2"];
export const BOTTOM_TEMPLATES: readonly string[] = ["pants-v3", "pants-v2", "pants-basic-v2"];
export const isTopTemplate = (template: string | null | undefined) => TOP_TEMPLATES.includes(template ?? "");
export const isBottomTemplate = (template: string | null | undefined) => BOTTOM_TEMPLATES.includes(template ?? "");

/** The UV layout a template's textures are painted in (a texture only fits a mesh with that layout). */
export function templateLayout(template: string | null | undefined): "v3" | "v2" | null {
  return template === "tshirt-v5.3" || template === "pants-v3" ? "v3" : template === "tshirt-v5.2" || template === "pants-v2" || template === "pants-basic-v2" ? "v2" : null;
}

/** The size-file garment name (fit.json "garment") of a wardrobe template in a generation, or null if unsupported. */
export function garmentForTemplate(template: string | null | undefined, generation: Generation = DEFAULT_GENERATION): string | null {
  return isTopTemplate(template) ? GENERATIONS[generation].top : isBottomTemplate(template) ? GENERATIONS[generation].bottom : null;
}
