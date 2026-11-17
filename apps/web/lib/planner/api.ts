import { access } from "node:fs/promises";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import { localRequest } from "../personalFit.ts";
import { localOutputs } from "../localOutputs.ts";
import { InputError, object, validDate } from "../stylist/core.ts";
import { loadWardrobe, serializeWardrobeWrite } from "../wardrobe/storage.ts";
import { parsePlan, validateReferences } from "./schema.ts";
import { loadPlanner, plannerVersion, writePlanner } from "./storage.ts";

export function createPlannerHandler(outputs = localOutputs(), environment = process.env.NODE_ENV) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    res.setHeader("Cache-Control", "no-store, private"); res.setHeader("X-Content-Type-Options", "nosniff");
    if (environment !== "development" || !localRequest(req)) return res.status(404).end();
    if (req.method !== "GET" && (!(req.method === "PUT" || req.method === "DELETE") || !/^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? ""))) return res.status(404).end();
    try {
      const planner = req.method === "GET" ? await loadPlanner(outputs) : await serializeWardrobeWrite(async () => {
        const current = await loadPlanner(outputs);
        if (req.headers["if-match"] && req.headers["if-match"] !== plannerVersion(current)) return null;
        if (req.method === "DELETE") {
          const args = object(req.body, ["date"]);
          if (!validDate(args.date)) throw new InputError("Choose a valid date.");
          current.plans = current.plans.filter(p => p.date !== args.date);
        } else {
          const plan = parsePlan(req.body);
          // loadWardrobe's example fallback is useful in the UI, but references
          // must exist in an actual saved wardrobe before persisting a plan.
          try { await access(path.join(outputs, "wardrobe/wardrobe.json")); } catch { throw new InputError("Save your collection in Wardrobe before assigning a look."); }
          validateReferences(plan, await loadWardrobe(outputs));
          const existing = current.plans.find(p => p.date === plan.date);
          current.plans = [...current.plans.filter(p => p.date !== plan.date), { ...plan, created_at: existing?.created_at ?? plan.created_at }].sort((a, b) => a.date.localeCompare(b.date));
        }
        await writePlanner(outputs, current);
        return current;
      });
      if (!planner) return res.status(409).json({ error: "Planner changed. Reload before saving your changes." });
      res.setHeader("X-Planner-Version", plannerVersion(planner));
      return res.status(200).json(planner);
    } catch (error) {
      if (error instanceof InputError) return res.status(400).json({ error: error.message });
      return res.status(500).json({ error: "Could not access the local planner." });
    }
  };
}
