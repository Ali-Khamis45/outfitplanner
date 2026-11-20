# Stylist first-try retry investigation

The pre-merge run `2026-11-19T23-33-34-210Z-773e5c74` reported 44/48 first-try validation and four retries; post-merge `2026-11-20T04-37-46-088Z-8aa8c23f` reported 40/48 and eight retries. The four newly retried scenarios were `en-dinner-new`, `en-presentation`, `en-client-new`, and `conversation-another`. The archived status-only reports and server logs do not include rejected drafts or first validation errors, so the original four failures cannot be recovered or proven retrospectively.

The four original retrying scenarios (`en-wedding`, `en-walk-new`, `en-ceremony-new`, `hard-weekday-ar`) also retried post-merge. Scenario file hashes and all 48 synthetic wardrobe hashes matched. The fixture has tshirt-v5.2 and pants-v2 template labels in both runs; the model's compact outfit context does not include the template field. Reference dates are fixed by scenario and the scenario hash is identical. Model alias, thinking-off setting, keep-alive and fixture version match. Between the committed Stylist conversation change and the merge, the Stylist core changes concern avatar/fit template support, not the chat prompt, validation, or its wardrobe/weather reads. The exact pre-merge prompt cannot be proven: that run recorded a dirty worktree and did not preserve prompt hashes. Forecasts were live for legacy scenarios and not archived, so their equality is unknown. No model version digest was recorded.

An isolated post-merge diagnostic rerun used the same 48 synthetic scenarios, the same handler and fixtures, and category-only first-validation diagnostics; the preview remained on port 3100. This is an in-process handler invocation, not the original owned HTTP-server harness. It reproduced the 40/48, eight-retry result and the same retrying scenarios. The following failure categories are from that diagnostic rerun, not the irretrievable historical errors:

| Newly retried scenario | Diagnostic first failure | After prompt change |
| --- | --- | --- |
| en-dinner-new | Reply language | Pass first try |
| en-presentation | Banned policy word in reason | Retried for a policy word |
| en-client-new | Reply language | Pass first try |
| conversation-another | Reply language | Pass first try |

A separate targeted synthetic run confirmed that the three language cases set the language field to English while including Arabic letters in the reason. The previous choice prompt mentioned both languages in the same instruction. The change asks for only the selected language, explicitly specifying English words and Latin script for English; Arabic requests receive their own Egyptian Arabic instruction. Server validation and all quality checks remain unchanged. The targeted `en-presentation` case did not retry in that separate run, so variability remains possible; these observations do not prove the historical cause.

| Metric | Original post-merge HTTP run | Diagnostic before change | Diagnostic after change |
| --- | ---: | ---: | ---: |
| First-try validation | 40/48 | 40/48 | 44/48 |
| Retries | 8 | 8 | 4 |
| Quality | 42/48 | 42/48 | 43/48 |
| Raw intent kind | 46/48 | 46/48 | 46/48 |
| First-try quality | 23/48 | 23/48 | 25/48 |

After the change, the four retries were `en-wedding`, `en-presentation`, `en-ceremony-new` and `hard-gap-en`, all for policy words in reasons. Quality failures included three date checks and two raw intent-kind checks; they may overlap. The data are single runs with live-weather variability, not proof of a sustained improvement. Diagnostic output contains scenario IDs and status categories only, without user data, model prose or reasoning.
