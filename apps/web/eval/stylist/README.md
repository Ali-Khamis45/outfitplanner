# Local stylist evaluation

Run from the repository root with Node 24 (the same native TypeScript support used by the web tests):

```powershell
node apps/web/eval/stylist/run.mjs --mock
node apps/web/eval/stylist/run.mjs
```

Both commands run **all 30 scenarios through the real Next `/api/stylist/chat` route** on a server owned by the harness at `127.0.0.1:3100`. Port 3100 must be free. The harness refuses to borrow or stop an existing server and never connects to port 3000. It uses `.next-sprint-6d-eval` and a disposable synthetic wardrobe, not your personal wardrobe. Run sequentially; the shared port prevents overlapping runs. On Windows, the shell must be able to stop its own child process tree.

Normal mode loads `apps/web/.env.local` using Next's environment loader (existing environment variables take precedence). Start your local inference service separately and configure:

```dotenv
STYLIST_BASE_URL=http://localhost:11434/v1
STYLIST_MODEL=your-local-model-name
```

Only loopback model endpoints are accepted by the existing chat route. Normal mode uses live Open-Meteo weather. Scenario dates are fixed for reproducibility; old dates may fall outside the provider's coverage. Edit the scenarios if you want current forecasts, keeping explicit dates in messages consistent. The report records the scenario-file hash. It scores a correctly targeted weather **call**, independently of whether the provider can serve that date.

`--mock` uses the existing scripted OpenAI-compatible HTTP mock server plus explicitly labelled synthetic weather. Its oracle reads the expectations to choose valid items. A perfect mock score verifies the harness, **not an LLM**. Real model prompts contain only the user message and date/city context; expectations are never sent to the model.

## Scenario and fixture design

`scenarios.json` contains 15 English and 15 Egyptian Arabic messages. Twenty require weather; fifteen ask to avoid recently worn items. The scenarios span casual, sport, office, business, formal, travel and outing occasions. Each specifies required tool calls, top/bottom categories, the allowed formality range and an optional recency exclusion in days.

`fixture.ts` creates 30 synthetic pieces: one top and one bottom at every formality level 1–5, each in never-worn, yesterday-worn and 45-days-ago variants. Every scenario starts with the same metadata, with wear dates relative to its own reference date. IDs stay stable. All templates are supported by the current avatar URL tool; names and formality are synthetic evaluation metadata, not an assertion about garment appearance. No images or body data are loaded.

The harness opts its server into `STYLIST_EVAL=1`. Only in that mode does the chat request accept `context: { date, city }`, freeze `get_wardrobe`'s recency clock, and return `evaluation: { context, trace }`. Each trace entry has `name`, parsed `arguments`, and `ok`. Evaluation blocks `log_worn` while recording the attempt. Ordinary chat rejects evaluation context, returns no traces, uses the actual clock, and retains normal wear logging. `STYLIST_EVAL_MOCK=1` activates synthetic weather only alongside evaluation mode; neither flag belongs in your normal app environment.

## Scoring and output

| Check | Pass condition |
| --- | --- |
| `response_ok` | HTTP 200, status `ok`, nonempty model reply |
| `evaluation_context` | Returned reference date/city match the scenario |
| `get_wardrobe` | At least one successful wardrobe call |
| `get_weather` | When required, call with the scenario date and city; Egyptian Arabic city aliases accepted |
| `recommended_items_exist` | At least one rendered recommendation; every rendered and attempted `show_on_avatar` item exists |
| `top_bottom_categories` | Every look has exactly one top and one bottom; fitting-room URL slots agree |
| `formality_range` | Every recommended/attempted item is in the occasion's inclusive range |
| `not_worn_recently` | If requested, `last_worn` is null or strictly earlier than reference date minus N days |
| `no_wear_mutation` | No attempt to call `log_worn` |

The exact N-days-ago boundary is excluded, matching `get_wardrobe`. No cards, rejected unknown IDs followed by a valid card, incorrect URL slots, unavailable models and missing traces cannot silently pass. Scoring looks up category, formality and wear dates in the fixture rather than trusting the response's item metadata. Free-text style quality, fashion appropriateness beyond metadata, unstructured item mentions, and meteorological truth in prose are not scored.

Reports are checkpointed after each scenario in the git-ignored `eval/stylist/results/<UTC-timestamp>-<run-id>/`:

- `report.json`: full scenarios, per-check PASS/FAIL/N/A, response and trace evidence, HTTP/result status, tool failures, latency, model name, source revision/dirty state, suite and wardrobe hashes, and aggregate metrics.
- `report.md`: short per-scenario table, overall score, average tool calls and average latency.
- `server.log`: owned Next server diagnostics. Infrastructure failures also create `harness-error.txt` when the report directory exists.

A scenario passes only if all applicable checks pass. Overall score is passed checks divided by applicable checks; N/A checks are excluded. Scenario pass count is reported separately. Average tools and HTTP latency include failed attempts; latency excludes server startup. `completed: false` indicates a partial run. Exit codes: **0** all scenarios pass, **1** one or more scenario failures, **2** infrastructure/usage failure, **130** cancellation. A missing model generates 30 FAIL results and zero score, not a simulated reply. If cleanup is denied, the exact owned server PID is reported and its disposable runtime is preserved for diagnosis.

`tests/stylist-eval.test.mjs` exercises the 30 mock cases and negative scoring cases and is included in the full `npm test` suite. To change model instructions or tools for your experiments, change the usual chat implementation, run this harness again, and compare the JSON reports. The UI style is unaffected.
