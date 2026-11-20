# Stylist v2 follow-up: quality evaluation

Measured 2026-11-19 on `sprint-6e-stylist-pipeline`, application revision `da4b511775d690ead61f65cf49def324336902bb`. Run `2026-11-19T09-23-50-040Z-102f1aac` completed all 40 scenarios on the owned port 3100 server with no source edits during inference.

Only **qwen3.5:4b** was evaluated. It remains the default model. Thinking was off (`reasoning_effort: none`); `STYLIST_KEEP_ALIVE=30m`. Model tool calls are disabled; tool-call validity is **N/A**, with zero model tool calls. All 40 HTTP responses succeeded, with no connection reset or final server-validation failure.

## Old and new checks side by side

| Metric | Prior v2 (30) | Follow-up original 30 | New hard 10 | Combined 40 |
| --- | --- | --- | --- | --- |
| Old validity checks: scenarios passed | 30/30 | 30/30 | 8/10 | 38/40 |
| New quality: scenarios passed | Not measured | 29/30 (96.7%) | 6/10 (60.0%) | 35/40 (87.5%) |
| First-try quality | Not measured | 24/30 | 6/10 | 30/40 (75.0%) |
| First-try server validation | 30/30 | 24/30 | 10/10 | 34/40 (85.0%) |
| Validation retries | 0 | 6 | 0 | 6 |
| Average scenario latency | 4.65 s | 5.51 s | 4.10 s | 5.16 s |

The two old-check failures are the intentional wardrobe-gap cases: neither wardrobe reaches the target formality. Both correctly passed the new closest-available/gap checks. The original 30 messages and wardrobe hashes are unchanged; their old checks still pass 245/245. Historical responses were not retained, so the new quality checks cannot be applied retroactively to the prior run. See [previous model comparison](stylist-v2-comparison.md).

## Quality failures

| Category | Passed | Failed | N/A |
| --- | --- | --- | --- |
| best_available_formality | 36 | 4 | 0 |
| warmth_vs_forecast | 23 | 2 | 15 |
| gap_note | 40 | 0 | 0 |
| date_handled | 40 | 0 | 0 |
| reply_language | 40 | 0 | 0 |

Counts overlap: five scenarios fail at least one quality check. Best-available formality and forecast warmth are evaluation checks, not guaranteed by the ID enums or publication validator. These remaining failures are reported rather than hidden by the previous 30/30 validity result.

| Scenario | Quality failures |
| --- | --- |
| en-family | best_available_formality |
| hard-recent-en | best_available_formality |
| hard-cold-en | best_available_formality, warmth_vs_forecast |
| hard-rain-ar | warmth_vs_forecast |
| hard-while-en | best_available_formality |

## Per-scenario status and latency

