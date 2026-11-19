import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { SIZES, type Size } from "./fitMap.ts";

/** A size the generator withheld because it failed its deformation gates (Sprint 3.6). It is listed next to the shipped
 *  sizes so the size picker can show it as not ready; its files are never served. */
export interface WithheldSize { size: Size; withheld: true }

/**
 * Sizes of `garment` on `body` that services/garments/generate_sizes.py moved to `<sizes dir>-withheld/`: each has a
 * `<garment>-<size>-<body>.withheld.json` note. `sizesRoot` is the real path of the shipped sizes folder and `shipped`
 * its file names; a size that is also shipped is not withheld. Only notes directly inside the sibling withheld folder
 * count, and a missing folder means nothing is withheld.
 */
export async function withheldSizes(sizesRoot: string, garment: string, body: string, shipped: readonly string[]): Promise<WithheldSize[]> {
  let root: string;
  try { root = await realpath(/*turbopackIgnore: true*/ path.join(path.dirname(sizesRoot), `${path.basename(sizesRoot)}-withheld`)); } catch { return []; }
  if (path.dirname(root) !== path.dirname(sizesRoot)) return [];
  const withheld: WithheldSize[] = [];
  for (const size of SIZES) {
    const name = `${garment}-${size}-${body}`;
    if (shipped.includes(`${name}.glb`)) continue;
    try {
      const note = await realpath(path.join(root, `${name}.withheld.json`));
      if (path.dirname(note) !== root) continue;
      const value = JSON.parse(await readFile(note, "utf8"));
      if (value?.version === 1 && value.size === name) withheld.push({ size, withheld: true });
    } catch { continue; }
  }
  return withheld;
}
