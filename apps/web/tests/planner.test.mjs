import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPlannerHandler } from "../lib/planner/api.ts";
import { loadPlanner } from "../lib/planner/storage.ts";
import { parsePlanner } from "../lib/planner/schema.ts";
import { serializeWardrobeWrite, writeWardrobe } from "../lib/wardrobe/storage.ts";
import { exampleWardrobe } from "../lib/wardrobe/schema.ts";
import { logWorn } from "../lib/stylist/core.ts";
import { localDate, shiftDate, weekStart } from "../lib/planner/dates.ts";
import { request } from "./local-api.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "planner-test-"));
const wardrobe = exampleWardrobe(); wardrobe.outfits.push({ id: "look", name: "Look", items: ["example-1", "example-3"], occasion: "casual", worn_on: [] });
const plan = { date: "2026-11-16", outfit_id: "look", item_ids: ["example-1", "example-3"], occasion: "casual", note: "Morning coffee", created_at: "2026-11-16" };
const handler = createPlannerHandler(root, "development");
const put = (body = plan, headers = {}) => request(handler, { method: "PUT", body, headers });
try {
  assert.deepEqual((await request(handler, { method: "GET" })).body, { version: 1, plans: [] });
  assert.equal((await put()).code, 400, "example fallback must not satisfy persisted references");
  await serializeWardrobeWrite(() => writeWardrobe(root, wardrobe));
  for (const options of [
    { remoteAddress: "192.0.2.3" }, { headers: { host: "remote.example" } },
    { headers: { origin: "http://evil.example" } }, { headers: { "x-forwarded-for": "192.0.2.3" } },
    { headers: { "x-forwarded-host": "remote.example" } }, { headers: { forwarded: "for=127.0.0.1" } },
    { headers: { "content-type": "text/plain" } },
  ]) assert.equal((await request(handler, { method: "PUT", body: plan, ...options })).code, 404);
  assert.equal((await request(createPlannerHandler(root, "production"), { method: "GET" })).code, 404);
  for (const invalid of [{ ...plan, date: "2026-02-30" }, { ...plan, created_at: "invalid" }, { ...plan, item_ids: ["missing"] }, { ...plan, outfit_id: "missing" }, { ...plan, item_ids: ["example-1", "example-1"] }, { ...plan, item_ids: ["example-2", "example-3"] }, { ...plan, extra: true }]) assert.equal((await put(invalid)).code, 400);
  assert.throws(() => parsePlanner({ version: 1, plans: [plan, plan] }));
  const first = await put(); assert.equal(first.code, 200);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, "wardrobe/planner.json"), "utf8")), { version: 1, plans: [plan] });
  assert.deepEqual((await request(createPlannerHandler(root, "development"), { method: "GET" })).body, first.body, "survives a new handler");
  const changed = await put({ ...plan, note: "Evening", created_at: "2026-11-17" });
  assert.equal(changed.body.plans.length, 1); assert.equal(changed.body.plans[0].created_at, plan.created_at);
  assert.equal((await put(plan, { "if-match": first.headers["X-Planner-Version"] })).code, 409);
  const writes = await Promise.all([put({ ...plan, date: "2026-11-17" }), put({ ...plan, date: "2026-11-18", outfit_id: null }), logWorn(root, { outfit_or_item_ids: ["look"], date: "2026-11-16" })]);
  assert.equal(writes[0].code, 200); assert.equal(writes[1].code, 200);
  assert.equal((await loadPlanner(root)).plans.length, 3);
  const savedWardrobe = JSON.parse(await readFile(path.join(root, "wardrobe/wardrobe.json"), "utf8")); assert.equal(savedWardrobe.items[0].times_worn, 1);
  // A queued wardrobe deletion must be visible to the subsequent plan validation.
  const deletion = serializeWardrobeWrite(async () => { await new Promise(r => setTimeout(r, 25)); await writeWardrobe(root, { ...wardrobe, items: wardrobe.items.filter(i => i.id !== "example-1") }); });
  const afterDeletion = put({ ...plan, date: "2026-11-19" }); await deletion; assert.equal((await afterDeletion).code, 400);
  assert.equal((await request(handler, { method: "DELETE", body: { date: plan.date } })).code, 200);
  assert.equal((await loadPlanner(root)).plans.length, 2);
  await writeFile(path.join(root, "wardrobe/planner.json"), "broken");
  assert.equal((await request(handler, { method: "GET" })).code, 500, "corruption never silently overwrites plans");
  const escaped = path.join(root, "escaped"), external = path.join(root, "external");
  await mkdir(escaped); await mkdir(external); await symlink(external, path.join(escaped, "wardrobe"), "junction");
  assert.equal((await request(createPlannerHandler(escaped, "development"), { method: "GET" })).code, 500);
  assert.equal(weekStart("2026-11-22"), "2026-11-16"); assert.equal(shiftDate("2026-12-31", 1), "2027-01-01"); assert.match(localDate(), /^\d{4}-\d{2}-\d{2}$/);
  console.log("PASS planner schema, persisted references, one plan/date, restart, concurrency, conflicts, local protections and calendar boundaries");
} finally { await rm(root, { recursive: true, force: true }); }
