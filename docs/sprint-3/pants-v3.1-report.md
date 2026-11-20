# Pants v3.1: no knee step (the default since 2026-11-19)

**Result: the knee step is gone on every v3.1 file. All the gates from Sprint 3.5 give the same results as on pants v3.** The largest 1 cm gap change on the leg falls from 8.3–11.9 mm (v3) to 3.0–3.9 mm (v3.1), on both bodies and every size. The change now tapers over about 9 cm (it was a jump within 1 cm). v3.1 is a candidate: it is not the default, and the manifest is unchanged. It is served in development with `/try-on?gen=v5.3&pants=v3.1`. A browser check of the heatmap band comes before any promotion.

## The defect

Seen in the browser on pants v2 and v3: a horizontal step at knee height, front and back, stronger on personal-scaled with the heatmap on.

**Cause.** `pants.py` built each leg from two parts, each cut by a horizontal plane, then united them:

- the thigh: the body offset by 22 mm ease, cut at knee + 5 cm;
- the lower leg: a straight tube (widest section below the knee + 12 mm), with a flat top at knee + 10 cm.

Where the tube stands outside the thigh offset (back and outer side), its flat top makes the gap jump by 7–12 mm within 1 cm. The leg's `_EASE_MM` is the measured gap itself (fit-map contract), so the heatmap shows the jump as a colour band: 21 → 32 mm on neutral M, 22 → 37 mm on personal M.

**Ruled out:**

- An ease jump between regions: the thigh ease is constant from the knee to the crotch.
- A panel boundary: pants v2 (no panels) has the identical step.
- The knee corrective: measured in the rest pose, with no morphs applied.

## The fix

`PantsRules.knee_blend_m` (v3.1: 0.10 m; 0 keeps the cut planes, so v1–v3 are byte-identical). Below the crotch seam, each leg's field morphs from the thigh offset to the tube along the leg axis:

    (1 − s) · thigh_offset + s · tube

`s` is a smoothstep over 10 cm, centred midway between the two old planes (knee + 7.5 cm). There is no cut plane. Clearance is unchanged: the same vertices pushed, an 8 mm minimum and 0 inner violations. The knee correctives are re-solved on the new mesh (`corr_*_knee90`, e.g. max offset 53.3 → 52.8 mm on the neutral base).

Band variants were tried on personal-scaled: 8, 10, 12, 14 and 16 cm long, centred from the knee joint up to knee + 7.5 cm, plus extra knee ease (30 and 34 mm). They change the knee band only. None changes the gap below the knee (next section), so 10 cm was kept.

## Acceptance rule (agreed during the work)

The gap is measured per leg, per sector (front, back, outer side, inner side) and per 1 cm height bin. It is the median distance from the outer surface to the body surface (`services/garments/leg_profile.py`, `tests/test_knee_step.py`). The rule depends on the zone:

| Zone | Rule |
| --- | --- |
| Crotch down to the bottom of the blend (knee + 2.5 cm) | Largest 1 cm change ≤ 4 mm, every sector |
| Straight tube (from there to the cuff) | ≤ 4 mm, or, where v3 already exceeds 4 mm, no worse than the same v3 file + 0.3 mm |
| Turned-in cuff (hem + 5 cm) | Reported only: it narrows on purpose (Sprint 2.1A) |

The straight-tube zone is the v3 tube, unchanged. Under it the gap follows the body's relief: the kneecap, the tibial tuberosity and the head of the fibula. On v3 that relief already gives 4.1–4.5 mm at a few bins, bin for bin the same on v3.1.

The "≤ 4 mm, or no worse than v3" form is a clarification of "no worse than v3". The smoothstep's tail reaches about 1 cm into this zone, so one bin can change by more than on v3 and still stay under 4 mm. Example: XL neutral, inner side, 3.6 mm against 2.8 mm on v3.

## Before and after: gap profile at the knee

