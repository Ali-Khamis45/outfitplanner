import { localOutputs } from "../localOutputs.ts";
import type { NextApiRequest, NextApiResponse } from "next";
import { localRequest } from "../personalFit.ts";
import { avatarUrl, filterWardrobe, getFit, InputError, loadWardrobe, logWorn, object } from "./core.ts";
import { createWeather } from "./weather.ts";

export function createToolExecutor(outputs = localOutputs(), weather = createWeather()) {
  return async (tool: string, input: unknown) => {
    const args = object(input, tool === "get_wardrobe" ? ["filter", "category", "seasons", "occasions", "formality_min", "formality_max", "warmth_min", "warmth_max", "colour", "not_worn_days"] : tool === "get_weather" ? ["date", "city"] : tool === "get_fit" ? ["item_id", "body"] : tool === "show_on_avatar" ? ["item_ids", "pose"] : tool === "log_worn" ? ["outfit_or_item_ids", "date"] : []);
    switch (tool) {
      case "get_wardrobe": {
        const { filter, ...flat } = args;
        if (filter !== undefined && Object.keys(flat).length) throw new InputError("Use either a nested filter or flat parameters, not both.");
        return filterWardrobe(await loadWardrobe(outputs), filter === undefined ? flat : filter);
      }
      case "get_weather": return weather(args);
      case "get_fit": return getFit(outputs, await loadWardrobe(outputs), args);
      case "show_on_avatar": return avatarUrl(await loadWardrobe(outputs), args);
      case "log_worn": return logWorn(outputs, args);
      default: throw new InputError("Unknown tool.");
    }
  };
}

export function createStylistHandler(outputs = localOutputs(), environment = process.env.NODE_ENV, weather = createWeather()) {
  const execute = createToolExecutor(outputs, weather);
  return async (req: NextApiRequest, res: NextApiResponse) => {
    res.setHeader("Cache-Control", "no-store, private"); res.setHeader("X-Content-Type-Options", "nosniff");
    if (environment !== "development" || !localRequest(req) || req.method !== "POST" || !/^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? "")) return res.status(404).end();
    try {
      if (typeof req.query.tool !== "string" || !["get_wardrobe", "get_weather", "get_fit", "show_on_avatar", "log_worn"].includes(req.query.tool)) return res.status(404).end();
      const result = await execute(req.query.tool, req.body);
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof InputError) return res.status(400).json({ error: error.message });
      console.error("Stylist tool failed:", error); return res.status(502).json({ error: "Tool could not complete. Check local data or weather availability." });
    }
  };
}
