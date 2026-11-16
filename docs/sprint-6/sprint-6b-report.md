# Sprint 6B: stylist tools

Branch: `sprint-6-stylist-web`, based on `sprint-4-photo-web`. No model or remote service was added to the app.

## Interface

Five JSON POST endpoints at `/api/stylist/{tool}` accept the arguments in `apps/web/lib/stylist/tools.json`. They use the existing socket, host and origin checks and return 404 outside development or for non-local requests. Invalid input returns 400; unavailable local data or weather returns an error rather than invented results. Tool schemas use the `type: function` / `function` convention.

- `get_wardrobe`: combines filters with AND; seasons and occasions match any of the specified values, colour matches exact name or hex ignoring case. `not_worn_days` excludes dates in the last N calendar days (UTC); never-worn items match. Returns compact fields without photo, texture or notes.
- `get_weather`: Open-Meteo geocoding and daily forecast, first geocoding match, Cairo by default. Temperatures are °C, wind is maximum km/h, and precipitation probability is the daily maximum percent (nullable if unavailable). Forecasts are cached in memory per city/date for one hour; this is per process and not persistent. Out-of-range dates or network failures return an error. Results include attribution.
- `get_fit`: maps supported templates and S/M/L/XL to fit JSON; `personal-scaled` resolves the primary personal manifest ID. The selected size's region statuses and recommended size are returned; missing data returns `unknown`.
- `show_on_avatar`: one supported top and one supported bottom, using the existing `/try-on?top=...&bottom=...` format. Optional `rest`, `walk`, or `both-90` pose is applied by the try-on page.
- `log_worn`: accepts item and saved-outfit IDs, validates every ID and date before writing, de-duplicates outfit members and atomically replaces the validated wardrobe JSON. Every call records a wear event; earlier dates do not roll back `last_worn`. Writes from this tool and the wardrobe editor share a process-wide queue. The editor sends the version it loaded, and a stale save gets HTTP 409 instead of overwriting a wear event. Multi-process coordination is not provided; legacy clients that omit If-Match retain unconditional replacement semantics.

Run `node apps/web/tests/stylist-tools.mjs` for an isolated six-item demonstration with deterministic mocked weather and a temporary wardrobe; `--live-weather` requests the real service. The harness never changes the user's wardrobe. Missing generated fit data is shown as `unknown`.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run build`, and full `npm test`: passed.
- `node --no-warnings apps/web/tests/stylist-tools.test.mjs`: passed filters, mocked weather cache/expiry, neutral and personal fit lookup, URL and pose construction, validation, atomic write behavior, and development/local access checks.
- Harness with mock weather: all five calls passed. Development HTTP smoke test returned the expected filtered items and avatar URL.
- Live Open-Meteo harness: network sandbox denied the request; an unsandboxed retry timed out. Live forecast retrieval is therefore unverified in this environment.

## External dependency

[Open-Meteo forecast API](https://open-meteo.com/en/docs) and [geocoding API](https://open-meteo.com/en/docs/geocoding-api), documentation accessed 2026-11-14; no source code is bundled or pinned. Open-Meteo identifies weather data as CC BY 4.0 and geocoding data as based on GeoNames. See [pricing and attribution](https://open-meteo.com/en/pricing); free API use and production/commercial terms should be reviewed before deployment.

## Follow-up

The stylist route accepts either the documented nested filter or flat filter arguments; mixed shapes are rejected. A concurrency test exercises both orderings of a wear event and a versioned editor save. On the user?s machine, the live weather, wardrobe, fit, and avatar tools were also checked successfully.