Neutral base pants, left leg, median gap in mm (knee joint at y = 0.49 m). The right leg is symmetric.

| Height above knee (cm) | back v3 | back v3.1 | outer v3 | outer v3.1 | front v3 | front v3.1 | inner v3 | inner v3.1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| −3.8 | 19 | 19 | 36 | 36 | 43 | 43 | 32 | 32 |
| −1.8 | 23 | 23 | 38 | 38 | 36 | 36 | 27 | 27 |
| +0.2 | 26 | 26 | 41 | 41 | 30 | 30 | 23 | 23 |
| +2.2 | 29 | 29 | 42 | 41 | 24 | 24 | 19 | 19 |
| +4.2 | 31 | 31 | 39 | 39 | 20 | 19 | 16 | 15 |
| +5.2 | 32 | 31 | 40 | 39 | 22 | 17 | 22 | 16 |
| +6.2 | 33 | 31 | 40 | 38 | 23 | 17 | 23 | 16 |
| +7.2 | 33 | 30 | 40 | 35 | 23 | 18 | 23 | 18 |
| +8.2 | 34 | 30 | 39 | 32 | 23 | 19 | 24 | 20 |
| +9.2 | 34 | 27 | 39 | 30 | 23 | 21 | 24 | 21 |
| +10.2 | 34 | 25 | 38 | 27 | 23 | 22 | 23 | 22 |
| **+11.2** | **32** | 24 | **33** | 25 | 23 | 23 | 23 | 23 |
| **+12.2** | **24** | 24 | **25** | 24 | 23 | 23 | 23 | 23 |
| +14.2 | 23 | 23 | 23 | 23 | 23 | 23 | 23 | 23 |

On v3 the back and outer gap drops 8 mm between knee + 11.2 and + 12.2 cm: the tube's flat top. On v3.1 the same change spreads from knee + 4 to + 13 cm. Front and inner come up to 6 mm closer to the body in the blend (minimum 15–16 mm; the clearance floor is 8 mm), then return to the 23 mm thigh gap. Neutral size M reads the same, within 1 mm.

**Largest 1 cm change per file** (both legs, all sectors, mm):

| File | Leg zone v3 → v3.1 (≤ 4) | Straight tube v3 → v3.1 | Cuff (reported) |
| --- | --- | --- | --- |
| Neutral base | 8.9 → **3.0** | 4.0 → 4.0 | 16.1 → 16.1 |
| Neutral S | 8.4 → **3.9** | 4.5 → 4.5 | 14.3 → 14.3 |
| Neutral M | 8.3 → **3.2** | 4.1 → 4.1 | 16.2 → 16.2 |
| Neutral L | 8.9 → **3.7** | 4.5 → 4.5 | 20.8 → 20.8 |
| Neutral XL | 9.2 → **3.4** | 3.7 → 3.7 | 27.1 → 27.1 |
| Personal-scaled S, M, L, XL | FAIL → **PASS** | PASS (no worse than v3) | reported |

Personal results are status only.

## Gates

| Gate | v3.1 | Same as pants v3? |
| --- | --- | --- |
| Knee step (`test_knee_step.py`), 9 files | PASS | v3 fails (8.3–11.9 mm) |
| Validator (stretch, flips, intersections, rest clearance), base + 8 sizes | 9 / 9 PASS | yes |
| Penetration > 3 mm, every leg pose (walk, l-hip-60, step, squat, wide) and seated | 0 everywhere | yes |
| Flipped triangles inside the body | 0 everywhere | yes |
| Max stretch, every pose | identical to v3 at every pose and size, except L personal at `squat` (lower) | yes (see the finding below) |
| Flip count, `walk` / `wide` / `l-hip-60` | identical to v3 | yes |
| Flip count, `step` / `squat` / `seated` (self-overlap folds, Sprint 2.1A known limitation) | −1 % to +5 % against v3 | changed by the re-solved knee correctives |
| Layering: v5.3 shirts over v3.1 pants | 32 / 36 PASS | yes: the 4 are shirt S personal, overlap 2.7–2.8 cm, 0 penetration, identical values |
| UV layout v3, STRICT, every panel | PASS (0 folds; up angles within the v3 limits) | yes |
| Byte-for-byte regeneration (v1 … v5.3, pants v1, v2, v3, v3.1) | 11 / 11 identical | v1–v3 unchanged by the new rule |
| Recommended sizes | neutral L, personal M | unchanged |

