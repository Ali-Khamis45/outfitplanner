# Stylist v2: local model comparison

Measured 2026-11-19 on `sprint-6e-stylist-pipeline`, application revision `483c806b026c63428edc014b26582d846b5ad00b`. All three requested models were installed by evaluation time and were tested. No model was skipped.

Every run completed the same 30 synthetic scenarios (15 English, 15 Egyptian Arabic), with the unchanged scenario-file hash and fixture. Thinking was off (`reasoning_effort: "none"`) on every request, including retries. Each run owned a development server on port 3100. No application source edits occurred during inference.

| Metric | qwen3.5:4b v1 baseline | qwen3.5:4b v2 | qwen3:4b v2 | phi4-mini:latest v2 |
| --- | --- | --- | --- | --- |
| Scenario pass rate | 1/30 (3.3%) | 30/30 (100.0%) | 25/30 (83.3%) | 25/30 (83.3%) |
| Applicable checks passed | 129/245 (52.7%) | 245/245 (100.0%) | 223/245 (91.0%) | 225/245 (91.8%) |
| Average latency per scenario | 6.30 s | 4.65 s | 7.26 s | 5.18 s |
| Model tool-call validity | 55/82 (67.1%) | N/A: no model tools | N/A: no model tools | N/A: no model tools |
| Scenarios using validation retry | Not applicable | 0 | 8 | 6 |
| Context/tool execution failures | 30 | 3 | 7 | 3 |

All v2 requests returned HTTP 200. Failed scenarios returned `status: error` after the single correction retry, with no recommendation card; they were not connection resets. The baseline execution-failure count includes model tool failures, whereas v2 has server wardrobe/weather reads only, so that row is diagnostic rather than a like-for-like model-quality measure.

Latency includes context reads, local model loading/inference and any retry, but excludes Next server startup. Runs were sequential and used live Open-Meteo; cold model loading, cache state and provider delays vary. Weather lookup correctness is scored independently from provider availability. Do not treat these averages as a controlled inference-speed benchmark.

## Failure categories

Counts overlap: a rejected final answer has no recommendation, which also fails item/category/formality checks. These are scoring categories, not claims that schema-constrained models invented IDs.

| Scoring check | v1 baseline | qwen3.5:4b v2 | qwen3:4b v2 | phi4-mini v2 |
| --- | --- | --- | --- | --- |
| response_ok | 0 | 0 | 5 | 5 |
| evaluation_context | 0 | 0 | 0 | 0 |
| get_wardrobe | 13 | 0 | 0 | 0 |
| get_weather | 1 | 0 | 0 | 0 |
| recommended_items_exist | 29 | 0 | 5 | 5 |
| top_bottom_categories | 29 | 0 | 5 | 5 |
| formality_range | 29 | 0 | 5 | 5 |
| not_worn_recently | 15 | 0 | 2 | 0 |
| no_wear_mutation | 0 | 0 | 0 | 0 |

## Per-scenario results and latency

Each cell is status followed by the complete scenario round-trip time.

