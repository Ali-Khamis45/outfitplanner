# Sprint 6C — planner persistence and local stylist chat

Date: 2026-11-16

Branch: `sprint-6c-planner-chat`

Base: `main` at `cfdc71d` (includes Sprints 3A, 3B, 4B, 5B and 6B)

## Delivered

- `/planner`: Monday–Sunday week view with previous/next/this-week navigation, saved-outfit or top/bottom assignment, occasion, note, edit and removal. Plans survive reloads. Today's plan can call `log_worn`; supported top/bottom selections link to the existing fitting room.
- Plans persist atomically to the already git-ignored `outputs/wardrobe/planner.json`. The document uses exactly `{ "version": 1, "plans": [{ "date": "YYYY-MM-DD", "outfit_id": "outfit-001 or null", "item_ids": ["..."], "occasion": "casual", "note": "", "created_at": "YYYY-MM-DD" }] }` (the actual absent outfit value is JSON `null`).
- `/api/planner`: GET document, PUT one complete plan (upsert by date), DELETE `{ "date": "YYYY-MM-DD" }`. Exact fields, real calendar dates, unique item IDs, one plan/date, saved item/outfit existence and outfit membership are validated. Updates preserve the original `created_at`. Reference validation and atomic replacement run inside the existing process-global wardrobe write queue. `X-Planner-Version` / `If-Match` prevents the UI from silently overwriting a stale snapshot. Invalid/corrupt storage produces an error, not an empty replacement.
- The example wardrobe fallback cannot satisfy a planner write: the collection must first exist in `wardrobe.json`. Deleting wardrobe items later can leave an old plan with missing pieces; the UI indicates that and disables wear logging until corrected. Referenced IDs are checked again on subsequent plan writes.
- Weather comes from the existing `get_weather` route for Cairo. A day displays weather only after a successful response with that exact date and finite temperatures. Unavailable dates and failed requests show no weather. Provider attribution is attached to displayed forecasts.
- `/stylist`: text chat, per-call chips, local item thumbnails, model-written reasons and validated `show_on_avatar` recommendation links. Navigation is shared with Wardrobe. Existing cream/green colours, serif headings and thumbnail rendering are preserved.
- `/api/stylist/chat`: shared tool executor uses `lib/stylist/tools.json` and the existing five implementations. At most six tool-execution rounds, with up to eight calls per round. A final completion requests `tool_choice: "none"`; if the model still requests tools, those calls are not executed and the UI reports the cap. Tool failures are returned as unavailable rather than fabricated results.
- Both new APIs reuse the existing development-only socket/Host/Origin/forwarded-header protection and private no-store responses. Production requests return 404.

## Local setup and privacy

In `apps/web/.env.local`, set:

```dotenv
STYLIST_BASE_URL=http://localhost:11434/v1
STYLIST_MODEL=your-local-model-name
```

The base URL defaults to the value above. The model is required and must be installed locally and support tool calls. Restart the app server after changing its environment. The app does not download models, change local model configuration or fall back to a hosted model.

The model URL must use HTTP and `localhost`, `127.0.0.1` or `[::1]`; credentials, query parameters, fragments, remote hosts and redirects are rejected. `localhost` is pinned to `127.0.0.1` to avoid DNS resolution. Explicit `:cloud` model identifiers are rejected. Use a local inference service, not a loopback proxy forwarding to a hosted service; this app cannot control the internals of another process. Endpoint availability is checked through `/models` when the screen opens, and completion errors show **Stylist model not connected yet**, with both environment variables. No canned assistant reply replaces a missing model.

Only the existing compact item projection is sent by `get_wardrobe`; photos, textures, notes and file paths are excluded. `get_fit` output is reduced to item sizes and qualitative region statuses; body IDs and numeric ease/delta measurements are removed. Recommendation photos are loaded by the browser from the protected wardrobe route and never included in model requests. Chat accepts text only; embedded images, links and common pasted body-measurement formats are rejected. This is not a general natural-language sensitive-information detector: users should keep free-text messages about clothes and occasions. Weather still uses the existing Open-Meteo/GeoNames integration; the model itself receives requests only over loopback.