**Seated** is a gate-only pose (both hips and knees at 90°). It is not in the leg-poses contract, so the web poses are unchanged. On the neutral base pants it gives 0 penetration and 0 in-body flips. Its max stretch is 4.25, above the 4.0 limit, identically on v3. That triangle is at the back of the crotch seam (y 0.77), not at the knee.

**Finding, pre-existing, not caused by v3.1: stretch on the size files.** The Sprint 3A size gates checked penetration only. With the Sprint 2.1A pants rules applied to the sizes, several neutral sizes exceed max stretch 4.0 because of a single triangle on the back of the waistband rim (y 0.966): 12.5 at `l-hip-60` and 18.4–18.6 at `step` on S and L. The 99th percentile stays at 1.5–2.3. Some sizes also exceed the flip limit at `walk` / `l-hip-60` (e.g. L neutral 64 / 24). Values are identical on v3 and v3.1, so this belongs to the size pipeline (Sprint 3A), with its own follow-up.

## Files

- `services/garments/pants.py`: `knee_blend_m`, `PANTS_V3_1_RULES`.
- `generate_pants.py --version v3.1`; `generate_sizes.py --revision 3.5-knee --garments pants` writes to `outputs/garments/sizes-pants-v3.1/`.
- `services/garments/leg_profile.py` and `tests/test_knee_step.py` (new). `test_uv_v3.py` and `test_sizes.py` now also cover the v3.1 files.
- Web (`lib/garment/generation.ts`): the development-only candidate `?gen=v5.3&pants=v3.1` uses v5.3 shirts from `sizes/` and pants-v3.1 from `sizes-pants-v3.1/`. It is also in the lab's generation and pants selectors. In production the candidate falls back to the default.

## Not done

- Browser check of the heatmap band (before any promotion).
- The waistband-rim stretch and the size flip counts above (Sprint 3A follow-up).

## Promotion, pants only (2026-11-20)

The browser check of the heatmap band was done on My avatar, with the heatmap on, front and back. The network log confirmed the `pants=v3.1` files. The knee step is gone, and v3.1 was visually approved. **pants-v3.1 is now the default bottom. The shipped shirts are the Sprint 3.6 shirts, unchanged, so no UV changes.**

### Pants rebuilt through the Sprint 3.6 pipeline

The rebuild used the full 3.6 pipeline: clean-up on every body, chained 60 / 90° hip correctives, and the size gates with withholding.

| Gate | Result |
| --- | --- |
| Size gates: stretch, flips and penetration at every supported pose | S, M and L pass on both bodies. XL is withheld on both bodies (`walk` / `l-hip-60` flips), as XL v3 was. |
| Neutral pants, worst over the poses | `l-hip-60` flips 0 / 2 / 8 (S / M / L, limit 24), `walk` 0, max stretch 3.23 / 3.54 / 3.58, penetration 0, flipped inside the body 0. Identical to the pants-v3 sizes of 3.6. |
| Knee step, largest 1 cm gap change on the leg (limit 4 mm) | Neutral base 3.0 mm, S 3.9, M 3.2, L 3.7. The straight tube is unchanged from v3. Personal sizes pass. |
| UV layout v3, STRICT (`test_uv_v3`) | Pass, base and sizes. |
| Secondary personal avatars (their v5.3 shirt over a v3.1 pants fit) | All four garments pass their gates and both pairs layer. Status only. |
| Byte-for-byte regeneration | The v3.1 base pants and a v3.1 size (neutral M) are identical. |

