# Sprint 4A plan: photo-to-texture producer

Goal: from a wardrobe item's front photo (and optional back photo) and its alignment, write a texture in **UV layout v3** (`docs/contracts/garment-texture.md`) that the web app already displays:

- `outputs/wardrobe/textures/<item>.png`: 2048 × 2048 RGBA. Alpha 0 where nothing was photographed; the web composites it over `fallback_hex`.
- `outputs/wardrobe/textures/<item>.texture.json`: `{version: 1, item, template, views, coverage, fallback_hex, created_at}`. These are the fields the web already reads (Sprint 4B fixtures).

Inputs (Sprint 4B): `outputs/wardrobe/photos/<item>-<view>.jpg` and `<item>-<view>.align.json`. The matrix maps the capture outline's normalized coordinates to the photo's normalized coordinates, using translation and uniform scale only.

## Why the mapping is simple in layout v3

Layout v3 cuts the garments into real pattern panels, each flattened isometrically at 0.45 UV/m.

- A shirt laid flat and photographed from above shows its front panel almost exactly as that panel's UV island: the same shape, upright, at one metric scale. The sleeves show their upper halves.
- Pants show the left and right front panels; the back photo shows the back panels.

So each island is filled by a 2D warp from the island's outline to the matching region of the photo. No 3D projection is needed.

## Steps

1. **Panel outlines.**
   - From the neutral base garment's GLB, take each panel's boundary in UV and its landmarks: neckline centre, shoulder points, armpits, hem corners, cuffs, waistband corners and crotch.
   - Every size of a template shares these islands and their placement, so one neutral outline per template is enough. Larger sizes fill more of the rectangle but keep their position and scale.
2. **Garment silhouette in the photo.**
   - The alignment matrix gives a coarse placement.
   - The garment is separated from its background inside a margin around the placed outline.
3. **Correspondence.**
   - The outline from step 1, placed by the alignment, is snapped to the photo silhouette's contour.
   - Landmarks are matched first; points between them are spaced by arc length.
   - A thin-plate spline from island coordinates to photo pixels follows from that.
4. **Resample.**
   - Every texel inside an island's outline is filled from the photo through its spline. Front-view regions come from the front photo; back panels from the back photo.
   - Texels with no source keep alpha 0. `coverage` is the share of island texels filled.
   - Seams are dilated by a few texels, so mipmapping never pulls in transparent pixels.
5. **Missing back photo.** The back panels and the sleeve undersides get the front's dominant fabric colour as a flat fill. `views` records which photos were used. The web already falls back to `fallback_hex` (the dominant colour) where alpha is 0.

## Verification without real photos

A synthetic round trip, run as a test:
- paint a known pattern (stripes, a logo, a grid) on a garment's islands;
- render a synthetic flat-lay photo by laying out the panels as a flat garment would lie, at a random similarity transform with mild perspective, on a plain or textured background;
- run the producer and compare the recovered texture with the painted one. The budget is a median colour error and logo-position error within a few texels.

The real-photo end-to-end check follows once photos of an actual garment exist.

## Decisions (2026-11-19)

- **Background separation:** classical. A colour model of the plain background, sampled outside the placed outline, with no new dependency. The capture text asks for a plain surface that contrasts with the garment. A learned model can be added later if real photos need it.
- **Capture outline:** changed in 4A (`PhotoCapture.tsx`). The outline is generated from the garment's flattened panels: the front panel island at 0.45 UV/m, with the sleeves or legs attached. It is drawn at that real aspect and is the producer's flat-lay model. The alignment then places the model, scaled correctly, and the producer refines the placement from the silhouette. `.align.json` keeps its matrix convention and adds the photo's pixel size and the outline's version. Captures saved before this change still load: the producer treats their placement as rough and relies on the silhouette.
  - **Scope of the web change: geometry and data only.** The outline's path and aspect change, and so do the alignment JSON fields. Styling and layout do not, because the redesign phases restyle that screen later. The 4A report lists the change for Codex.

## Options considered

1. **Background separation.** The environment has PIL, SciPy and NumPy, but no OpenCV or matting model.
   - *Classical (recommended to start):* a colour model of the background sampled outside the placed outline, then morphology and the largest component. This needs a plain surface that contrasts with the garment, which the capture text can ask for. No new dependency.
   - *Learned matting* (for example a U²-Net-based remover): robust on busy backgrounds, but it means downloading a model and adding a dependency (licence to record).
2. **Capture guide aspect (web, Sprint 4B code).** The outline is scaled with the photo's own aspect: the guide box spans the same share of the photo's width and height. On a portrait phone photo the outline is therefore stretched. The producer refines the placement from the silhouette anyway, but a correct-aspect outline would make the coarse placement much better.
   - The change: draw the outline at the garment's real aspect, keep the matrix convention, and store the photo's pixel size in `.align.json`.
   - It touches `apps/web/components/wardrobe/PhotoCapture.tsx`.
