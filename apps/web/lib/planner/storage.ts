import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parsePlanner, type Planner } from "./schema.ts";

async function rootDirectory(outputs: string, create = false) {
  if (create) await mkdir(path.join(outputs, "wardrobe"), { recursive: true });
  const output = await realpath(outputs), root = await realpath(path.join(outputs, "wardrobe"));
  if (path.dirname(root) !== output) throw new Error("Planner directory is outside outputs.");
  return root;
}
export async function loadPlanner(outputs: string): Promise<Planner> {
  try {
    const root = await rootDirectory(outputs), file = await realpath(path.join(root, "planner.json"));
    if (path.dirname(file) !== root) throw new Error("Invalid planner location.");
    return parsePlanner(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, plans: [] };
    throw error;
  }
}
export const plannerVersion = (planner: Planner) => `"${createHash("sha256").update(JSON.stringify(planner)).digest("hex")}"`;
// Call inside the SAME serializeWardrobeWrite queue used by wardrobe edits and log_worn.
export async function writePlanner(outputs: string, planner: Planner) {
  const data = parsePlanner(planner), root = await rootDirectory(outputs, true), temp = path.join(root, `.${randomUUID()}.tmp`);
  try {
    await writeFile(temp, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
    await rename(temp, path.join(root, "planner.json"));
  } finally { await rm(temp, { force: true }); }
}
