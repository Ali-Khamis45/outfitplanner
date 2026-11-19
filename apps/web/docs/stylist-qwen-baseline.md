# Local Stylist baseline: qwen3.5:4b

Measured 2026-11-19 on revision `5d617499987cc19c6f0df6383a7a39d557fca6cd`, using Ollama's OpenAI-compatible endpoint, `STYLIST_THINKING=off`, and `reasoning_effort: "none"`. The default is off; set `STYLIST_THINKING=on` and restart to use the model's default thinking behavior. Reasoning fields are neither displayed nor logged.

The completed run used `node apps/web/eval/stylist/run.mjs` and the synthetic `stylist-eval-v1` wardrobe: 30 scenarios, split equally between English and Egyptian Arabic. All 30 requests returned HTTP 200 with status `ok`. The process exited 1 because scenario checks failed, not because the server disconnected. Application source stayed unchanged throughout the run; the dirty-tree marker reflects local Next configuration files.

| Metric | Result |
| --- | --- |
| Scenario pass rate | 1/30 (3.3%) |
| Applicable checks passed | 129/245 (52.7%) |
| Tool-call validity | 55/82 (67.1%); 27 invalid |
| Average latency per scenario | 6.30 seconds |
| Average tool calls per scenario | 2.73 |

Latency measures the complete HTTP chat round trip, excluding server startup. Tool validity checks the advertised tool name, call envelope and argument schema. Provider/runtime failures are separate from schema validity. This is a baseline, not an acceptable recommendation-quality result; prompts and scoring were not tuned to improve the score.

## Failed scoring checks

Categories overlap. A missing recommendation also fails the downstream item/category/formality checks.

| Category | Scenarios failing |
| --- | --- |
| Wardrobe lookup | 13 |
| Weather lookup | 1 |
| Recommended items exist | 29 |
| Top and bottom categories | 29 |
| Formality range | 29 |
| Avoid recently worn items | 15 |
| Response status | 0 |
| Evaluation context | 0 |
| No wear-history mutation | 0 |

Weather calls use Open-Meteo; fixed scenario dates can fall outside forecast coverage. A correct weather call is scored independently of provider availability.

The ignored detailed status-only report includes each scenario's latency: `eval/stylist/results/2026-11-19T07-25-23-786Z-3f306fe8/report.md`. Reports omit prompts, model prose, reasoning, tool arguments, photos and personal fit values.

## Quiet-server live check and thinking comparison

A live browser request completed successfully in 0.794 seconds without a page reload or runtime error. The optimistic user bubble, pending indicator and disabled Send appeared during the request. Separate browser checks cover failed requests, retained drafts and retry behavior.

A warmed, minimal greeting request without tools was measured twice per mode, excluding warmup:

| Thinking mode | Samples | Mean |
| --- | --- | --- |
| Off | 114 ms, 158 ms | 136 ms |
| On | 1,538 ms, 1,537 ms | 1,537.5 ms |

The off responses had no reasoning field. These short-prompt timings are not a full-scenario A/B evaluation and are not directly comparable to the 6.30-second scenario average. The harness records the selected thinking mode for future full A/B runs.

## Validation

Typecheck, lint, production build and the full npm test suite passed. Browser checks passed for the redesign shell, Home and Wardrobe interactions, candidate garments and textures, preserved routes, and Stylist pending/error/retry behavior. The real-model baseline above remains a separate failing quality evaluation.
