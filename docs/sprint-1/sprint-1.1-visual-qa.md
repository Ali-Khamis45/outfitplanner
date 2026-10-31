> **Superseded in part (Sprint 1.1 final):** the experimental "underarm candidate" and `/api/garment-candidate` described here were replaced by the v1 / v2 / v2-LOD selector; see [sprint-1.1-report.md](sprint-1.1-report.md) and [browser-verification.md](browser-verification.md). User observations below remain valid as recorded.

# Sprint 1.1 — targeted visual QA

## Status

The user reported that the full body, separate shirt, sleeve movement, body wireframe and approximate floor contact were visible in a real browser. They also reported underarm fins, body and shirt speckling, uncertain shirt wireframe, a boxy waist, and uncertainty about the active body. These are user observations; no new visual browser test was available in this session. Browser automation reported an unavailable access host and native pipe.

| Area | Status | Evidence and limitation |
| --- | --- | --- |
| Separate wireframe controls | PASS (automated state test); NOT TESTED (browser) | Body and garment flags are independent. The existing mesh and cloned materials are used; no coplanar wireframe overlay is added. |
| Speckling diagnosis | NOT TESTED (browser) | The old code used one wireframe flag for both meshes, with shadow reception enabled on both. Self/cross-shadow artifacts are plausible, but no browser rendering was available to establish the root cause; z-fighting, shell overlap and depth-buffer effects remain unruled-out. |
| Speckling mitigation | NOT TESTED (browser) | While either inspection wireframe is enabled, body and garment temporarily stop receiving shadows; solid mode restores shadow reception. Depth testing remains enabled, the floor and shadow caster remain intact, and mesh geometry is unchanged. Whether this removes the observed speckling needs visual verification. |
| Active avatar and file | PASS (code/typecheck); NOT TESTED (browser) | The active source and local filename appear in the inspector and desktop heading. The GLB itself has no reliable rest-pose metadata, so a personal selection is correctly labelled “as exported”; the UI does not infer rest pose from a filename. |
| Underarm deformation | FAIL | A comparison candidate improves the measured baseline but still fails the quality gate and may still show fins. The original remains the default. |
| Waist silhouette | FAIL / candidate only | An isolated taper narrowed the measured waist but produced substantial self-intersection regressions. It was not promoted. |
| Raised-arm comparison | PASS (code/tests); NOT TESTED (browser) | The pose button toggles rest/both-90, and the garment selector switches original vs explicitly labelled experimental neutral-body candidate at the same pose. |
| Personal-file privacy | PASS (code/HTTP check); NOT TESTED (browser network inspection) | Personal GLBs use the existing browser blob workflow; a direct personal outputs URL returned 404. The new candidate route serves only a fixed, non-personal local demo file. |

## Underarm comparison

Measured with the existing Three.js skinning and approximate geometry diagnostics at the `both-90` pose, not from browser screenshots:

| Metric | Original neutral shirt | Experimental `proj-dc3` neutral shirt |
| --- | ---: | ---: |
| Triangle-edge stretch P99 | 3.0252× | 2.7041× |
| Maximum triangle-edge stretch | 17.5707× | 15.5198× |
| Flipped triangles | 20 | 5 |
| Self-intersection pairs above rest | 14 | 9 |
| Approximate body penetrations beyond 3 mm | 0 | 0 |

The candidate retains the original neutral MHR skeleton and passes the garment validator at rest, including normalized weights and inverse-bind matching. Nevertheless, the provisional limits are P99 ≤ 1.6×, max ≤ 3×, no flipped triangles and no added self-intersections. It fails those criteria. The candidate is available through the selector only as an **experimental** comparison, not as a corrected default. Its file is `outputs/garments/experiments/tshirt-proj-dc3-mhr-neutral.glb`; if absent the fixed route returns 404. It does not accept arbitrary paths.

The original nearest-body transfer can give adjacent underarm vertices different four-joint subsets after truncation; the preceding experiments and quality reports also show that smooth weights or an underarm cut alone do not solve collision and deformation simultaneously. Further seam construction or pose-aware correction must be evaluated against the complete pose and collision suite before promotion.

## Waist experiment

The original garment field extends the chest silhouette vertically down to the hem, explaining the straight sides in its construction. An isolated taper of at most 10 mm per side reduced the measured x-width in the sampled waist band from 0.4294 m to 0.4100 m. Approximate rest validation found zero penetrating vertices and minimum clearance 5.95 mm. However, its geometry diagnostics counted 2,995 rest self-intersection pairs versus 174 for the original, and 1,170 additional pairs in torso twist. These approximate tests do not establish appearance, but the regression is sufficient to reject this candidate. The active demo silhouette is unchanged.

## Commands and results

- `npm.cmd run typecheck` and `npm.cmd run lint`: PASS.
- `npm.cmd test`: PASS, including MHR loader, existing neutral/personal garment binding and independent wireframe-state test.
- `python -m unittest discover -s services/garments/tests -q` in `external/mhr-venv`: 6 PASS.
- `validate_garment.py` on the underarm and waist candidates against `mhr-neutral.glb`: PASS for structural/skinning/rest-clearance checks; this is not a pass for posed deformation.
- Existing Three.js pose diagnostics: underarm candidate and waist candidate FAIL the posed quality criteria above; metrics were read from ignored `outputs/garment-tests/`.
- `npm.cmd run build` in the host context: PASS; `/api/garment-candidate` included.
- Candidate HTTP response: 200, 5,449,932 bytes, SHA-256 matched its fixed non-personal file. A personal-output path returned 404. These HTTP checks do not prove browser rendering or the absence of all possible leakage.
- Browser automation: NOT TESTED, host unavailable. User-reported observations are preserved separately in [browser-observations.md](browser-observations.md).

## Manual browser recheck

1. Open `/lab`; confirm the active source says **Neutral · MHR**. Select **Personal**, choose the intended rest-shape avatar GLB, and verify its filename and pose; choose its matching local garment. The app does not infer that an arbitrary personal GLB is a rest pose. Both stay browser-local.
2. Toggle **Body wireframe** and **Garment wireframe** independently and together. Inspect front/back/sides for triangle visibility and black speckling; return both to solid and check that shading and floor shadows return. Record browser/GPU and whether the speckles change.
3. On the neutral body select **Original T-shirt**, use **Compare: raise both arms**, then switch to **Underarm candidate · experimental** without changing the pose. Orbit around both armpits and compare. Repeat at rest. Do not call the candidate corrected unless visual checks and the quality gate both pass.
4. Confirm whether the current waist is still too boxy. The isolated waist candidate was rejected and is not displayed by default. Check neutral and personal rest-pose floor alignment separately.

No SAM reconstruction source, model checkpoints or personal identity parameters were changed in this task.
