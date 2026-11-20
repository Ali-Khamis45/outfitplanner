# Stylist quality evaluation

Run on 2026-11-20 with qwen3.5:4b, thinking off, an isolated Next server on port 3100 and 50 synthetic scenarios. Intent extraction used temperature 0; the wardrobe-choice call used 0.3 (the previous choice temperature was 0). The two new scenarios describe an ordinary dinner with friends in Zamalek, in Arabic and English, using a casual-only fixture and controlled weather.

| Measure | Result |
| --- | ---: |
| Quality pass | 44/50 |
| First-try validation | 46/50 |
| First-try quality | 24/50 |
| Retries | 4 |
| Intent kind | 49/50 |
| Intent formality range | 47/50 |
| Intent date | 47/50 |
| Intent indoor/outdoor | 31/50 |
| Intent language | 50/50 |
| All intent fields | 25/50 |
| Average scenario latency | 5.24 s |

Both new scenarios produced casual 1?2 intent, used eligible wardrobe pieces, and passed the no-gap check. Both failed their indoor/outdoor intent label: no explicit indoor/outdoor location was given. For the original 48 scenarios, quality was 42/48, first-try validation was 44/48 and retries were four. Quality failure counts over all 50 were date five, language two, best-available formality two, gap note two and intent kind one; failures can overlap. Warmth and policy-word quality checks had zero failures, but the shared server selection logic enforces the warmth and formality checks. One run is not evidence of a stable quality improvement.

The automated evaluation does not judge fluency or natural Egyptian Arabic. The ignored local review file contains 48 parsed reason strings for 48 choice attempts, including retries; each JSONL record has a scenario ID, language, attempt and a null rating. No model reasoning is included. Ali can rate those samples in `eval/stylist/results/2026-11-20T05-58-06-398Z-9f7ded56/reasons.jsonl`. The standard reports in that directory contain status only.

A separate live Open-Meteo check on the same day found no geocoding result for Zamalek in Arabic and successfully returned Cairo as the fallback city; the reply labels the actual forecast city. If no known parent city applies, `STYLIST_DEFAULT_CITY` can set the fallback, with Cairo as the default. The browser accessibility-tree check verified the withheld XL description and focus behavior.
