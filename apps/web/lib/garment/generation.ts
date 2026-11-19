// Garment generations. tshirt-v5.3 / pants-v3.1 (pattern panels, UV layout v3; pants v3.1 has no knee step) are the
// default for every body and size; its sizes pass the Sprint 3.6 gates. pants-v3.1 replaced pants-v3 as the default
// bottom after the browser check of 2026-11-19; a wardrobe template "pants-v3" names the pants family and its UV layout,
// so it is shown on pants-v3.1. The previous default, tshirt-v5.2 / pants-v2, is a development-only comparison set
// (?gen=v5.2), labelled "legacy, ungated": its sizes were never gated and most fail. Removed in Sprint 3.7
// (LEGACY_GENERATION and outputs/garments/sizes-v5.2).
export const GENERATIONS = {
  "v5.3": { label: "v5.3 / pants-v3.1 (default)", top: "tshirt-v5.3", bottom: "pants-v3.1", topVariant: "v5.3", bottomVariant: "pants-v3.1", topSizesDir: "sizes", bottomSizesDir: "sizes", topTexture: "shirt-v3", bottomTexture: "pants-v3", layout: "v3", query: {} },
  "v5.2": { label: "v5.2 / pants-v2 (legacy, ungated)", top: "tshirt-v5.2", bottom: "pants-v2", topVariant: "v5.2", bottomVariant: "pants-v2", topSizesDir: "sizes-v5.2", bottomSizesDir: "sizes-v5.2", topTexture: "shirt", bottomTexture: "pants", layout: "v2", query: { gen: "v5.2" } },
} as const;
export type Generation = keyof typeof GENERATIONS;
export const DEFAULT_GENERATION: Generation = "v5.3";
export const LEGACY_GENERATION: Generation = "v5.2";

/** The generation a ?gen= value asks for: "v5.2" selects the legacy, ungated set in development only; anything else, and
 *  every request outside development, gets the default. */
export function parseGeneration(gen: unknown, development = process.env.NODE_ENV === "development"): Generation {
  return development && gen === LEGACY_GENERATION ? LEGACY_GENERATION : DEFAULT_GENERATION;
}
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
