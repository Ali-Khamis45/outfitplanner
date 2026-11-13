# Sprint 5B — local wardrobe

## Delivered

- `/wardrobe` provides responsive item cards with photos, colour chips and formality dots, plus search and category, season, occasion and colour filters. Six clearly labeled examples (three tops and three bottoms) appear when no file exists. They can be deleted individually; deleting one warns if a saved outfit references it. Examples are first persisted when a change is saved, and use colour placeholders instead of photos.
- Add/edit covers the supplied item fields, JPEG/PNG/WebP photos up to 10 MB, multiple colours and shares, season choices, occasion suggestions, and three dominant-colour suggestions sampled from the photo where available. Sampling includes the background and is not garment segmentation.
- The outfit builder saves a named top and bottom. Try-on uses their main colours, supported templates (`tshirt-v5.2`, `pants-basic-v2`, and the earlier `pants-v2` alias) and saved sizes when matching size assets are available. If a saved size is unavailable, the UI says so and shows the available default. Unsupported or missing templates produce a visible message.
- The socket-checked `/api/wardrobe` endpoint is localhost-only in development and returns 404 in production. It validates each document write, including the season enum, colour shares between 0.9 and 1.1, and the other supplied fields. It checks photo signatures and size, confines photos to the local directory, and atomically replaces the JSON. Local files under `outputs/wardrobe/` are ignored by Git.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run build`, and `npm test` in `apps/web`: passed.
- Automated checks cover the supplied schema example, invalid seasons and shares, exact and oversized photo limits, local-only and production access, photos and traversal rejection.
- Headless Chrome against a separate scratch workspace with synthetic size assets passed the example grid and deletion, category filter, item edit, photo upload and colour suggestions, outfit save, and try-on handoff including main colours and saved sizes. The original page was visually inspected at 1440 × 900. No user wardrobe data was touched.

## Limits

- Replaced or removed item photos are not automatically deleted. Saved outfits referring to a deleted example show a missing piece.
- Whole-document saves are intended for one local session; simultaneous edits from multiple browser tabs can overwrite one another.
- The user-provided schema was used directly; `docs/contracts/wardrobe.md` was not available on this branch.
