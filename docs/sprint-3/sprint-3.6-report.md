# Sprint 3.6: size gates

**Result:**
- The full validator (stretch, flips, penetration) now runs on every size file, on both bodies and at every supported pose. It runs inside the size pipeline, so it can no longer be skipped.
- Fixed:
  - the waistband-rim stretch (12.5–18.6), on every size;
  - the pants flip overruns at `walk` and `l-hip-60` for S, M and L on both bodies;
  - the shoulder failures of the neutral M and L T-shirts, which the new gates found.
- 11 of 16 size files pass and ship. Every recommended size passes (neutral L / L, personal M / M).
- 5 sizes still fail. As agreed, they are withheld: the size picker shows them disabled, with "This size isn't ready yet". Their grading fix is Sprint 3.7, after 4A (`docs/roadmap.md`).
- The secondary personal avatars ("photo estimate", "identity only") now wear v5.3 / pants-v3, and all four of those garments pass.

Personal results are status only.

## What the gates check

`services/garments/size_gates.py`, against each size's own avatar:

| Garment | Poses | Rule (source) |
| --- | --- | --- |
| Pants | `walk`, `l-hip-60`, `step`, `squat`, `wide` (leg-poses contract) | 0 vertices more than 3 mm inside the body; 0 flipped triangles inside the body; max edge stretch ≤ 4.0; flips ≤ 3 × the body skin's own flips at `walk`, `wide` and `l-hip-60` (Sprint 2.1A / 2.2A). The `step` and `squat` crease folds are the recorded 2.1A limitation and are reported, not gated. |
| T-shirt | arms raised 45 / 90 (left, right, both), both +120, arms lowered 20° standing and walking, the leg poses | The body's own shoulder gates, derived from its original (v1) shirt (Sprint 1.4A / 2.3A): both +90 max stretch ≤ half the original's; both +120 flips and self-intersections above rest ≤ the original's (neutral: 8.785 / 123 / 186). 0 vertices more than 3 mm inside the body at every pose. |

Sprint 3A gated sizes on penetration only. In Sprint 3.5 the personal shoulder search kept its best attempt even when every setting failed, and did not report it. Both gaps are closed.

## Before: the shipped Sprint 3.5 sizes

| Size | Pants, neutral | Pants, personal | T-shirt, neutral | T-shirt, personal |
| --- | --- | --- | --- | --- |
| S | FAIL: rim stretch 18.4 | PASS | PASS | PASS |
| M | FAIL: rim stretch 6.3 | FAIL: `l-hip-60` flips | FAIL: +90 stretch 11.05 | PASS |
| L | FAIL: rim stretch 18.6, flips `walk` 2/0, `l-hip-60` 64/24 | FAIL: `l-hip-60` flips | FAIL: +120 flips 752, self 1,322 | FAIL: +90 stretch, +120 flips and self |
| XL | FAIL: flips `walk` 2/0, `l-hip-60` 275/24 | FAIL: `walk`, `l-hip-60` flips | FAIL: 122 / 2,268 / 4,083 | FAIL: all three |

Penetration was 0 everywhere.

## Causes and fixes

**1. Waistband-rim stretch: slivers in the neutral sizes.**
- The worst triangle on neutral S had a 0.137 mm rest edge on the back of the waistband rim (y 0.966). It lengthened to about 2.5 mm while its three vertices moved together by 60–80 mm. That gives an edge ratio of 12.5–18.6 from a 2 mm change.
- The neutral sizes had 42–82 such slivers per pants file and 120–162 per shirt. The degenerate clean-up (Sprint 2.3A) ran on personal sizes only. The base pants have none: their smallest edge is 1.03 mm.
- **Fix:** the clean-up now runs on every body (`REVISIONS["3.5"]["clean_all"]`). Neutral max stretch drops to 3.23–3.58.

**2. Pants flips at `l-hip-60`: the hip corrective was solved only at 90°.**
- The hip corrective ramps from 20° to 90°, so at 60° the pants took 56 % of the 90° shape, and the groin crease of the looser sizes folded.
- Changing the ramp or scaling the morph does not solve this: at best the flips fell to 21 on neutral L while `walk` rose to 14.
- **Fix:** a chained 60° key. `corr_*_hip60` is solved at 60° (ramp [20, 60]), and `corr_*_hip90` holds only the correction beyond it (ramp [60, 90]), as `abd120` does beyond `abd90`. The garment now takes its solved shape at both keys (`CorrectiveSpec.base`, `leg_corrective_specs(hip_keys_deg)`, `REVISIONS["3.5"]["hip_keys_deg"] = (60, 90)`).
- On neutral L, `l-hip-60` falls from 64 to 8 flips (limit 24) and `walk` from 2 to 0. Personal L passes. The web needs no change: it drives whatever targets the sidecar lists (`corrective-morphs.md`, "Pants sizes").

