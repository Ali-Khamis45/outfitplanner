import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import { localRequest } from "../personalFit.ts";
import { avatarUrl, filterWardrobe, getFit, InputError, loadWardrobe, logWorn, object } from "./core.ts";
import { createWeather } from "./weather.ts";

export function createStylistHandler(outputs = path.resolve(process.cwd(), "../../outputs"), environment = process.env.NODE_ENV, weather = createWeather()) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    res.setHeader("Cache-Control", "no-store, private"); res.setHeader("X-Content-Type-Options", "nosniff");
    if (environment !== "development" || !localRequest(req) || req.method !== "POST" || !/^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? "")) return res.status(404).end();
    try {
      const args = object(req.body, req.query.tool === "get_wardrobe" ? ["filter"] : req.query.tool === "get_weather" ? ["date", "city"] : req.query.tool === "get_fit" ? ["item_id", "body"] : req.query.tool === "show_on_avatar" ? ["item_ids", "pose"] : req.query.tool === "log_worn" ? ["outfit_or_item_ids", "date"] : []);
      let result;
      switch (req.query.tool) {
        case "get_wardrobe": result = filterWardrobe(await loadWardrobe(outputs), args.filter); break;
        case "get_weather": result = await weather(args); break;
        case "get_fit": result = await getFit(outputs, await loadWardrobe(outputs), args); break;
        case "show_on_avatar": result = avatarUrl(await loadWardrobe(outputs), args); break;
        case "log_worn": result = await logWorn(outputs, args); break;
        default: return res.status(404).end();
      }
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof InputError) return res.status(400).json({ error: error.message });
      console.error("Stylist tool failed:", error); return res.status(502).json({ error: "Tool could not complete. Check local data or weather availability." });
    }
  };
}
