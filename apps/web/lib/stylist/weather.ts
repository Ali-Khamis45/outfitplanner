import { InputError, object, validDate } from "./core.ts";

type Weather = { city: string; date: string; temperature_min_c: number; temperature_max_c: number; precipitation_probability_percent: number | null; wind_max_kmh: number; condition: string; attribution: string };
function condition(code: number): string {
  if (code === 0) return "Clear"; if (code <= 3) return "Cloudy"; if (code <= 49) return "Fog"; if (code <= 59) return "Drizzle"; if (code <= 69) return "Rain"; if (code <= 79) return "Snow"; if (code <= 82) return "Rain showers"; if (code <= 86) return "Snow showers"; if (code >= 95) return "Thunderstorm"; return "Unknown";
}
export function createWeather(fetcher: typeof fetch = fetch, clock: () => number = Date.now) {
  const cache = new Map<string, { expires: number; value: Weather }>();
  return async (input: unknown): Promise<Weather> => {
    const args = object(input, ["date", "city"]), city = args.city === undefined ? "Cairo" : args.city;
    if (!validDate(args.date) || typeof city !== "string" || city.trim().length < 2 || city.length > 100) throw new InputError("Provide a valid date and city.");
    const date = args.date, name = city.trim(), key = `${name.toLowerCase()}|${date}`, cached = cache.get(key);
    if (cached && cached.expires > clock()) return cached.value;
    const geocode = new URL("https://geocoding-api.open-meteo.com/v1/search"); geocode.search = new URLSearchParams({ name, count: "1", language: "en", format: "json" }).toString();
    const geoResponse = await fetcher(geocode, { signal: AbortSignal.timeout(10000) }); if (!geoResponse.ok) throw new Error("City lookup failed.");
    const geo = await geoResponse.json(), location = geo.results?.[0];
    if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) throw new InputError("City not found.");
    const forecast = new URL("https://api.open-meteo.com/v1/forecast"); forecast.search = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude), start_date: date, end_date: date, timezone: "auto", daily: "temperature_2m_min,temperature_2m_max,precipitation_probability_max,wind_speed_10m_max,weather_code" }).toString();
    const response = await fetcher(forecast, { signal: AbortSignal.timeout(10000) }); if (!response.ok) throw new Error("Weather forecast unavailable for that date or city.");
    const data = await response.json(), d = data.daily, min = d?.temperature_2m_min?.[0], max = d?.temperature_2m_max?.[0], rain = d?.precipitation_probability_max?.[0] ?? null, wind = d?.wind_speed_10m_max?.[0], code = d?.weather_code?.[0];
    if (d?.time?.[0] !== date || ![min, max, wind, code].every(Number.isFinite) || (rain !== null && !Number.isFinite(rain))) throw new Error("Incomplete weather forecast.");
    const value: Weather = { city: typeof location.name === "string" ? location.name : name, date, temperature_min_c: min, temperature_max_c: max, precipitation_probability_percent: rain, wind_max_kmh: wind, condition: condition(code), attribution: "Weather data: Open-Meteo.com (CC BY 4.0); location data: GeoNames" };
    if (cache.size >= 256) cache.delete(cache.keys().next().value!);
    cache.set(key, { value, expires: clock() + 3600000 }); return value;
  };
}
