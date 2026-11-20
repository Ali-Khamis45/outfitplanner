# Stylist conversation routing evaluation

Measured 2026-11-20 Africa/Cairo using qwen3.5:4b, thinking off, keep-alive 30 minutes, synthetic wardrobes and the owned port 3100 server. The 48-case suite contains the previous 40 recommendation scenarios and eight new conversation scenarios. This is a status-only report; no personal data, model reasoning, or generated prose is included. The source tree was quiet during inference and had uncommitted changes under test.

## Raw model intent kind

| Expected class | Correct |
| --- | --- |
| recommend | 40/40 |
| greeting (including thanks) | 3/3 |
| clarify | 0/2 |
| off_topic | 1/1 |
| follow_up | 2/2 |
| All | 46/48 |

The model misclassified both vague requests. A narrow server safeguard asked a clarifying question and showed no card for those two cases, while the scores above deliberately retain the raw model mistakes. Both English and Arabic greetings, off-topic, thanks, and both follow-ups passed. Both follow-ups excluded the previous items; the warmer case used a fixture with a warmer alternative and chose it. All eight new cases produced the expected card/no-card behavior and avoided wardrobe reads for non-card turns. This does not establish broad classification accuracy from just eight cases.

## Pipeline results

| Measure | Previous v2.1, 40 cases | This run, 48 cases |
| --- | --- | --- |
| Quality passed | 35/40 | 42/48 |
| First-try quality | 12/40 | 25/48 |
| First-try validation | 26/40 | 44/48 |
| Retries | 14 | 4 |
| Average latency | 5.23 s | 5.78 s |

The two quality totals are not directly comparable: the new suite includes conversation classes and counts raw intent-kind failures. Among the original 40, 36 passed the quality checks. The single original recommendation failure was `en-wedding`, which produced no valid card after validation attempts; the other 39 produced cards. None of the published reasons contained a banned policy word. Four date and one language quality failures were recorded; one missing-card case also failed the formality and gap checks. The shared formality/warmth policy is enforced server-side and is not independent evidence of model reasoning.

Occasion extraction was 44/48, formality range 45/48, date 45/48, indoor/outdoor 32/48, and language 48/48. All intent fields matched in 25/48. The run completed all requests; its nonzero exit reflects scenario failures, not an infrastructure failure.

The report hashes and per-scenario status are in the ignored local run `2026-11-19T23-33-34-210Z-773e5c74`. Fitting room Phase 3 was already completed in commit `5393678`; no later redesign phase was started.
