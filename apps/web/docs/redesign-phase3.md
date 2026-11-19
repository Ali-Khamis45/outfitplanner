# Redesign Phase 3: fitting room

Implemented on `sprint-6e-stylist-pipeline` after Stylist v2.1. Scope is `apps/web/` only. No push or merge.

The approved FittingRoom and PhoneFitting boards now frame the existing 3D viewer: a wardrobe selector, dark studio, and item/fit panel on desktop; a compact stage and expandable fit sheet on mobile. Instrument Serif and Manrope remain self-hosted. Real wardrobe names, materials, recommended sizes, and fit regions supply the content. Demo and seeded pieces carry Example labels. Unsupported templates are identified and unavailable for preview.

The room preserves generation defaults, neutral body, initial colours, recommended-size discovery, and heatmap-off defaults. Candidate assets remain opt-in at `/try-on?gen=v5.3`. Selection, camera views, rotation, poses, layer visibility, texture swatches, Original texture, personal avatar, local GLB upload, and measurements remain available. Camera framing now reserves space for studio controls; resizing does not replace the canvas.

Save as outfit opens the existing builder with selected wardrobe IDs. The builder still handles naming and saving with its existing version checks. Preview colour and size changes are not persisted as edits to wardrobe pieces.

## Deliberate differences from sample boards

- Recommended sizes and fit values come from the actual fit map; no sample L or sample fit numbers are hardcoded.
- The phone shows three region status summaries initially; Pieces & details reveals complete fit values, estimation notes, colours, poses, wardrobe choices, and avatar settings. The clamped-and-tight warning remains visible in the compact sheet.
- Desktop fit controls scroll within their panel to keep all region notes and existing controls accessible. The stage stays visible.
- Missing or unsupported data is labelled explicitly. Demo pieces can be explored but are not invented wardrobe records for saving.
- The existing shared navigation remains consistent with Phases 1 and 2.

## Verification

All checks below passed on 2026-11-19. The production build and full npm test suite exited successfully.

Commands use the owned server at port 3100. Screenshots use only the neutral avatar and example data and remain ignored. Personal-avatar checks report availability/status only.

- `npm run typecheck`, `npm run lint`, `npm run build`, full `npm test`.
- `npm run test:fitting-room-browser`: real piece selection, unchanged defaults, category switching, camera/pose controls, heatmap legend, persistent canvas, 320/390/844/1024/1440 widths, mobile expansion/upload, and outfit-builder preselection.
- `tests/try-on-browser.test.mjs`: synthetic recommended sizes and rendered heatmap attributes; resize/drawing-buffer consistency; lab defaults and legacy variant selection; synthetic personal-size switching and base fallback; real neutral candidate clamped-warning predicate and estimate notes.
- `tests/redesign-regression-browser.test.mjs`: candidate neutral/personal sizes, front-only texture logo, striped back, flat colour and Original restore, fit card/heatmap, lab generation selector/correctives, default fitting room, and Outfits/Planner/Stylist route availability.

The legacy browser test now disables Use size fits before asserting the selected base version's corrective targets. Size fits intentionally override base geometry; testing both simultaneously previously caused a false failure. The current neutral S asset has a good waist region, so it correctly suppresses the all-regions Too small warning while retaining its clamped-region estimate notes. Framing unit checks also cover clearance above the head and below the feet for the redesigned control bands.

Stylist results are documented separately in [stylist-v21-evaluation.md](stylist-v21-evaluation.md). No Phase 4 work was started.
