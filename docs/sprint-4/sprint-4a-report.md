# Sprint 4A: photo-to-texture producer (first pass)

**Result.** A wardrobe item's front photo, and optionally its back photo, now becomes a texture in UV layout v3 that the web app displays. On synthetic flat-lay photos with a known texture, the producer recovers the pattern:

- coverage: 97.7–99.3 %;
- chest logo: within 2.2–3.1 mm;
- wrong texels: 3.8–9.9 % more than 40 levels from the reference, allowing 4.3 mm of shift.

It has **not yet been run on a real photograph**: no photos of a real garment exist in this checkout. That check is the first item under "Not done".

Plan and decisions: `docs/sprint-4/sprint-4a-plan.md`.

## How to run

    external/mhr-venv/Scripts/python.exe services/texture/produce.py <item> --template tshirt-v5.3 [--link]

| Direction | Files |
| --- | --- |
| Reads | `outputs/wardrobe/photos/<item>-front.jpg`, `<item>-front.align.json` (required); `<item>-back.jpg`, `<item>-back.align.json` (optional) |
| Writes | `outputs/wardrobe/textures/<item>.png`: 2048 × 2048 RGBA, alpha 0 where nothing was photographed |
| Writes | `outputs/wardrobe/textures/<item>.texture.json`: `{version, item, template, views, coverage, fallback_hex, created_at}`, the fields the web already reads |

`--link` also sets the item's `texture` in `outputs/wardrobe/wardrobe.json` to the one value the schema accepts. Nothing set it before. The file is written like the web's own `writeWardrobe`, and every other field stays unchanged.

## How it works

1. **Flat-lay model** (`services/texture/flatlay.py`).
   - From the neutral base GLB of each template: every panel's UV island outline, and named landmarks found where the panels meet. For the T-shirt these are the armpits, shoulder points, neck, hem corners and cuffs; for the pants, the waist, crotch, inseam and hems.
   - `layout()` lays the garment out flat, seen from the front or the back, in metres:
     - T-shirt: the torso panel, plus each sleeve's half (cut along the fold from shoulder point to cuff top), hanging 30° below horizontal;
     - pants: the two leg panels meeting along the centre seam (front overlap 0.02 %, back 3.9 %).
   - In layout v3 each island is the panel flattened at 0.45 UV/m, so a flat-lay photo is close to a similarity transform of this layout.
2. **Placement.** The capture's alignment places the layout in the photo. Version 2 alignments (below) are aspect-true. Version 1 captures are read as a rough placement.
3. **Silhouette.** The background colour is the median of the photo outside the placed outline, and pixels far from it are garment; then morphology and the component under the outline. No learned matting (decision of 2026-11-19), so the photo needs a plain surface that contrasts with the garment.
4. **Fit.** The layout's outline is fitted to the silhouette's contour by a similarity transform (iterative closest points, both directions). It recovers rotation, which the capture outline cannot express, and the true scale from a 4 %-off start (1,400.8 px/m found for 1,400).
5. **Resampling.**
   - Every texel of a visible piece is read from the photo where it lands on the garment.
   - Seams are dilated by 4 texels.
   - `fallback_hex` is the garment's median colour. The web fills alpha-0 texels (the gusset, and the back when there is no back photo) with it.

**A contour spline was tried and is off.** A thin-plate spline from the outline to its closest contour points lets points slide along the outline and bends the interior. One round left 10.6 % (no drape) and 11 % (10 px drape) of texels wrong, against 8.8 % and 3.8 % for the similarity alone. A landmark-based spline is the next refinement.

## Verification

`services/texture/tests` (8 tests, `external/mhr-venv`):

- **`test_flatlay.py`:** the landmarks are anatomical, mirror left and right within 2 cm (one mesh vertex; the mesh is not exactly symmetric), and lie inside their island rectangles.
- **`test_round_trip.py`:**
  - `synthetic.py` paints a reference texture (a 3 cm checker in a colour per piece, and a logo on the chest) and renders flat-lay photos of it: rotated 4°, with a 10 px smooth drape, JPEG, a noisy plain background, and a capture alignment 4 % off in scale. The producer must recover it.
  - Bounds, just above the measured values: coverage ≥ 0.97; wrong texels ≤ 12 %; logo within 5 mm. The output has no texel outside the visible islands, and its metadata has exactly the web's fields.

| Garment | Coverage | Wrong texels (no drape / 10 px drape) | Logo shift |
| --- | --- | --- | --- |
| T-shirt v5.3 | 0.993 | 8.8 % / 3.8 % | 2.2–3.1 mm |
| Pants v3 | 0.977–0.979 | 8.3 % / 9.9 % | — |

- **`test_round_trip.LinkTests`:** `--link` changes only the item's texture field and leaves no temporary file.
- **Web:** `wardrobe.test.mjs` checks that a capture with a photo size and outline saves version 2, and that one without them, or with an unknown outline, saves version 1. Typecheck and lint pass.

## Changes for Codex (web, geometry and data only)

No styling or layout change; the redesign phases restyle this screen later.

- **`apps/web/components/wardrobe/PhotoCapture.tsx`:**
  - The outline is the producer's flat-lay layout of the template, from `apps/web/lib/garment/flatlay-outlines.json` (written by `services/texture/export_outlines.py`). It is drawn at the garment's real aspect: the photo's pixel size is read when it loads.
  - Saving sends the alignment as version 2 (below), plus `photoSize` and `outline: {template, version}`.
  - `saveCaptures` now takes the item's category (`pants`).
  - The markup, class names, slider, buttons and text are unchanged.
- **`apps/web/lib/wardrobeApi.ts`:** with a valid `photoSize` and a known outline, the capture's `.align.json` is written as version 2. Otherwise it is written as version 1, exactly as before.
- **`apps/web/components/wardrobe/WardrobePage.tsx`:** passes the category to `saveCaptures`.

**Alignment version 2** (`<item>-<view>.align.json`):

    {"version": 2, "item", "view", "matrix": [a, b, c, d, e, f],
     "convention": "guide (layout metres / layout width) to photo pixels / photo width; x'=a*x+c*y+e, y'=b*x+d*y+f",
     "photo_size": [width, height], "outline": {"template": "tshirt-v5.3", "version": 1}}

- Guide coordinates: x runs 0–1 across the layout's width and y runs 0 to the aspect, the layout scaled by its width.
- Photo coordinates: pixels divided by the photo's width, on both axes.
- One scale therefore keeps the garment's aspect. The capture UI still sets translation and uniform scale only.

## Not done

- **A real photograph, end to end.** Capture in the web, run the producer, and look at the 3D garment: does the texture sit upright on the chest, and how good are the background separation and the placement on real cloth? This needs photos of an actual garment.
- **No trigger from the web.** The producer is a command (`produce.py`), not yet started by the web app.
- **Landmark-based refinement.** A spline anchored on matched landmarks (armpits, shoulder points, hem corners) for drape the similarity cannot follow.
- **Pants gusset, and back panels without a back photo.** These take `fallback_hex`.
- **Sleeves.** The sleeve halves hang in a fixed pose (30° below horizontal). Real flat lays vary, so the sleeve placement relies on the silhouette fit.
