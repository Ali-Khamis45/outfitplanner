# Stylist v2.1: intent extraction and enforced candidate rules

Measured 2026-11-19 with qwen3.5:4b, thinking off, keep_alive 30m. Application revision `e2d659f0c4ffc3b1cb43481aaa4dbe0b56adf0ef`, run `2026-11-19T09-52-20-396Z-40114dba`. All 40 requests completed with HTTP 200 on the owned port 3100 server, without source edits during inference.

## Main model metric: intent accuracy

| Field | Correct | First attempt correct |
| --- | --- | --- |
| occasion_type | 36/40 (90.0%) | 36/40 |
| formality_min | 39/40 (97.5%) | 39/40 |
| formality_max | 37/40 (92.5%) | 37/40 |
| date | 36/40 (90.0%) | 36/40 |
| indoor_outdoor | 26/40 (65.0%) | 26/40 |
| language | 39/40 (97.5%) | 39/40 |
| formality_range | 37/40 (92.5%) | 37/40 |

All three primary fields (occasion, range, date) matched in **32/40** scenarios. All six extracted fields matched in **20/40**. Schema-valid mistakes were scored as mistakes, not corrected using labels or the old occasion/date parser.

## Comparison with the 35/40 follow-up

| Metric | v2 follow-up | v2.1 |
| --- | --- | --- |
| Final quality checks | 35/40 (87.5%) | 35/40 (87.5%) |
| Old validity checks | 38/40 | 33/40 |
| First-try quality | 30/40 | 12/40 |
| First-try schema validation | 34/40 | 26/40 |
| Total retries | 6 | 14 |
| Average scenario latency | 5.16 s | 5.23 s |
| Model tool-call validity | N/A | N/A (no model tools) |

The numerical quality totals are not equivalent model measurements. In v2.1, formality and warmth reuse the production filtering policy and are guaranteed relative to the extracted intent. The remaining final-check failures are four dates and one reply language. The main independent metric is intent accuracy. First-try quality now also requires the first intent to match all labels, so it is a stricter measure than the previous choice-only rate. All 14 retries were choice-validation retries; every intent was schema-valid on its first attempt.

## Checks and failure categories

| Check | Passed | Failed | N/A |
| --- | --- | --- | --- |
| best_available_formality | 40 | 0 | 0 |
| warmth_vs_forecast | 24 | 0 | 16 |
| gap_note | 40 | 0 | 0 |
| date_handled | 36 | 4 | 0 |
| reply_language | 39 | 1 | 0 |

Old-check failures: get_weather=3, formality_range=4. The two gap fixtures intentionally fail the old strict range check. Other old failures reflect incorrect extracted intent.

## Per-scenario status

