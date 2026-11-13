export const CATEGORIES = ["top", "bottom", "outerwear", "shoes", "accessory"] as const;
export const PATTERNS = ["solid", "striped", "checked", "graphic", "printed", "other"] as const;
export type Category = typeof CATEGORIES[number];
export type Pattern = typeof PATTERNS[number];
export type WardrobeItem = { id: string; name: string; category: Category; type: string; template: string | null; colors: { name: string; hex: string; share: number }[]; pattern: Pattern; material: string; formality: number; warmth: number; seasons: string[]; occasions: string[]; size: string; photo: string; added_at: string; last_worn: string | null; times_worn: number; favorite: boolean; notes: string };
export type Outfit = { id: string; name: string; items: string[]; occasion: string; worn_on: string[] };
export type Wardrobe = { version: 1; items: WardrobeItem[]; outfits: Outfit[] };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length <= 1000;
const id = (v: unknown): v is string => text(v) && /^[a-zA-Z0-9_-]{1,80}$/.test(v);
const templateId = (v: unknown): v is string => text(v) && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(v);
const date = (v: unknown): v is string => text(v) && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).length === expected.length && expected.every(key => Object.hasOwn(v, key));
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 100 && v.every(text);
const itemKeys = ["id", "name", "category", "type", "template", "colors", "pattern", "material", "formality", "warmth", "seasons", "occasions", "size", "photo", "added_at", "last_worn", "times_worn", "favorite", "notes"];
export function parseWardrobe(value: unknown): Wardrobe {
  if (!record(value) || !keys(value, ["version", "items", "outfits"]) || value.version !== 1 || !Array.isArray(value.items) || !Array.isArray(value.outfits) || value.items.length > 1000 || value.outfits.length > 1000) throw new Error("Invalid wardrobe document.");
  const ids = new Set<string>();
  for (const item of value.items) {
    if (!record(item) || !keys(item, itemKeys) || !id(item.id) || ids.has(item.id) || !text(item.name) || !item.name.trim() || !CATEGORIES.includes(item.category as Category) || !text(item.type) || !item.type.trim() || !(item.template === null || templateId(item.template)) || !Array.isArray(item.colors) || item.colors.length < 1 || item.colors.length > 10 || !item.colors.every(c => record(c) && keys(c, ["name", "hex", "share"]) && text(c.name) && !!c.name.trim() && text(c.hex) && /^#[0-9a-fA-F]{6}$/.test(c.hex) && typeof c.share === "number" && Number.isFinite(c.share) && c.share >= 0 && c.share <= 1) || !PATTERNS.includes(item.pattern as Pattern) || !text(item.material) || !Number.isInteger(item.formality) || Number(item.formality) < 1 || Number(item.formality) > 5 || !Number.isInteger(item.warmth) || Number(item.warmth) < 1 || Number(item.warmth) > 5 || !strings(item.seasons) || !strings(item.occasions) || !text(item.size) || !text(item.photo) || !(item.photo === "" || /^outputs\/wardrobe\/photos\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(item.photo)) || !date(item.added_at) || !(item.last_worn === null || date(item.last_worn)) || !Number.isSafeInteger(item.times_worn) || Number(item.times_worn) < 0 || typeof item.favorite !== "boolean" || !text(item.notes)) throw new Error("Invalid wardrobe item.");
    ids.add(item.id);
  }
  const outfitIds = new Set<string>();
  for (const outfit of value.outfits) {
    if (!record(outfit) || !keys(outfit, ["id", "name", "items", "occasion", "worn_on"]) || !id(outfit.id) || outfitIds.has(outfit.id) || !text(outfit.name) || !outfit.name.trim() || !Array.isArray(outfit.items) || outfit.items.length > 100 || !outfit.items.every(id) || !text(outfit.occasion) || !Array.isArray(outfit.worn_on) || outfit.worn_on.length > 10000 || !outfit.worn_on.every(date)) throw new Error("Invalid outfit.");
    outfitIds.add(outfit.id);
  }
  return value as Wardrobe;
}
export function exampleWardrobe(): Wardrobe {
  const examples: [string, Category, string, string | null, string, string, string, number, number, string[], string[]][] = [
    ["Navy everyday tee", "top", "t-shirt", "tshirt-v5.2", "navy", "#1F2A44", "cotton", 2, 1, ["spring", "summer"], ["casual", "work"]],
    ["Chalk cotton tee", "top", "t-shirt", "tshirt-v5.2", "chalk", "#e7e2d6", "cotton", 2, 1, ["spring", "summer"], ["casual"]],
    ["Moss straight pants", "bottom", "trousers", "pants-v2", "moss", "#777f69", "cotton", 3, 3, ["spring", "autumn"], ["casual", "work"]],
    ["Ink everyday pants", "bottom", "trousers", "pants-v2", "ink", "#303338", "cotton", 3, 2, ["spring", "summer", "autumn"], ["casual", "work"]],
    ["Sand overshirt", "outerwear", "overshirt", null, "sand", "#c3ae92", "linen", 3, 3, ["spring", "autumn"], ["casual"]],
    ["Brown leather shoes", "shoes", "shoes", null, "brown", "#6c4b38", "leather", 4, 2, ["autumn", "winter"], ["work"]],
  ];
  return { version: 1, items: examples.map(([name, category, type, template, color, hex, material, formality, warmth, seasons, occasions], i) => ({ id: `example-${i + 1}`, name, category, type, template, colors: [{ name: color, hex, share: 1 }], pattern: "solid", material, formality, warmth, seasons, occasions, size: "M", photo: "", added_at: "2026-11-13", last_worn: null, times_worn: 0, favorite: false, notes: "" })), outfits: [] };
}
