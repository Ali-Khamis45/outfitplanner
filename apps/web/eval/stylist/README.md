# Local stylist evaluation

Run from the repository root with Node 24 (the same native TypeScript support used by the web tests):

```powershell
node apps/web/eval/stylist/run.mjs --mock
node apps/web/eval/stylist/run.mjs
```

Both commands run **all 40 scenarios through the real Next `/api/stylist/chat` route** on a server owned by the harness at `127.0.0.1:3100`. Port 3100 must be free. The harness refuses to borrow or stop an existing server and never connects to port 3000. It uses `.next-sprint-6d-eval` and a disposable synthetic wardrobe, not your personal wardrobe. Run sequentially; the shared port prevents overlapping runs. On Windows, the shell must be able to stop its own child process tree.

Normal mode loads `apps/web/.env.local` using Next's environment loader (existing environment variables take precedence). Start your local inference service separately and configure:

```dotenv
STYLIST_BASE_URL=http://localhost:11434/v1
STYLIST_MODEL=qwen3.5:4b
STYLIST_THINKING=off
STYLIST_KEEP_ALIVE=30m
```

Only loopback model endpoints are accepted by the existing chat route. Normal mode uses live Open-Meteo weather for the original 30 scenarios and explicitly synthetic controlled forecasts for the cold/rain/future hard scenarios. Scenario dates are fixed for reproducibility; old dates may fall outside the provider's coverage. Edit the scenarios if you want current forecasts, keeping explicit dates in messages consistent. The report records the scenario-file hash. It scores a correctly targeted weather **call**, independently of whether the provider can serve that date.

Thinking defaults to **off**: every completion request, including the single correction retry, sends `reasoning_effort: "none"`. `STYLIST_THINKING=on` omits that field and uses the local model's default thinking mode. Values are `on` or `off`. Provider reasoning fields are never returned, replayed, displayed or logged. Restart the app after changing its environment. For an A/B evaluation without editing `.env.local`, run sequentially from PowerShell:

```powershell
$env:STYLIST_THINKING = 'off'
node apps/web/eval/stylist/run.mjs
$env:STYLIST_THINKING = 'on'
node apps/web/eval/stylist/run.mjs
Remove-Item Env:STYLIST_THINKING
```

Reports record the chosen mode and latency. In pipeline v2 the model receives no tools: model tool-call validity is N/A, not 100%. Server context-read counts, provider failures and validation retry counts are reported separately. The v1 baseline retains its historical model tool-call validity.

`--mock` uses the existing scripted OpenAI-compatible HTTP mock server plus explicitly labelled synthetic weather. Its oracle reads the expectations to choose valid items. A perfect mock score verifies the harness, **not an LLM**. Real model prompts contain user messages, compact wardrobe data, server date, recent-wear IDs, weather status, application intent policy and the generated schema. Scenario expectations are never sent to the model.

## Scenario and fixture design

`scenarios.json` contains 15 English and 15 Egyptian Arabic messages. Twenty require weather; fifteen ask to avoid recently worn items. The scenarios span casual, sport, office, business, formal, travel and outing occasions. Each specifies required tool calls, top/bottom categories, the allowed formality range and an optional recency exclusion in days.

`fixture.ts` creates 30 synthetic pieces: one top and one bottom at every formality level 1–5, each in never-worn, yesterday-worn and 45-days-ago variants. Every scenario starts with the same metadata, with wear dates relative to its own reference date. IDs stay stable. All templates are supported by the current avatar URL tool; names and formality are synthetic evaluation metadata, not an assertion about garment appearance. No images or body data are loaded.

The harness opts its server into `STYLIST_EVAL=1`. Only in that mode does the chat request accept `context: { date, city }`, freeze `get_wardrobe`'s recency clock, and return `evaluation: { context, trace }`. Each trace entry has `name`, parsed `arguments`, and `ok`. Chat cannot call `log_worn` or `show_on_avatar` in either mode. Ordinary chat rejects evaluation context, returns no traces and uses the actual clock. Explicit UI buttons call the existing action endpoints; wear logging is never automatic. `STYLIST_EVAL_MOCK=1` activates synthetic weather only alongside evaluation mode; neither flag belongs in your normal app environment.

