# Roadmap

Ordered, near-term only. Each sprint's report (`docs/sprint-*/`) holds what was done; this file holds what comes next.

| Order | Sprint | Scope | Status |
| --- | --- | --- | --- |
| 1 | **3.6: size gates** | Full validator (stretch, flips, penetration) on every size file, both bodies, every supported pose; the gates run in the size pipeline. Fixes the waistband-rim stretch and the pants flip overruns at `walk` and `l-hip-60`. Sizes that still fail are withheld from the size picker. Secondary personal avatars regenerated on v5.3 / pants-v3. | In progress |
| 2 | **4A: photo-to-texture producer** | `docs/contracts/garment-texture.md`. | Next, after 3.6 passes |
| 3 | **3.7: L/XL grading** | Rework the grading of the sizes that 3.6 withholds, so they pass the same gates: shoulder and armhole of the L / XL T-shirts (both-arms +90 stretch, +120 shoulder-top folds), waist and front rise of the XL pants (front-waist folds at `l-hip-60`, `walk`). The withheld sizes and their failing gates are listed in `docs/sprint-3/sprint-3.6-report.md`. Also removes the legacy `?gen=v5.2` set (`outputs/garments/sizes-v5.2/`, `LEGACY_GENERATION`). | After 4A |

## Open decisions

- **Pants v3.1** (no knee step, branch `pants-v3.1-knee`): a candidate until the heatmap band is checked in the browser; not promoted.
- **`?gen=v5.2`** (tshirt-v5.2 / pants-v2): a development-only comparison set, labelled "legacy, ungated", until Sprint 3.7 removes it.
- **`sprint-6e-stylist-pipeline`** (Codex) is merged after its follow-up.
