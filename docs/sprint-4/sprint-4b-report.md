# Sprint 4B: photo-to-garment web

Branch: `sprint-4-photo-web`, based on `39de031` (`sprint-5-wardrobe-web`).

## Implemented

- The wardrobe editor accepts a front and optional back capture, with draggable and scalable T-shirt or pants outlines. Captures are converted to JPEG and saved under `outputs/wardrobe/photos/<item>-<view>.jpg` with a corresponding `.align.json`.
- Alignment JSON records `version`, `item`, `view`, `matrix`, and `convention`. The matrix `[a,b,c,d,e,f]` maps normalized guide coordinates into normalized photo coordinates: `x'=a*x+c*y+e`, `y'=b*x+d*y+f`. The photo and guide coordinate origins are at the top left. The current UI exposes translation and uniform scale (no rotation or shear). This convention needs coordination with the Sprint 4A producer.
- Wardrobe items accept an optional item-specific texture path or null. The local-only route reads the texture and its metadata; the renderer composites the PNG alpha over `fallback_hex`. Textures work on the existing skinned garment material; fit heatmap suppresses the texture, and a swatch switches the slot to flat colour. Textured wardrobe thumbnails are rendered without the shared flat-colour thumbnail cache.
- Run `node apps/web/tests/build-texture-fixtures.mjs` from the repository root, then open `/try-on?texture-fixture=1` on the development server. This writes synthetic 2048px RGBA fixtures into ignored `outputs/wardrobe/test-textures/`.

## Verification

- At `39de031`: typecheck, lint, build, and full `npm test` passed.
- After the web changes: typecheck, lint, build, and full `npm test` passed. Wardrobe tests cover the optional path, capture alignment persistence, texture access, invalid paths and local-only access.
- Browser visual verification was blocked: the browser access host was unavailable, and the headless browser inspection did not reach a loaded 3D scene. The fixture's logo is placed using the torso UV mapping, but its upright front-chest appearance has **not** been verified. Capture alignment, texture alpha, heatmap transitions, and correctives also need an interactive browser pass with the producer's real output before treating the integration as complete.
- No producer was implemented. Personal photos and generated fixture images remain in ignored outputs.