## Scoring and output

| Check | Pass condition |
| --- | --- |
| `response_ok` | HTTP 200, status `ok`, nonempty model reply |
| `evaluation_context` | Returned reference date/city match the scenario |
| `get_wardrobe` | At least one successful wardrobe call |
| `get_weather` | When required, call with the scenario date and city; Egyptian Arabic city aliases accepted |
| `recommended_items_exist` | At least one validated structured recommendation; all its IDs and rendered card IDs exist |
| `top_bottom_categories` | Every look has one top and one bottom, optionally outerwear; structured IDs, card IDs and fitting-room URL slots agree |
| `formality_range` | Every recommended/attempted item is in the occasion's inclusive range |
| `not_worn_recently` | If requested, `last_worn` is null or strictly earlier than reference date minus N days |
| `no_wear_mutation` | No attempt to call `log_worn` |

The exact N-days-ago boundary is excluded, matching `get_wardrobe`. Missing cards, mismatched IDs, incorrect URL slots, unavailable models and missing read traces cannot silently pass. In v2, one rejected draft can be corrected before publication; the retry is reported separately. Legacy v1 scoring still includes all model action attempts. Scoring looks up category, formality and wear dates in the fixture rather than trusting the response's item metadata. Free-text style quality, fashion appropriateness beyond metadata, unstructured item mentions, and meteorological truth in prose are not scored.

Reports are checkpointed after each scenario in the git-ignored `eval/stylist/results/<UTC-timestamp>-<run-id>/`:

- `report.json`: status-only per-check PASS/FAIL/N/A, HTTP/result status, tool validity and execution-failure counts, latency, model/thinking mode, source revision/dirty state, suite and wardrobe hashes, aggregate metrics and failure counts by category. Prompts, model prose, reasoning, tool arguments, photos and personal fit values are excluded. Scoring uses the full synthetic response in memory before discarding it from the report.
- `report.md`: short per-scenario table, overall score, average tool calls and average latency.
- `server.log`: owned Next server diagnostics. Infrastructure failures also create `harness-error.txt` when the report directory exists.

A scenario passes only if all applicable checks pass. Overall score is passed checks divided by applicable checks; N/A checks are excluded. Scenario pass count is reported separately. Average tools and HTTP latency include failed attempts; latency excludes server startup. `completed: false` indicates a partial run. Exit codes: **0** all scenarios pass the new quality checks, **1** one or more quality failures, **2** infrastructure/usage failure, **130** cancellation. A missing model generates 40 FAIL results and zero score, not a simulated reply. If cleanup is denied, the exact owned server PID is reported and its disposable runtime is preserved for diagnosis.

`tests/stylist-eval.test.mjs` exercises the 40 mock cases and negative scoring cases and is included in the full `npm test` suite. To change model instructions or tools for your experiments, change the usual chat implementation, run this harness again, and compare the JSON reports. The UI style is unaffected.

## Pipeline v2

The server reads the wardrobe before inference and requests weather for an explicit place/date or weather request. Date-only requests use the existing default city, Cairo, explicitly identified in the context. Common English/Egyptian Arabic occasions, cities, ISO dates, today/tomorrow/yesterday/weekdays and numeric recency requests are parsed by application policy (`lib/stylist/pipeline.ts`), not by evaluation expectations. Unrecognized occasions use the full 1-5 formality range; this rule-based parser is not an unrestricted natural-language interpreter.

Every request includes `response_format: {type: "json_schema", json_schema: ...}`. Eligible top/bottom/outerwear IDs become per-category enums, formality is the actual minimum saved rating of the selected top and bottom, and language follows the latest user message. The default three-day wear exclusion is inclusive and relative to server today; longer explicit exclusions are honored. A recent item is eligible only if its category has no fresh alternative meeting formality. Explicit exclusions longer than three days are never relaxed. A missing eligible pair produces a clear error without calling the model.

