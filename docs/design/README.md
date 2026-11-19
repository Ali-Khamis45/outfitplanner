# Design reference: Redesign v2

This folder is the visual source of truth for the UI redesign (Sprint 8, phases 1 to 6).
It holds the approved **v2 "Redesign"** boards only. The older v1 "First pass" boards were left out on purpose. Do not bring them back.

## What is here

| Path | What it is |
|---|---|
| `screenshots/*.png` | Rendered boards at their design size. Look at these first. |
| `boards/*.dc.html` | Board source. Exact colours, spacing, radii, copy and states. Open in a browser. |
| `boards/support.js` | Tiny local runtime so the boards open standalone and their buttons work. Reference only. |

Open a board straight from disk (for example `boards/FittingRoom.dc.html`). The size, colour, pose and fit-map controls work, so you can see every state.

## Board to route map

| Board | Size | App route | Notes |
|---|---|---|---|
| `Home` | 1440 x 2200 | `/` | Hero with avatar, stat tiles, quick actions, today's outfit, recently added, saved looks |
| `FittingRoom` | 1440 x 900 | `/try-on` | Three columns: wearing list, dark 3D stage, item and fit panel |
| `Closet` | 1440 x 1180 | `/wardrobe` | Filter chips, search, sort, card grid, sticky detail panel |
| `Outfits` | 1440 x 1100 | outfit builder (new) | Top + bottom picker and saved looks |
| `StylistChat` | 1440 x 900 | `/stylist` | Chat column with tool chips, dark recommendation card on the right |
| `Planner` | 1440 x 900 | `/planner` | Seven day cards, today in the dark style |
| `PhoneFitting` | 390 x 844 | `/try-on` on mobile | Phone layout of the fitting room |

## Design tokens

Colours
- Background `#F7F4EF`, raised background `#EEE8DF`, surface `#FFFFFF`
- Text `#211C18`, secondary text `#756B62`, border `#E5DDD3`
- Accent (primary buttons) `#49392D`, olive (italic headline accent) `#777A61`
- Dark stage and dark cards `#24201C`

Fit colours (must match the 3D heatmap exactly)
- Tight `#D9733A` on `#FBE7DA`, text `#7A3A12`
- Good `#6E9A5B` on `#E6EFDF`, text `#2F5A26`
- Loose `#3D72B8` on `#DFE9F5`, text `#1F4677`

Type
- Display: Instrument Serif (headlines, item names, big numbers)
- UI: Manrope 400 / 500 / 600 / 700
- Small caps labels: 12 to 13 px, letter spacing about 0.12em, secondary text colour

Shape
- Buttons and chips are pills (`border-radius: 999px`), minimum height 40 to 48 px
- Cards use 16 to 28 px radius with a 1 px `#E5DDD3` border, or no border on the dark style

## Rules when building from these boards

1. **The data in the boards is sample data.** Item names, sizes ("L, best fit"), fit numbers, the weather ("29° Cairo") and counts are placeholders. In the app every value comes from the real sources: wardrobe JSON, `fit.json`, the recommended size, Open-Meteo, planner.json. Never copy a sample number into the app, and never show weather that did not come from the weather tool.
2. **Match the layout and style, not the markup.** Build proper Next.js components with the app's existing CSS approach. Do not paste the inline-style HTML in, and do not import `support.js`.
3. **Fonts are self-hosted in the app** (`apps/web/app/fonts`). The boards load them from Google Fonts only for previewing. The app must not call Google Fonts.
4. **No external images.** Garment thumbnails in the boards are inline SVG silhouettes. Use the same approach, or the user's own texture files once Sprint 4A ships.
5. **Keep everything that already works.** The 3D viewer, size switching, the heatmap, the "Too small" banner rule (clamped AND tight), the demo body / My avatar toggle, poses and correctives must behave exactly as before. The redesign changes the frame around them.
6. **Accessibility from the boards carries over:** `aria-pressed` on toggles, `aria-current` on the active nav item, labels on icon buttons, visible focus rings, contrast at least 4.5:1 for text.
7. **Personal data stays out.** No body measurements, height or personal fit numbers in screenshots, logs or commits. Status words only.

## When a board and the code disagree

The board wins on look and layout. The contracts in `docs/contracts/` win on data and behaviour. If following a board would break a contract or hide real state, follow the contract and list the difference in your report.
