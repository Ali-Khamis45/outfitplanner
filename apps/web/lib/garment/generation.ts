// Garment generations. tshirt-v5.3 / pants-v3 (Sprint 3.5: pattern panels, UV layout v3) are the default for every
// body and size. The previous default, tshirt-v5.2 / pants-v2, stays reachable with ?gen=v5.2 for one sprint
// (through Sprint 4A); remove LEGACY_GENERATION and outputs/garments/sizes-v5.2 after that.
export const GENERATIONS = {
  "v5.3": { top: "tshirt-v5.3", bottom: "pants-v3", topVariant: "v5.3", bottomVariant: "pants-v3", sizesDir: "sizes", topTexture: "shirt-v3", bottomTexture: "pants-v3" },
  "v5.2": { top: "tshirt-v5.2", bottom: "pants-v2", topVariant: "v5.2", bottomVariant: "pants-v2", sizesDir: "sizes-v5.2", topTexture: "shirt", bottomTexture: "pants" },
} as const;
export type Generation = keyof typeof GENERATIONS;
export const DEFAULT_GENERATION: Generation = "v5.3";
export const LEGACY_GENERATION: Generation = "v5.2";

/** The generation a ?gen= value asks for: "v5.2" selects the previous default, anything else the default. */
export function parseGeneration(value: unknown): Generation {
  return value === LEGACY_GENERATION ? LEGACY_GENERATION : DEFAULT_GENERATION;
}

// Wardrobe templates name a garment family; every T-shirt or pants template is shown in the active generation.
export const TOP_TEMPLATES: readonly string[] = ["tshirt-v5.3", "tshirt-v5.2"];
export const BOTTOM_TEMPLATES: readonly string[] = ["pants-v3", "pants-v2", "pants-basic-v2"];
export const isTopTemplate = (template: string | null | undefined) => TOP_TEMPLATES.includes(template ?? "");
export const isBottomTemplate = (template: string | null | undefined) => BOTTOM_TEMPLATES.includes(template ?? "");

/** The generation whose UV layout a template's textures use (a texture only fits the mesh of its own layout). */
export function templateGeneration(template: string | null | undefined): Generation | null {
  return template === "tshirt-v5.3" || template === "pants-v3" ? "v5.3" : template === "tshirt-v5.2" || template === "pants-v2" || template === "pants-basic-v2" ? "v5.2" : null;
}

/** The size-file garment name (fit.json "garment") of a wardrobe template in a generation, or null if unsupported. */
export function garmentForTemplate(template: string | null | undefined, generation: Generation = DEFAULT_GENERATION): string | null {
  return isTopTemplate(template) ? GENERATIONS[generation].top : isBottomTemplate(template) ? GENERATIONS[generation].bottom : null;
}