### The shipped 3.6 shirts over the v3.1 pants

| Check | Result |
| --- | --- |
| Layering (≥ 3 cm overlap, no containment or intersections, shirt outside): every shipped shirt over every shipped v3.1 pants size of its body, plus the v3.1 base | 15 / 18 pass. The 3 failures are the known shirt S personal case: overlap 2.7–2.8 cm, 0 containment, 0 intersections, the same values as in Sprints 3.5 and 3.6. Neutral: all 12 pass. |
| Penetration > 3 mm, rest and every supported pose | 11 / 11: 5 shirts and 6 v3.1 pants sizes. |
| Posed gates for the 5 shirts (stretch, flips, shoulder gates) | All pass. They test the shirt against the body; there is no posed shirt-over-pants check. |
| Byte-for-byte | `generate_sizes.py` (revision 3.6) rebuilds the neutral S shirt identical to the shipped one. |

### Why the shirts were not rebuilt over the v3.1 pants

A full rebuild of the shirts over pants-v3.1 passed every size gate, but the personal S shirt's front-panel up angle rose from 7.66 to 8.93° (guard 8.16°). A render of the stripe fixture showed it: the waist and upper-hem stripes tilt 1.7° more (0.7 → 2.4°, 1.5 → 3.2°); the chest and hem do not change. The renders are personal and stay local (`outputs/garment-tests/sprint-3.6/v3.1/uv-tilt-check/`).

**The cause is the shirts' layering envelope, not the pants.**
- The v3 and v3.1 pants are **bit-identical above 0.70 m**, on the base and on every size of both bodies: every vertex of the waistband, hips and upper thigh is at distance 0.
- The only differences are the knee band and a narrow strip just above it (0.64–0.70 m): up to 0.4 mm neutral and 2.5 mm personal, carried there by the whole-mesh smoothing.
- `sizes.GarmentEnvelope` represents each pants mesh by 120,000 surface points, drawn at random (seed 7) and weighted by triangle area over the **whole** mesh. Changing the legs re-rolls every sample, including the waistband's.
- At the S shirt's vertices, the v3 and v3.1 envelopes read up to 18 mm apart (p99 1 mm). The same v3 pants with only the seed changed (7 → 8) read up to 19.6 mm apart. The shirt's hem push follows these readings.
- `outward_faces` adds a little: it classifies faces against the whole mesh's mean vertex, and 1 to 7 faces above 0.70 m change class.

**Stopgap until Sprint 3.7.** Revision 3.6 layers its shirts over the pants-v3 sizes archived in `sizes-3.6-v3/` (`REVISIONS["3.6"]["shirt_envelope"]`), so the default pipeline reproduces the shipped shirts byte for byte. Sprint 3.7 makes the envelope deterministic in the region it judges, then rebuilds the shirts over pants-v3.1 and checks their UV up angles (`docs/roadmap.md`).

### Files

- `outputs/garments/sizes/` holds the 3.6 `tshirt-v5.3` sizes (unchanged) and the `pants-v3.1` sizes; `sizes-withheld/` holds the same five withheld sizes as in 3.6, the XL pants now in v3.1.
- The Sprint 3.6 set (shirts and pants v3) is archived in `sizes-3.6-v3/` and `sizes-3.6-v3-withheld/` (`generate_sizes.py --revision 3.5`). The rejected full rebuild is kept in `sizes-default-v3.1-rejected-tilt/`. The previous manifest is `manifest.sprint-3.6-v3.json`.
- `generate_sizes.py` defaults to revision 3.6 (tshirt-v5.3 / pants-v3.1). The personal manifest dresses every body in pants-v3.1.
- **Web:** pants-v3.1 is the default bottom of generation v5.3. The `?pants=v3.1` candidate parameter is gone. A wardrobe item with template `pants-v3` is shown on pants-v3.1: same panels and UV layout, so its texture fits.