| Scenario | Intent field failures | Old checks | Final quality | Intent / choice attempts | Latency |
| --- | --- | --- | --- | --- | --- |
| en-coffee | None | PASS | PASS | 1 / 2 | 6.46 s |
| ar-coffee-new | date | PASS | FAIL | 1 / 1 | 5.00 s |
| en-office | indoor_outdoor | PASS | PASS | 1 / 2 | 7.05 s |
| ar-office-new | indoor_outdoor | PASS | PASS | 1 / 1 | 4.70 s |
| en-interview | None | PASS | PASS | 1 / 2 | 6.83 s |
| ar-interview-new | indoor_outdoor | PASS | PASS | 1 / 1 | 4.08 s |
| en-seafront | occasion_type, formality_max, formality_range | PASS | PASS | 1 / 2 | 6.95 s |
| ar-seafront-new | occasion_type, formality_min, formality_max, formality_range | FAIL | PASS | 1 / 1 | 4.25 s |
| en-gym | None | PASS | PASS | 1 / 2 | 6.47 s |
| ar-gym | indoor_outdoor | PASS | PASS | 1 / 1 | 4.28 s |
| en-dinner-new | indoor_outdoor | PASS | PASS | 1 / 2 | 7.39 s |
| ar-dinner | indoor_outdoor | PASS | PASS | 1 / 1 | 3.94 s |
| en-wedding | None | PASS | PASS | 1 / 2 | 6.46 s |
| ar-wedding-new | None | PASS | PASS | 1 / 1 | 4.61 s |
| en-travel-new | None | PASS | PASS | 1 / 1 | 5.55 s |
| ar-travel | None | PASS | PASS | 1 / 1 | 4.68 s |
| en-presentation | None | PASS | PASS | 1 / 1 | 5.09 s |
| ar-presentation-new | None | PASS | PASS | 1 / 1 | 4.05 s |
| en-rain-plan | occasion_type, formality_max, indoor_outdoor, formality_range | FAIL | PASS | 1 / 2 | 7.08 s |
| ar-rain-plan-new | occasion_type, indoor_outdoor | PASS | PASS | 1 / 1 | 4.13 s |
| en-weekend-new | None | PASS | PASS | 1 / 2 | 5.84 s |
| ar-weekend | None | PASS | PASS | 1 / 1 | 3.86 s |
| en-client-new | indoor_outdoor | PASS | PASS | 1 / 2 | 6.49 s |
| ar-client | indoor_outdoor | PASS | PASS | 1 / 1 | 3.84 s |
| en-walk-new | None | PASS | PASS | 1 / 2 | 7.22 s |
| ar-walk | None | PASS | PASS | 1 / 1 | 4.06 s |
| en-family | indoor_outdoor, language | PASS | FAIL | 1 / 1 | 4.80 s |
| ar-family-new | None | PASS | PASS | 1 / 1 | 3.89 s |
| en-ceremony-new | indoor_outdoor | PASS | PASS | 1 / 2 | 7.81 s |
| ar-ceremony | None | PASS | PASS | 1 / 1 | 4.09 s |
| hard-gap-en | None | FAIL | PASS | 1 / 1 | 4.36 s |
| hard-gap-ar-tomorrow | indoor_outdoor | FAIL | PASS | 1 / 1 | 4.30 s |
| hard-recent-en | None | PASS | PASS | 1 / 2 | 6.83 s |
| hard-recent-ar | None | PASS | PASS | 1 / 1 | 4.41 s |
| hard-cold-en | indoor_outdoor | PASS | PASS | 1 / 1 | 4.29 s |
| hard-rain-ar | None | PASS | PASS | 1 / 1 | 4.70 s |
| hard-mixed-ar | date | FAIL | FAIL | 1 / 1 | 4.73 s |
| hard-mixed-en | date | FAIL | FAIL | 1 / 1 | 4.02 s |
| hard-while-en | None | PASS | PASS | 1 / 2 | 6.09 s |
| hard-weekday-ar | date | FAIL | FAIL | 1 / 1 | 4.32 s |

## Validation and limits

Typecheck, lint, build and full npm test passed. Tests cover malformed/wrong intent, field accuracy, enum cross-product warmth, rain layers, no in-range formality, unavoidable weather gaps, recent-wear priority, publication revalidation and the full 40-case mock pipeline. The real evaluation exited 1 because intent/quality failures remain; this is not an infrastructure or code-test failure.

All 40 original messages and fixture settings were verified unchanged before inference; only intent labels were added. Labels never enter model prompts. The exposed taxonomy is application policy shared across requests, not scenario-specific answers. The new scenario hashes include labels. Indoor/outdoor is labelled from explicit exposure only; unknown is expected when exposure is unspecified. This convention is stricter than inferring indoor from an office occasion.

The filter keeps highest eligible formality after recency. If no item is in range, it keeps highest available formality and discloses the gap. It chooses an optimal compatible upper-layer warmth group and closest bottom warmth, retaining at least one of each and disclosing an unavoidable mismatch. These metadata rules do not establish fashion taste, dialect fluency or truth of every prose claim. Wrong extracted dates can still produce wrong suggested plan dates; the independent date score exposes that limitation.

Timing includes two model stages, live weather, any retry and native lease refresh, excluding startup/warm-up. The hard weather cases use controlled synthetic forecasts; missing forecasts score N/A. Raw status-only reports remain ignored. No personal data, prompts, model prose, reasoning, item IDs or extracted values are included in this report.

See [v2 follow-up](stylist-v2-quality.md) and [evaluation methodology](../eval/stylist/README.md).
