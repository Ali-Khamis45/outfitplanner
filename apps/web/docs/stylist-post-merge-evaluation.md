# Post-merge stylist evaluation

Measured on 2026-11-20 using qwen3.5:4b, thinking off, the 48 synthetic scenarios, and port 3100. This report contains status only, not prompts, personal data, generated responses, or model reasoning. The pre-merge run is documented in `stylist-conversation-evaluation.md`.

| Metric | Before merge | After merge |
| --- | ---: | ---: |
| Raw intent kind | 46/48 | 46/48 |
| Occasion | 44/48 | 44/48 |
| Formality range | 45/48 | 45/48 |
| Date | 45/48 | 45/48 |
| Indoor/outdoor | 32/48 | 32/48 |
| Language | 48/48 | 48/48 |
| All intent fields | 25/48 | 25/48 |
| Quality passed | 42/48 | 42/48 |
| First-try quality | 25/48 | 23/48 |
| First-try validation | 44/48 | 40/48 |
| Retries | 4 | 8 |
| Average latency | 5.78 s | 5.67 s |

Raw intent-kind accuracy by class was unchanged: recommend 40/40, greeting 3/3, clarify 0/2, off-topic 1/1, follow-up 2/2. The clarify safeguard still handles the two misclassifications without a card. Post-merge quality failures by category: date 4, intent kind 2, formality 1, gap note 1, reply language 1; checks can fail together in one scenario. Warmth, expected card/no-card, plain-language reason, follow-up exclusion, warmer follow-up and no wardrobe reads for non-card turns had zero quality failures. Shared server policy makes the formality and warmth checks partly guaranteed, so they are not independent model-quality evidence. One run per version is not a statistical comparison.

Local ignored run: `2026-11-20T04-37-46-088Z-8aa8c23f`. The harness exits nonzero for failed scenarios; all 48 completed.
