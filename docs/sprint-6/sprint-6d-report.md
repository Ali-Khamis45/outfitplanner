# Sprint 6D — local stylist evaluation harness

Date: 2026-11-17

Branch: `sprint-6d-stylist-eval`, rebased onto `main` at `48d839c` (Next.js security patch). Implementation commit: `b195c1d`. Installed and verified Next.js **16.4.6**.

## Delivered

- `apps/web/eval/stylist/scenarios.json`: exactly 30 scenarios, with 15 English and 15 Egyptian Arabic messages. Every scenario supplies a date, city and explicit machine-checkable expectations. Twenty require weather; fifteen exclude recently worn pieces. Occasions cover casual, sport, work, business, formal, travel and outings.
- `node apps/web/eval/stylist/run.mjs`: runs all scenarios through the actual `/api/stylist/chat` route on an owned Next development server at port 3100, using the local model configuration loaded from `apps/web/.env.local` with Next's normal environment precedence. It writes JSON evidence and a short Markdown table, checkpoints each scenario, and reports aggregate check score, scenario pass count, average tool calls and HTTP latency.
- `--mock`: reuses `tests/mock-stylist-model.mjs`, with scripted OpenAI-compatible completions and synthetic weather. The oracle deliberately uses expectations; this mode verifies harness plumbing and scoring, not LLM quality. Real prompts contain only the scenario message and date/city context, never the expected answers.
- A synthetic 30-item wardrobe is reset per scenario. Stable item IDs cover top/bottom categories, formality 1–5, never-worn items, yesterday-worn items and items worn 45 days earlier. The harness does not read or write the personal wardrobe or load photos/body data.
- Evaluation-only instrumentation accepts a reference date/city, freezes the existing wardrobe recency filter's clock, and returns attempted tool names, parsed arguments and success flags. `log_worn` is blocked and scored as a failure in evaluation. Normal chat remains unchanged: evaluation context is rejected, traces are absent, and the normal clock/wear behavior remains active.
- Scoring checks successful wardrobe lookup; weather calls with the correct date/city (including Arabic aliases); existence of all recommended and attempted IDs; one top and one bottom with correct URL slots; each item's formality range; and inclusive recency exclusion. Empty cards, missing traces, malformed cards, invalid attempts followed by a valid card and unavailable models cannot silently pass. A scenario passes only when every applicable check passes; N/A checks are excluded from the overall check score.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Patched dependency installation | PASS | `npm.cmd ci` from `apps/web` in an isolated checkout of `b195c1d`; installed Next.js 16.4.6. Original checkout also repaired to 16.4.6 without stopping its running processes; see execution notes. |
| Typecheck | PASS | Root `npm.cmd run typecheck`, web and contracts |
| Lint | PASS | Root `npm.cmd run lint` |
| Production build | PASS | Root `npm.cmd run build` with `NEXT_DIST_DIR=.next-sprint-6d-build`; route compilation, static generation and cache warmup succeeded |
| Full tests | PASS | Root `npm.cmd test`; all 22 web test scripts, including `stylist-eval.test.mjs` |
| Full mock CLI via actual API | PASS | 30/30 scenarios, 245/245 applicable checks, 100%; 80 total calls / 2.67 average; 58.3 ms average HTTP latency in the final patched mock run; exit 0 |
| Missing-model CLI | PASS | Deliberately empty model configuration produced 30 FAIL scenarios, 0/245 checks, 0 tools, `503 not_connected`, complete reports and expected exit 1 |
| Negative scoring tests | PASS | Missing tools, wrong weather date/city, invalid IDs hidden behind valid cards, empty/malformed cards, duplicate categories, swapped/remote URLs, incorrect formality, recency boundaries, forbidden wear attempts, missing model and malformed/no response |
| Frozen clock and read-only behavior | PASS | A 2030 reference date returns the correct 20 eligible never-worn/old fixture items; recent pieces are excluded; attempted logging leaves the stored fixture unchanged |
| Isolation and occupied-port refusal | PASS | Harness refuses occupied port 3100 with exit 2 and leaves its existing owner running; owned-server marker prevents accidental reuse; successful runs stop only spawned processes |
| Existing planner/chat browser regression | PASS | Chromium suite on port 3100: planner persistence, navigation, weather presentation, wear logging, chat tools/cards, cap, offline states and mobile layout |
| Real local LLM quality | NOT TESTED | No model download or inference-quality claim; mock and deliberately disconnected modes were used |
| Live weather in the evaluation harness | NOT TESTED | Mock mode uses labelled synthetic weather. User verification of live weather in Sprint 6C remains valid; this sprint did not repeat it. |

Final mock artifacts (local, git-ignored):

`apps/web/eval/stylist/results/2026-11-17T05-18-58-884Z-9dc70a06/report.json` and `report.md`.

Missing-model artifacts (local, git-ignored):

`apps/web/eval/stylist/results/2026-11-17T05-19-09-800Z-5126216d/report.json` and `report.md`.

Reports include full check evidence and tool traces, response/HTTP status, tool-failure counts, scenario and fixture hashes, source revision/dirty state, model name and completion state. Both final runs use source revision `b195c1d`; the mock run starts from clean source, while the following disconnected run records Next-generated configuration changes. Scores use structured recommendations and attempts, not free-text fashion judgment or unstructured item references. Weather call correctness is scored independently of live provider availability; fixed scenario dates may eventually leave the forecast window.

## Reproduction

From the repository root:

```powershell
node apps/web/eval/stylist/run.mjs --mock
node apps/web/eval/stylist/run.mjs
```

For a real run, start a locally installed tool-capable model and set `STYLIST_MODEL` plus optional `STYLIST_BASE_URL` in `apps/web/.env.local`; the base URL defaults to `http://localhost:11434/v1`. The existing loopback-only model restriction still applies. No model is installed or downloaded by this harness.

See [the evaluator README](../../apps/web/eval/stylist/README.md) for scoring definitions, fixture design, output locations, date handling, opt-in instrumentation and exit codes.

## Execution notes and scope

The initial sandboxed mock run completed all scenarios but was denied permission to stop its own child server. Only that known owned process tree was cleaned up, and the permitted rerun exited successfully. The runner now reports an exact owned PID, exits with an infrastructure error rather than hanging, and preserves its disposable runtime if cleanup is denied.

After the security patch landed on main, the sprint commit was rebased onto `48d839c` and every verification above was repeated against Next.js 16.4.6. The requested `npm ci` in the original checkout initially failed with Windows `EPERM` on a loaded native dependency. No process was stopped to release that lock. A detached validation checkout (`vw-codex-sprint6d-validation`) completed `npm ci` from `apps/web`; its existing nested compression package was also installed. The original checkout was repaired with `npm.cmd install --ignore-scripts --no-audit --no-fund`, which succeeded without changing tracked dependency files. Locked old binary cleanup warnings were left alone.

Typecheck, lint and the full test suite passed in the isolated checkout. Its first test attempt lacked ignored avatar fixtures; linking the existing avatar/garment directories allowed the full suite to pass. Turbopack rejected those fixture links because they leave that checkout's root, so the production build was verified successfully in the repaired original checkout with `.next-sprint-6d-build`. Mock, disconnected and browser runs also passed there on port 3100. No source workaround or asset modification was needed. Node emits the existing typeless-package warning when directly importing TypeScript from the CLI; it does not prevent execution.

All app server/test traffic used port 3100. Builds and evaluation use separate `.next` directories. Port 3000 was not accessed or stopped. Generated Next environment/type configuration changes were restored before commit. Changes are limited to `apps/web/` and this explicitly requested report; no services, assets or contracts were edited. No push or merge.