The server re-reads the wardrobe before publication and checks category, ID, formality, wear history, required fields, language script and one/two-sentence reason length. One short validation-error retry is allowed, with an updated ID schema. Invalid drafts and reasoning are never replayed or logged. Language validation checks script, not Egyptian dialect fluency. Outerwear can be recommended/logged, but the existing avatar preview supports the top and bottom only.

Run installed models sequentially without editing local env files:

```powershell
$env:STYLIST_THINKING = 'off'
$env:STYLIST_MODEL = 'qwen3.5:4b'
node apps/web/eval/stylist/run.mjs
$env:STYLIST_MODEL = 'qwen3:4b'
node apps/web/eval/stylist/run.mjs
# Run phi4-mini only if listed by Ollama /api/tags.
Remove-Item Env:STYLIST_MODEL, Env:STYLIST_THINKING
```

Each v2 Markdown report includes the same scenario table and failure categories plus a side-by-side comparison against the recorded qwen3.5:4b v1 baseline. This measures a complete pipeline change: read checks now use server reads and recommendation checks no longer require model-generated action calls. Scenario messages, fixture and nine scoring categories are unchanged. The fixed historical baseline is documented in `../../docs/stylist-qwen-baseline.md`.

Implementation references: [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs), [OpenAI-compatible API](https://docs.ollama.com/api/openai-compatibility). No new runtime dependency was added.

## Follow-up quality evaluation

The unchanged original 30 messages/fixtures are retained as the legacy cohort. `hard-scenarios.json` adds ten cases with formality gaps, all-recent wear, cold/rain with controlled forecasts, mixed Arabic/English, an indirect 30-day wear preference, and future weekdays. Reference date and requested date are distinct. Synthetic forecasts can only be supplied to the evaluation-enabled route; ordinary chat rejects them. Fixture profiles are applied by the harness, never sent as expected answers to the model.

| New check | Policy |
| --- | --- |
| best_available_formality | Highest eligible saved formality per slot within the occasion range, or closest available if the range is unreachable |
| warmth_vs_forecast | Closest attainable warmth: target 4 for max <=15C, 1 for >=28C, otherwise 2; top plus optional outer layer capped at 5, bottom separately; use an available rain shell when probability >=50% |
| gap_note | Disclose an unavoidable formality or recent-wear gap; report actual item formality |
| date_handled | Requested date and future-plan/today-log action match independent scenario expectations |
| reply_language | Declared language and dominant script in reason/notes match expectations |

The new scorer is independent of production intent parsing and eligibility. Best formality and warmth are not enforced by ID enums, so valid published recommendations can fail quality. Missing forecasts produce N/A for warmth. These metadata heuristics do not assess fashion taste, fluent Egyptian dialect, or whether every prose claim is true. The old nine checks remain visible side by side: a correct below-range gap recommendation necessarily fails the old strict formality check.

Reports show first-try server-validation pass rate, first-try quality pass rate, final quality pass rate and retry count separately. The first draft is whitelisted and evaluated in memory; neither drafts nor recommendation prose are written to reports. Warm-up/server startup are outside scenario latency; completion and lease refresh are included.

`qwen3.5:4b` is the default model, thinking defaults off, and `STYLIST_KEEP_ALIVE` defaults to `30m`. Every completion sends `keep_alive`. The installed Ollama compatibility endpoint accepted it but retained a five-minute lease in a direct check, so a native empty `/api/chat` request also refreshes the lease after completions. `/stylist` sends the same native preload through the protected warm-up route. No warm-up content or reasoning is logged. See [Ollama preload and keep_alive](https://docs.ollama.com/faq).

For future dates the explicit action saves an item-based plan through the existing version-checked planner API; it refuses to overwrite an existing day. Today can be logged worn, and past dates offer neither plan nor wear action. Neither recommendation nor plan creation changes wear history.