| Scenario | v1 baseline | qwen3.5:4b v2 | qwen3:4b v2 | phi4-mini v2 |
| --- | --- | --- | --- | --- |
| en-coffee | FAIL / 3.61 s | PASS / 14.60 s | PASS / 26.30 s | PASS / 35.33 s |
| ar-coffee-new | FAIL / 1.89 s | PASS / 2.77 s | PASS / 2.69 s | PASS / 3.63 s |
| en-office | FAIL / 6.98 s | PASS / 21.93 s | PASS / 13.00 s | PASS / 4.22 s |
| ar-office-new | FAIL / 6.31 s | PASS / 3.09 s | PASS / 13.54 s | PASS / 4.50 s |
| en-interview | FAIL / 3.56 s | PASS / 2.58 s | PASS / 2.73 s | PASS / 2.59 s |
| ar-interview-new | FAIL / 3.28 s | PASS / 2.68 s | PASS / 3.08 s | PASS / 2.44 s |
| en-seafront | FAIL / 5.92 s | PASS / 3.85 s | FAIL / 7.62 s | PASS / 3.87 s |
| ar-seafront-new | FAIL / 3.26 s | PASS / 3.15 s | PASS / 3.56 s | PASS / 2.39 s |
| en-gym | FAIL / 5.30 s | PASS / 2.59 s | PASS / 2.36 s | PASS / 2.14 s |
| ar-gym | FAIL / 7.09 s | PASS / 2.57 s | PASS / 2.76 s | PASS / 2.13 s |
| en-dinner-new | FAIL / 6.53 s | PASS / 3.76 s | PASS / 13.52 s | PASS / 3.40 s |
| ar-dinner | FAIL / 5.12 s | PASS / 2.99 s | PASS / 8.01 s | FAIL / 5.16 s |
| en-wedding | FAIL / 3.55 s | PASS / 2.71 s | PASS / 2.67 s | PASS / 2.29 s |
| ar-wedding-new | FAIL / 4.62 s | PASS / 3.30 s | PASS / 3.08 s | PASS / 2.73 s |
| en-travel-new | FAIL / 6.18 s | PASS / 3.72 s | FAIL / 6.01 s | PASS / 2.92 s |
| ar-travel | FAIL / 6.21 s | PASS / 3.26 s | PASS / 3.84 s | FAIL / 11.40 s |
| en-presentation | FAIL / 6.13 s | PASS / 3.83 s | PASS / 13.14 s | PASS / 13.05 s |
| ar-presentation-new | FAIL / 3.13 s | PASS / 3.36 s | PASS / 4.39 s | PASS / 3.70 s |
| en-rain-plan | FAIL / 4.23 s | PASS / 13.16 s | PASS / 13.08 s | FAIL / 5.01 s |
| ar-rain-plan-new | FAIL / 8.74 s | PASS / 4.21 s | PASS / 8.18 s | PASS / 3.35 s |
| en-weekend-new | FAIL / 6.01 s | PASS / 2.74 s | PASS / 2.62 s | PASS / 2.26 s |
| ar-weekend | FAIL / 5.01 s | PASS / 3.19 s | PASS / 3.43 s | PASS / 2.94 s |
| en-client-new | FAIL / 11.62 s | PASS / 3.65 s | PASS / 6.06 s | PASS / 3.48 s |
| ar-client | PASS / 10.08 s | PASS / 3.41 s | FAIL / 7.98 s | PASS / 4.55 s |
| en-walk-new | FAIL / 6.16 s | PASS / 3.71 s | FAIL / 10.84 s | PASS / 3.25 s |
| ar-walk | FAIL / 3.92 s | PASS / 3.10 s | FAIL / 13.83 s | FAIL / 5.34 s |
| en-family | FAIL / 8.82 s | PASS / 3.60 s | PASS / 5.25 s | PASS / 3.07 s |
| ar-family-new | FAIL / 17.45 s | PASS / 3.19 s | PASS / 5.43 s | PASS / 6.11 s |
| en-ceremony-new | FAIL / 14.90 s | PASS / 5.63 s | PASS / 5.54 s | PASS / 3.46 s |
| ar-ceremony | FAIL / 3.43 s | PASS / 3.19 s | PASS / 3.33 s | FAIL / 4.55 s |

## What changed and how to interpret the comparison

The server now reads wardrobe data and relevant weather before inference. The prompt contains only compact garment metadata, dates, recent-wear IDs and weather facts/status. Per-category eligible IDs become JSON-schema enums. Server validation checks the saved wardrobe again before publishing, enforces formality and recency, checks reply language/script and reason length, and allows one correction attempt. A failed attempt never creates a card or changes wear history. Try it on and Log worn today are explicit UI actions.

The nine scoring categories and scenario inputs are unchanged. The v2 harness uses server reads for the read checks and validated JSON for the recommendation checks; it no longer requires a model-generated show_on_avatar call. This is a comparison of complete pipelines. The model no longer has to discover valid IDs or orchestrate data reads, so the pass rate is not a measure of unconstrained reasoning or subjective fashion quality.

Intent parsing uses application rules for common English/Egyptian Arabic occasions, cities, ISO/relative dates and numeric recency. Unrecognized occasions use formality 1-5. It is not unrestricted natural-language understanding. Language checks validate script, not Egyptian dialect fluency. Longer explicit wear exclusions remain hard constraints; the default three-day exclusion can relax per category only when no fresh alternative fits. Outerwear can be recommended and logged; the existing avatar preview displays the top and bottom.

## Verification and artifacts

- Typecheck, lint, production build and full npm test passed.
- Pipeline tests cover invalid IDs/categories/formality/recency, one-retry exhaustion, required fields, language, sentence length, weather failure, concurrent wardrobe deletion, privacy and local-only access.
- Browser checks passed for optimistic messages, pending/error/retry states, explicit-only avatar and wear actions, duplicate protection and action feedback. Browser action requests used fixtures and did not alter personal wear history.
- Reports are status-only: no prompts, model prose, reasoning, tool arguments, photos or personal measurements. The dirty-tree marker is from existing/generated local Next configuration, not application edits during evaluation.

Detailed ignored reports (including retry counts and per-check status):
- [qwen3.5:4b](../eval/stylist/results/2026-11-19T08-34-52-138Z-e9715095/report.md)
- [qwen3:4b](../eval/stylist/results/2026-11-19T08-39-03-831Z-9b8cf412/report.md)
- [phi4-mini:latest](../eval/stylist/results/2026-11-19T08-43-37-473Z-95c75e0f/report.md)

The original baseline remains in [stylist-qwen-baseline.md](stylist-qwen-baseline.md). Redesign Phase 3 was not started. No push or merge was performed.