| Scenario | Old checks | New quality | First-try quality | Retries | Latency |
| --- | --- | --- | --- | --- | --- |
| en-coffee | PASS | PASS | PASS | 0 | 3.90 s |
| ar-coffee-new | PASS | PASS | PASS | 0 | 3.76 s |
| en-office | PASS | PASS | FAIL | 1 | 8.11 s |
| ar-office-new | PASS | PASS | PASS | 0 | 4.28 s |
| en-interview | PASS | PASS | PASS | 0 | 3.65 s |
| ar-interview-new | PASS | PASS | PASS | 0 | 4.05 s |
| en-seafront | PASS | PASS | FAIL | 1 | 8.58 s |
| ar-seafront-new | PASS | PASS | PASS | 0 | 4.24 s |
| en-gym | PASS | PASS | FAIL | 1 | 6.54 s |
| ar-gym | PASS | PASS | PASS | 0 | 3.73 s |
| en-dinner-new | PASS | PASS | PASS | 0 | 4.69 s |
| ar-dinner | PASS | PASS | PASS | 0 | 4.29 s |
| en-wedding | PASS | PASS | PASS | 0 | 3.73 s |
| ar-wedding-new | PASS | PASS | PASS | 0 | 3.95 s |
| en-travel-new | PASS | PASS | PASS | 0 | 5.32 s |
| ar-travel | PASS | PASS | PASS | 0 | 6.84 s |
| en-presentation | PASS | PASS | PASS | 0 | 7.15 s |
| ar-presentation-new | PASS | PASS | PASS | 0 | 7.01 s |
| en-rain-plan | PASS | PASS | PASS | 0 | 14.40 s |
| ar-rain-plan-new | PASS | PASS | PASS | 0 | 4.93 s |
| en-weekend-new | PASS | PASS | PASS | 0 | 3.74 s |
| ar-weekend | PASS | PASS | PASS | 0 | 3.92 s |
| en-client-new | PASS | PASS | PASS | 0 | 5.10 s |
| ar-client | PASS | PASS | PASS | 0 | 4.42 s |
| en-walk-new | PASS | PASS | FAIL | 1 | 7.67 s |
| ar-walk | PASS | PASS | PASS | 0 | 3.88 s |
| en-family | PASS | FAIL | FAIL | 1 | 7.89 s |
| ar-family-new | PASS | PASS | PASS | 0 | 3.93 s |
| en-ceremony-new | PASS | PASS | FAIL | 1 | 7.52 s |
| ar-ceremony | PASS | PASS | PASS | 0 | 4.13 s |
| hard-gap-en | FAIL | PASS | PASS | 0 | 3.27 s |
| hard-gap-ar-tomorrow | FAIL | PASS | PASS | 0 | 4.19 s |
| hard-recent-en | PASS | FAIL | FAIL | 0 | 5.87 s |
| hard-recent-ar | PASS | PASS | PASS | 0 | 4.15 s |
| hard-cold-en | PASS | FAIL | FAIL | 0 | 4.01 s |
| hard-rain-ar | PASS | FAIL | FAIL | 0 | 4.19 s |
| hard-mixed-ar | PASS | PASS | PASS | 0 | 4.02 s |
| hard-mixed-en | PASS | PASS | PASS | 0 | 3.88 s |
| hard-while-en | PASS | FAIL | FAIL | 0 | 3.38 s |
| hard-weekday-ar | PASS | PASS | PASS | 0 | 4.04 s |

## Verification and measurement limits

- Typecheck, lint, production build and full `npm test` passed. The full suite includes all 40 mock pipeline/scoring cases; mock success verifies plumbing only.
- The mobile browser regression passed pending/error/retry behavior, Enter/Shift+Enter, automatic text direction, explicit-only wear actions and the future planner action. Planner persistence/version-conflict tests also passed.
- Warm-up returned HTTP 200. Ollama `/api/ps` reported a 30-minute remaining lease after the native refresh. The compatibility endpoint alone accepted `keep_alive` but retained five minutes, so the native refresh is necessary on this installation.
- Harness warm-up took 0.128 s, excluded from scenario latency. Latency includes wardrobe/weather reads, model completion, correction retries and the native lease refresh. Live weather/provider and cache differences make this a pipeline timing measurement, not a controlled inference benchmark.
- The original cohort uses live weather; the hard cold/rain/future cases use explicitly synthetic forecasts. Missing forecasts are N/A for warmth. The independent quality policy uses wardrobe metadata and script checks; it does not judge fashion taste, fluent Egyptian dialect or the truth of every prose claim.
- The quality harness intentionally exited 1 because five scenarios failed quality; this is a measured model result, not a failed code test or infrastructure failure.
- Raw status-only reports remain in the ignored evaluation results directory. No prompts, model prose, reasoning, tool arguments, photos, measurements or personal wardrobe data are included here.

Legacy scenario SHA-256: `d4bd1b704715fc50997d85cc3ce54e082e7f4f33734b896bc796647e8b312090`. Combined suite SHA-256: `604b9144d8524e45b58217b60a5bbf981a7cc53dd09a7ff52617c2e0e2f7b190`.

Implementation and scoring policy: [evaluation README](../eval/stylist/README.md). No push or merge; Redesign Phase 3 has not started.
