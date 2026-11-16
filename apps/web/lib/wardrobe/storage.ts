import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { exampleWardrobe, parseWardrobe, type Wardrobe } from "./schema.ts";

// Routes can be bundled separately by Next, so keep the queue on the shared process global.
const queueKey = Symbol.for("virtual-wardrobe.wardrobe-write-queue");
type QueueGlobal = typeof globalThis & { [queueKey]?: Promise<unknown> };
export function serializeWardrobeWrite<T>(work: () => Promise<T>): Promise<T> {
  const shared = globalThis as QueueGlobal;
  const job = (shared[queueKey] ?? Promise.resolve()).then(work);
  shared[queueKey] = job.catch(() => {});
  return job;
}
export function wardrobeVersion(wardrobe: Wardrobe): string {
  return `"${createHash("sha256").update(JSON.stringify(wardrobe)).digest("hex")}"`;
}
async function rootDirectory(outputs: string, create = false) {
  if (create) await mkdir(path.join(outputs, "wardrobe"), { recursive: true });
  const output = await realpath(outputs), root = await realpath(path.join(outputs, "wardrobe"));
  if (path.dirname(root) !== output) throw new Error("Wardrobe directory is outside outputs.");
  return root;
}
export async function loadWardrobe(outputs: string): Promise<Wardrobe> {
  try { const root = await rootDirectory(outputs), file = await realpath(path.join(root, "wardrobe.json")); if (path.dirname(file) !== root) throw new Error("Invalid wardrobe location."); return parseWardrobe(JSON.parse(await readFile(file, "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return exampleWardrobe(); throw error; }
}
// Call only within serializeWardrobeWrite; readers never see a partially written file.
export async function writeWardrobe(outputs: string, data: Wardrobe): Promise<void> {
  const wardrobe = parseWardrobe(data), root = await rootDirectory(outputs, true), temp = path.join(root, `.${randomUUID()}.tmp`);
  try { await writeFile(temp, `${JSON.stringify(wardrobe, null, 2)}\n`, { flag: "wx" }); await rename(temp, path.join(root, "wardrobe.json")); } finally { await rm(temp, { force: true }); }
}
