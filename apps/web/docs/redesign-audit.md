# Sprint 8 — Phases 1 and 2

## Audit

- Stack: Next App Router with local Pages API routes, React 19, Three/R3F, plain route CSS and Tailwind 4. Keep these dependencies.
- Home is a Sprint 0 lab link; it does not surface the existing wardrobe, planner, fit or weather data.
- Collection pages duplicate navigation; mobile links wrap without an active destination. No profile access or skip link.
- Arial and Georgia, cool green neutrals and inconsistent control shapes compete across routes. The approved direction replaces these with Instrument Serif, Manrope and warm editorial tokens.
- Wardrobe has search and category/season/occasion/colour filters, editable schema fields, photo upload and alignment, examples, saved outfits, concurrency checks, and try-on handoff. Preserve all of them.
- Cards open the editor immediately; there is no read-only detail view, favourite action, sort, or item-size fit warning.
- Existing modal lacks focus containment and Escape dismissal. Use a native dialog for the shell and wardrobe panels.
- The shared thumbnail queue renders procedural garment GLBs and caches local thumbnails. Reuse it; no stock images or remote image URLs.
- Fit colours need a labelled orange/green/blue mapping, including the shader and its legends.

## Phase 1 boundary

Shared tokens, local fonts, responsive top/bottom navigation, profile measurements, accessible panels, favicon and metadata. The Outfits destination exposes the existing outfit builder; it is not a new outfits redesign. Keep the lab's engineering controls and all rendering/data flows. The dark 3D studio remains inside the light shell.

## Phase 2 boundary

Home: hero, real-data summary, quick actions, today's plan, recent pieces and saved looks (including intentional empty/error/loading states). Wardrobe: larger cards, category chips, search, sorting, details with all item schema fields, fit status, favourites and outfit actions. Keep the existing editor, capture, persistence and outfit builder.

## Data rules

Counts come from `/api/wardrobe`; seeded items are explicitly labelled Example. Today's outfit comes only from the matching local planner date. Weather comes from the existing weather tool and displays the city/date and unavailable state. Personal fit availability comes from `/api/personal-fit`. Item warnings come from `get_fit`, including the selected body and item size. No invented statistics, saved looks, temperatures, avatars or fit claims.

## Validation

Use port 3100 only. Run typecheck, lint, production build, the existing full test suite, and a Chromium interaction/layout check at desktop and mobile sizes. Browser mutations use an in-memory test wardrobe so private local data is preserved. Verify overflow, navigation, panels, search/filter/sort, favourite persistence, editor, outfit handoff, empty/error states and live fit data. Stop after Phase 2; no push or merge.
