# Sprint 5B — local wardrobe

## Delivered

- `/wardrobe` shows a searchable grid with category, season, occasion and colour filters. Six items identified by `example-` IDs are labeled Example. If no wardrobe file exists they appear as defaults and are first persisted when the user saves; their blank photo paths render a colour placeholder.
- The editor covers the supplied item fields, local JPEG/PNG/WebP upload, multiple named colour swatches and their shares, and photo colour suggestions sampled in the browser. The suggestions include the whole image, including its background; they are not garment segmentation.
- The outfit builder saves a named top-and-bottom outfit. Try-on loads the selected items' templates and the colours with the greatest shares. The currently supported templates are `tshirt-v5.2` for tops and `pants-v2` for bottoms; unsupported or missing templates produce a visible message rather than claiming a match.
- The socket-checked `/api/wardrobe` handler is development-only and localhost-only, with the same request boundary as personal-fit. It validates the complete JSON document before each write, restricts photo names and locations, checks image signatures and size, and uses an atomic document replacement. Files are local under ignored `outputs/wardrobe/`.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run build`, and `npm test` in `apps/web`: passed.
- Automated schema/storage checks cover the supplied example schema, invalid writes, local-only and production access, photo upload/read and traversal rejection.
- A headless Chrome test against a separate scratch copy with synthetic examples passed: six labeled examples, category filtering, item edit, image upload and colour suggestions, photo loading, outfit save, and try-on handoff with both colours. The initial page was visually inspected at 1440 × 900. The scratch test used only neutral demo assets and did not write the user's wardrobe.

## Limits

- Example items use colour placeholders rather than photographs. User-uploaded photos remain local. Photo files replaced or removed from an item are not automatically deleted.
- Whole-document saves are intended for one local session; simultaneous edits from multiple browser tabs can overwrite one another.
- The user-provided contract was used directly; `docs/contracts/wardrobe.md` was not yet available on this branch.