## Verification

| Check | Result | Evidence / coverage |
| --- | --- | --- |
| Root `npm.cmd run typecheck` | PASS | Web and contracts TypeScript checks |
| Root `npm.cmd run lint` | PASS | ESLint, including new components, handlers and tests |
| Root `npm.cmd run build` with `NEXT_DIST_DIR=.next-sprint-6c-build` | PASS | Production route compilation, static generation and existing compression-cache warmup |
| Root `npm.cmd test` | PASS | Full existing suite plus planner and chat tests (21 web test scripts) |
| Planner API/storage | PASS | Persistence, new-handler reload, real saved references, exact schema, duplicate/date errors, replacements, deletion, optimistic conflicts, concurrent planner/wear writes, queued wardrobe deletion, corrupt file and junction escape refusal |
| Access controls | PASS | Production, non-loopback socket, invalid Host, cross-origin writes, spoofed forwarding and non-JSON writes rejected |
| Scripted OpenAI-compatible HTTP server | PASS | Five tools, multiple tool calls, call/result continuity, six-round cap, unsupported tools, card data/reason, missing model, unreachable endpoint and initial availability check |
| Privacy and endpoint restrictions | PASS | Recorded model requests contain no test photos, private notes, body measurements or numeric fit details; remote URLs and redirect targets receive no model request |
| Chromium browser on port 3100 | PASS | Seven days; week navigation; saved and manual assignments; reload persistence; covered-weather-only display; actual wear persistence; fitting-room URLs; tool chips; two loaded card thumbnails and model reason; cap; disconnect on send and on page open; environment guidance |
| Desktop/mobile layout | PASS | 1440px and 390px browser checks; screenshots reviewed; no horizontal overflow. Images are deliberately synthetic test fixtures. |
| Real Ollama/model inference quality | NOT TESTED | Used a scripted local HTTP model, not a downloaded or configured real model |
| Live weather provider availability | NOT TESTED | Deterministic weather fixtures cover presentation and the existing weather-handler tests; no live forecast reliability claim |
| New end-to-end 3D rendering verification | NOT TESTED | Sprint 6C verifies handoff URLs; existing full-suite garment/binding tests pass. No new claim about visual fitting accuracy. |

No unresolved FAIL checks. Initial PowerShell `npm` invocation was blocked by execution policy; validation uses `npm.cmd`. The first sandboxed browser run stalled and only its owned process tree was terminated. A subsequent harness failure came from entering text before React hydration; the harness now waits for the initial chat request and has bounded browser command timeouts. The corrected browser run passed. The first build warned about dynamic test-root tracing; `turbopackIgnore` now excludes that runtime-only path and the final build was rerun.

## Reproduction and isolation

From the repository root in PowerShell:

```powershell
npm.cmd run typecheck
npm.cmd run lint
$env:NEXT_DIST_DIR = '.next-sprint-6c-build'
npm.cmd run build
Remove-Item Env:NEXT_DIST_DIR
npm.cmd test
npm.cmd run test:planner-chat-browser --workspace @virtual-wardrobe/web
```

The browser harness refuses an occupied port 3100, starts its own Next server with `.next-sprint-6c-dev`, starts its own loopback mock model, and supplies a disposable `LOCAL_WARDROBE_OUTPUTS_DIR`. It owns and stops only the server/browser processes it spawns. It never connects to port 3000 or uses the personal wardrobe for writes. Test screenshots and server logs are in the ignored `apps/web/.next-sprint-6c-browser/` directory. Local model requests, chat history and synthetic wardrobe fixtures are not committed. Chat history currently lasts only for the open page; persistent chat history was not requested.

Only `apps/web/` and this Sprint 6C report are included in the commit. No service, asset or contract changes. No push or merge.
