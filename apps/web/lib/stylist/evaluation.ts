import { InputError, object, validDate } from "./core.ts";
import type { Weather } from "./weather.ts";

export type EvaluationContext = { date: string; city: string; forecast?: Omit<Weather, "attribution"> };
export type EvaluationTrace = { name: string; arguments: unknown; ok: boolean };
export function evaluationContext(input: unknown): EvaluationContext {
  const context = object(input, ["date", "city", "forecast"]);
  if (!validDate(context.date) || typeof context.city !== "string" || !context.city.trim() || context.city.length > 100) throw new InputError("Evaluation requires a valid reference date and city.");
  let forecast: EvaluationContext["forecast"];
  if (context.forecast !== undefined) {
    const f = object(context.forecast, ["date", "city", "temperature_min_c", "temperature_max_c", "precipitation_probability_percent", "wind_max_kmh", "condition"]);
    if (!validDate(f.date) || f.city !== context.city || typeof f.condition !== "string" || f.condition.length > 50
      || ![f.temperature_min_c, f.temperature_max_c, f.precipitation_probability_percent, f.wind_max_kmh].every(n => typeof n === "number" && Number.isFinite(n))
      || Number(f.temperature_min_c) > Number(f.temperature_max_c) || Number(f.precipitation_probability_percent) < 0 || Number(f.precipitation_probability_percent) > 100) throw new InputError("Invalid synthetic evaluation forecast.");
    forecast = f as EvaluationContext["forecast"];
  }
  return { date: context.date, city: context.city.trim(), ...(forecast ? { forecast } : {}) };
}

// Explicit opt-in on the evaluation server only. These are synthetic fixtures,
// never a fallback for failed weather in the normal application or live eval.
export async function evaluationWeather(input: unknown) {
  const args = object(input, ["date", "city"]);
  const context = evaluationContext({ date: args.date, city: args.city ?? "Cairo" });
  return { ...context, temperature_min_c: 18, temperature_max_c: 25, precipitation_probability_percent: 0, wind_max_kmh: 12, condition: "Clear", attribution: "Synthetic evaluation fixture; not a real forecast" };
}
