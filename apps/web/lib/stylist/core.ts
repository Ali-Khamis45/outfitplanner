import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { CATEGORIES, SEASONS, type Wardrobe, type WardrobeItem } from "../wardrobe/schema.ts";
import { parseFitMap, SIZES, type FitMap } from "../garment/fitMap.ts";
import { loadWardrobe, serializeWardrobeWrite, writeWardrobe } from "../wardrobe/storage.ts";
export { loadWardrobe } from "../wardrobe/storage.ts";

export class InputError extends Error {}
export const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function object(v: unknown, allowed: string[]): Record<string, unknown> {
  if (!record(v) || Object.keys(v).some(k => !allowed.includes(k))) throw new InputError("Invalid parameters.");
  return v;
}
export function validDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const date = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === v;
}
const idValid = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(v);
const phrase = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 100;
const lower = (s: string) => s.trim().toLowerCase();
export function filterWardrobe(wardrobe: Wardrobe, input: unknown, now = Date.now()) {
  const f = object(input ?? {}, ["category", "seasons", "occasions", "formality_min", "formality_max", "warmth_min", "warmth_max", "colour", "not_worn_days"]);
  if (f.category !== undefined && !CATEGORIES.includes(f.category as typeof CATEGORIES[number])) throw new InputError("Invalid category.");
  for (const key of ["seasons", "occasions"]) if (f[key] !== undefined && (!Array.isArray(f[key]) || !(f[key] as unknown[]).length || (f[key] as unknown[]).length > 20 || !(f[key] as unknown[]).every(phrase))) throw new InputError(`Invalid ${key}.`);
  if (Array.isArray(f.seasons) && !f.seasons.every(s => SEASONS.includes(s as typeof SEASONS[number]))) throw new InputError("Invalid seasons.");
  for (const key of ["formality_min", "formality_max", "warmth_min", "warmth_max"]) if (f[key] !== undefined && (!Number.isInteger(f[key]) || Number(f[key]) < 1 || Number(f[key]) > 5)) throw new InputError(`Invalid ${key}.`);
  if (Number(f.formality_min ?? 1) > Number(f.formality_max ?? 5) || Number(f.warmth_min ?? 1) > Number(f.warmth_max ?? 5)) throw new InputError("Invalid range.");
  if (f.colour !== undefined && !phrase(f.colour)) throw new InputError("Invalid colour.");
  if (f.not_worn_days !== undefined && (!Number.isInteger(f.not_worn_days) || Number(f.not_worn_days) < 0 || Number(f.not_worn_days) > 36500)) throw new InputError("Invalid not_worn_days.");
  const today = new Date(now).toISOString().slice(0, 10), cutoff = Date.parse(`${today}T00:00:00Z`) - Number(f.not_worn_days ?? 0) * 86400000;
  const matches = (values: string[], selected: unknown) => !Array.isArray(selected) || selected.some(s => values.some(v => lower(v) === lower(s)));
  return wardrobe.items.filter(item => (!f.category || item.category === f.category) && matches(item.seasons, f.seasons) && matches(item.occasions, f.occasions) && item.formality >= Number(f.formality_min ?? 1) && item.formality <= Number(f.formality_max ?? 5) && item.warmth >= Number(f.warmth_min ?? 1) && item.warmth <= Number(f.warmth_max ?? 5) && (!f.colour || item.colors.some(c => lower(c.name) === lower(f.colour as string) || lower(c.hex) === lower(f.colour as string))) && (f.not_worn_days === undefined || item.last_worn === null || Date.parse(`${item.last_worn}T00:00:00Z`) < cutoff))
    .map(({ id, name, category, type, colors, pattern, formality, warmth, seasons, occasions, size, last_worn, times_worn }) => ({ id, name, category, type, colours: colors.map(({ name, hex }) => ({ name, hex })), pattern, formality, warmth, seasons, occasions, size, last_worn, times_worn }));
}
export function logWorn(outputs: string, input: unknown): Promise<{ updated: string[]; date: string }> {
  return serializeWardrobeWrite(async () => {
    const args = object(input, ["outfit_or_item_ids", "date"]), ids = args.outfit_or_item_ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 100 || !ids.every(idValid) || new Set(ids).size !== ids.length || !validDate(args.date)) throw new InputError("Provide unique item or outfit IDs and a valid date.");
    const date = args.date, wardrobe = await loadWardrobe(outputs), targets = new Set<string>();
    for (const id of ids) {
      const item = wardrobe.items.find(i => i.id === id), outfit = wardrobe.outfits.find(o => o.id === id);
      if ((!item && !outfit) || (item && outfit)) throw new InputError(`Unknown or ambiguous ID: ${id}`);
      if (item) targets.add(item.id);
      if (outfit) { if (!outfit.items.length) throw new InputError("Outfit has no items."); for (const itemId of outfit.items) { if (!wardrobe.items.some(i => i.id === itemId)) throw new InputError("Outfit has a missing item."); targets.add(itemId); } }
    }
    for (const item of wardrobe.items) if (targets.has(item.id)) { item.last_worn = item.last_worn && item.last_worn > date ? item.last_worn : date; item.times_worn += 1; }
    await writeWardrobe(outputs, wardrobe);
    return { updated: [...targets], date };
  });
}
export function avatarUrl(wardrobe: Wardrobe, input: unknown) {
  const args = object(input, ["item_ids", "pose"]), ids = args.item_ids;
  if (!Array.isArray(ids) || ids.length !== 2 || !ids.every(idValid) || new Set(ids).size !== ids.length) throw new InputError("Choose one top and one bottom.");
  if (args.pose !== undefined && !["rest", "walk", "both-90"].includes(args.pose as string)) throw new InputError("Invalid pose.");
  const items = ids.map(id => wardrobe.items.find(item => item.id === id));
  if (items.some(item => !item)) throw new InputError("Unknown item.");
  const top = items.find(i => i?.category === "top"), bottom = items.find(i => i?.category === "bottom");
  if (!top || !bottom || top.template !== "tshirt-v5.2" || !["pants-v2", "pants-basic-v2"].includes(bottom.template ?? "")) throw new InputError("Choose a supported top and bottom.");
  const params = new URLSearchParams({ top: top.id, bottom: bottom.id }); if (args.pose) params.set("pose", args.pose as string);
  return { url: `/try-on?${params}` };
}
export async function getFit(outputs: string, wardrobe: Wardrobe, input: unknown) {
  const args = object(input, ["item_id", "body"]);
  if (!idValid(args.item_id) || (args.body !== "neutral" && args.body !== "personal-scaled")) throw new InputError("Invalid item_id or body.");
  const item: WardrobeItem | undefined = wardrobe.items.find(i => i.id === args.item_id);
  if (!item) throw new InputError("Unknown item.");
  const garment = item.template === "pants-basic-v2" ? "pants-v2" : item.template, size = item.size.toUpperCase().trim();
  if (!garment || !["tshirt-v5.2", "pants-v2"].includes(garment) || !SIZES.includes(size as typeof SIZES[number])) return { status: "unknown" };
  try {
    const outputRoot = await realpath(outputs), garments = await realpath(path.join(outputRoot, "garments"));
    if (path.dirname(garments) !== outputRoot) throw new Error("Invalid garments location.");
    const root = await realpath(path.join(garments, "sizes"));
    if (path.dirname(root) !== garments) throw new Error("Invalid sizes location.");
    let body = args.body;
    if (body === "personal-scaled") {
      const personal = await realpath(path.join(garments, "personal"));
      if (path.dirname(personal) !== garments) throw new Error("Invalid personal location.");
      const manifestFile = await realpath(path.join(personal, "manifest.json"));
      if (path.dirname(manifestFile) !== personal) throw new Error("Invalid manifest location.");
      const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
      if (!idValid(manifest?.primary?.id) || manifest.primary.id === "neutral") return { status: "unknown" };
      body = manifest.primary.id;
    }
    const fits: FitMap[] = [];
    for (const candidate of SIZES) {
      try { const file = await realpath(path.join(root, `${garment}-${candidate}-${body}.fit.json`)); if (path.dirname(file) !== root) continue; const fit = parseFitMap(JSON.parse(await readFile(file, "utf8"))); if (fit.garment === garment && fit.body === body && fit.size === candidate) fits.push(fit); } catch { /* Missing or invalid sizes are unavailable. */ }
    }
    const fit = fits.find(f => f.size === size); if (!fit) return { status: "unknown" };
    return { status: "available", size: fit.size, body: fit.body, regions: fit.regions, recommended_size: fits.find(f => f.recommended)?.size ?? null };
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "unknown" }; throw error; }
}