**3. T-shirt shoulder gates (found by the new gates).** Two separate causes:
- **Shoulder-top folds at +120 on the neutral L shirt:** 735 of its 752 flips lie fully inside the corrective region. The graded shoulder cloth folds in the solved 120° shape itself. Larger regions and weaker 90° anchors leave it at 742–746 flips, and a weaker 120° anchor makes it 977. Compressible rest edges (`rest_edge_scale` 0, the pants' Sprint 2.1A membrane setting) give 95 flips, 139 self-intersections and +90 stretch 8.25: a pass.
- **Armpit stretch at +90 on larger personal sizes:** the over-stretched triangles lie at or beyond the edge of the fixed corrective region, which ends 0.21 m from the shoulder pivot. A wider region (0.22–0.29 m) reaches them.
- **Fix:** every body now searches the shoulder settings against its own gates (`REVISIONS["3.5"]["shoulder_search_all"]`). The candidates are the Sprint 2.3A settings first, then compressible edges, then compressible edges with the wider region and a 0.1 anchor at 90° (`personal_fit.SHOULDER_CANDIDATES_3_6`).
- Chosen settings: neutral S keeps the default, neutral M takes the 0.1 anchor at 90°, and neutral L takes compressible edges.

## After: the Sprint 3.6 sizes

Neutral, worst values over all poses:

| Size | Pants: `walk` / `l-hip-60` flips (limit) | Pants: max stretch | T-shirt: +90 stretch / +120 flips / +120 self (≤ 8.785 / 123 / 186) | Gates |
| --- | --- | --- | --- | --- |
| S | 0/0 · 0/24 | 3.23 | 7.05 / 18 / 21 | PASS / PASS |
| M | 0/0 · 2/24 | 3.54 | 8.64 / 8 / 9 | PASS / PASS |
| L (recommended) | 0/0 · 8/24 | 3.58 | 8.25 / 95 / 139 | PASS / PASS |
| XL | 4/0 · 274/24 | 3.61 | 8.81 / 924 / 655 | withheld / withheld |

Penetration (> 3 mm) and flipped triangles inside the body are 0 for every size, at every pose.

Personal:

| Size | Pants | T-shirt |
| --- | --- | --- |
| S | PASS | PASS |
| M (recommended) | PASS | PASS |
| L | PASS | withheld |
| XL | withheld | withheld |

## Withheld sizes

They are in `outputs/garments/sizes-withheld/`, each with a `.withheld.json` note. The web lists them as not ready and never serves their files.

| Size | Failing gates |
| --- | --- |
| `pants-v3-XL-neutral` | `walk`: flips (4, limit 0); `l-hip-60`: flips (274, limit 24) |
| `tshirt-v5.3-XL-neutral` | both +90 stretch (8.81, limit 8.785); both +120 flips (924, limit 123); both +120 self-intersections (655, limit 186) |
| `pants-v3-XL-personal-scaled` | `walk`: flips; `l-hip-60`: flips |
| `tshirt-v5.3-L-personal-scaled` | both +90 stretch |
| `tshirt-v5.3-XL-personal-scaled` | both +90 stretch; both +120 flips; both +120 self-intersections |

**What was tried, and why it stopped.** About 30 solver settings were scored on these sizes:
- for the shirts: region radii up to 0.25–0.33 m, compressible edges, 90° anchors down to 0.05, 50 iterations, and a weaker 120° anchor;
- for the XL pants: hip regions up to 0.30–0.42 m, a wider midline crossing, anchor 0.1, and keys at 45/90 and 30/60/90.

None passes.
- **XL pants:** the remaining folds are on the front waist (y 0.91–0.96), where XL is loose on both bodies. The best `l-hip-60` result was 108 flips against 24, and it made `squat` worse.
- **Shirts:** the +120 folds and the remaining personal +90 armpit stretch are inside the solved shapes.

These are folds of oversized cloth, not mesh defects. They need a grading change (shoulder and armhole of the L / XL shirts, waist and front rise of the XL pants), so the user scheduled Sprint 3.7 for it, after 4A.

## The gates in the size pipeline

- `generate_sizes.py` gates each size as soon as it is written. The gates run in the collision tool's environment (its trimesh, Embree and rtree), as a subprocess.
- The report, `<entries>/<name>.gates.json`, records the GLB's SHA-256 and is reused on resume.
- A failing size is moved to `sizes-withheld/` with a note. A failing recommended size stops the run.
- The run report lists the withheld and the passed sizes.
- `evaluate_sizes.py` also runs the gates (`--skip-deformation` turns them off).
- `tests/test_size_gates.py` fails if any shipped size, or any garment in the personal manifest, lacks a passing gate report for its exact bytes. It also fails if a withheld size lacks a failing report, or is recommended.
- **Web** (`lib/garment/withheldSizes.ts`, both size routes, `FitControls`):
  - the size routes list withheld sizes as `{size, withheld: true}`;
  - the picker renders each as an `aria-disabled` button, so it stays reachable by keyboard;
  - its `role="tooltip"` description appears on hover and on keyboard focus.

  Checked in Chrome: neutral shows XL withheld for top and bottom; personal shows L and XL tops and the XL bottom. Clicking a withheld size keeps the selection.

## Secondary personal avatars on v5.3

`generate_tshirt.py --rules v5.3` and `generate_pants.py --version v3` were run with `--reconstruction` and `--personal-only`. Their personal fits use the 3.6 shoulder candidates and hip keys. `personal_manifest.py` was rewritten for the calibrated layout and regenerated the manifest:
- the primary body wears its recommended sizes;
- "photo estimate" and "identity only" wear their v5.3 / v3 base fits.

All four new garments pass `size_gates.py`, and both shirts layer over their pants (≥ 3 cm overlap, no containment, intersections or under-layering). Status only. The previous manifest is kept as `manifest.sprint-3.5.json`, and the previous sizes as `outputs/garments/sizes-3.5/`.

## Other gates

| Gate | Result |
| --- | --- |
| Penetration > 3 mm, rest and every supported pose (`evaluate_sizes.py`), 11 shipped sizes | PASS (deepest 2.22 mm, neutral M shirt) |
| Layering (≥ 3 cm overlap, no containment or intersections, shirt outside) | 15 / 18. The 3 failures are the known shirt S personal case: overlap 2.7–2.8 cm, 0 containment, 0 intersections. That is the same overlap as Sprint 3.5 and the promotion, so it stays a known case, not a regression (the 4th pairing of 3.5 was over the now-withheld XL pants). Neutral: all 12 pass. |
| UV layout v3, STRICT, every panel of every shipped size (`test_uv_v3`) | PASS |
| Python tests | garments 80, reconstruction 19, collision 3: OK |
| Web: typecheck, lint, `npm test`, build | PASS |
| Byte-for-byte regeneration | base garments v1, v2, v4, v5, v5.1, v5.2, v5.3 and pants v1, v2, v3: 10 / 10 identical (sidecars included). Neutral 3.6 sizes rerun: 26 / 26 files identical (shipped and withheld). Legacy `--revision 3a` S pants: identical to `sizes-v5.2/`. |
| Recommended sizes | unchanged: neutral L / L, personal M / M |

**Legacy generation (`?gen=v5.2`, kept through 4A), gated for information:** 4 of 16 pass (shirt S on both bodies, shirt M personal, pants S personal). The other 12 fail in the same patterns as v5.3 did before 3.6. They are left in place as the comparison generation; see "Not done".

## Files

- `services/garments/size_gates.py` (new): the gates.
- `generate_sizes.py`: clean-up on every body, chained hip keys, shoulder search on every body, gates and withholding.
- `evaluate_sizes.py`: also runs the gates.
- `correctives.py`: `CorrectiveSpec.base` (chained keys).
- `pants.py`: `leg_corrective_specs(hip_keys_deg)`.
- `personal_fit.py`: `SHOULDER_CANDIDATES_3_6`; `fit_shoulders(candidates)`.
- `generate_tshirt.py`, `generate_pants.py`: the 3.6 settings for personal v5.3 / v3 fits. The neutral bases are unchanged.
- `personal_manifest.py`: the calibrated layout, v5.3 / v3.
- Tests: `tests/test_size_gates.py` (new); `test_sizes.py` (3.6 reports, withheld sizes skipped); `test_personal_fit.py` (the builder reproduces the manifest).
- Web: `lib/garment/withheldSizes.ts` (new), `app/api/size-garment/route.ts`, `pages/api/personal-size-garment.ts`, `components/FitControls.tsx`, `TryOn.tsx`, `AvatarLab.tsx`, `app/globals.css`, `tests/fit-route.test.mjs`.
- Docs: `docs/contracts/fit-map.md` (gates and withheld sizes), `docs/contracts/corrective-morphs.md` (pants sizes: 60° key), `docs/roadmap.md` (new).

## Not done

- **The 5 withheld sizes:** Sprint 3.7, after 4A.
- **Legacy v5.2 sizes:** 12 of 16 fail the gates. They are the comparison generation, retired after 4A, and are neither withheld nor rebuilt. Withholding them is a user decision.
- **Pants v3.1 candidate** (branch `pants-v3.1-knee`): its sizes were built with the Sprint 3.5 pipeline (no clean-up, no 60° key). It must be rebuilt on the 3.6 pipeline before it can be promoted.
