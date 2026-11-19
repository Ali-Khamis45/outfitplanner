import { InputError, object, validDate } from "./core.ts";

export type EvaluationContext = { date: string; city: string };
export type EvaluationTrace = { name: string; arguments: unknown; ok: boolean };
export function evaluationContext(input: unknown): EvaluationContext {
  const context = object(input, ["date", "city"]);
  if (!validDate(context.date) || typeof context.city !== "string" || !context.city.trim() || context.city.length > 100) throw new InputError("Evaluation requires a valid reference date and city.");
  return { date: context.date, city: context.city.trim() };
}

// Explicit opt-in on the evaluation server only. These are synthetic fixtures,
// never a fallback for failed weather in the normal application or live eval.
export async function evaluationWeather(input: unknown) {
  const args = object(input, ["date", "city"]);
  const context = evaluationContext({ date: args.date, city: args.city ?? "Cairo" });
  return { ...context, temperature_min_c: 18, temperature_max_c: 25, precipitation_probability_percent: 0, wind_max_kmh: 12, condition: "Clear", attribution: "Synthetic evaluation fixture; not a real forecast" };
}
