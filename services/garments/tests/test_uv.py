"""UV layout v2 (docs/contracts/garment-texture.md): texel density, islands and orientation of the generated GLBs."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from garment_glb import read_glb, skinned_primitive  # noqa: E402
from uv_layout import FIT_3A, LAYOUTS, STRICT, density_check, glb_outer_faces  # noqa: E402

PROJECT = Path(__file__).resolve().parents[3]
GARMENTS = PROJECT / "outputs" / "garments"


NEUTRAL_BASE = {"tshirt-v5.2-mhr-neutral.glb", "pants-basic-v2-mhr-neutral.glb"}


# Expected failures of the overlap/fold bounds (docs/contracts/garment-texture.md, "Known limitations"): ARAP folds the
# flattening at the underarm slivers (L/XL) or the back of the shoulder tops (S personal). Sprint 3.5's per-panel seams
# remove both causes; this test fails when a listed file passes, so the list must shrink with the fix.
KNOWN_FOLDS = {
    "tshirt-v5.2-L-personal-scaled.glb": "underarm slivers flipped; torso overlap 2.0% with them excluded (Sprint 3.5)",
    "tshirt-v5.2-XL-neutral.glb": "underarm slivers flipped; torso overlap 1.8%, right sleeve 1.15% (Sprint 3.5)",
    "tshirt-v5.2-XL-personal-scaled.glb": "underarm slivers flipped (0.0207% of the torso); torso overlap 0.6%, sleeves 0.9-1.0% (Sprint 3.5)",
    "tshirt-v5.2-S-personal-scaled.glb": "back of the shoulder tops folded over the neckline; torso overlap 0.71% (Sprint 3.5)",
}


def bounds_for(path: Path) -> dict[str, float]:
    """STRICT for the neutral base garments; the documented Sprint 3A envelope for personal fits and sizes."""
    return STRICT if path.name in NEUTRAL_BASE else FIT_3A


def uv_glbs() -> list[tuple[Path, str]]:
    found = [(GARMENTS / "experiments" / "tshirt-v5.2-mhr-neutral.glb", "tshirt"), (GARMENTS / "pants-basic-v2-mhr-neutral.glb", "pants")]
    found += [(p, "tshirt") for p in sorted((GARMENTS / "personal").glob("tshirt-v5.2-*.glb"))]
    found += [(p, "pants") for p in sorted((GARMENTS / "personal").glob("pants-basic-v2-*.glb"))]
    found += [(p, "tshirt") for p in sorted((GARMENTS / "sizes").glob("tshirt-v5.2-*.glb"))]
    found += [(p, "pants") for p in sorted((GARMENTS / "sizes").glob("pants-v2-*.glb"))]
    return [(p, kind) for p, kind in found if p.is_file()]


@unittest.skipUnless(uv_glbs(), "generate tshirt-v5.2 / pants-v2 first")
class UVLayoutTests(unittest.TestCase):
    def test_density_islands_and_anisotropy(self) -> None:
        for path, kind in uv_glbs():
            document, blob = read_glb(path)
            data = skinned_primitive(document, blob)
            uv = data["TEXCOORD_0"].astype(np.float64)
            outer = glb_outer_faces(data["indices"], uv)
            report = density_check(data["POSITION"].astype(np.float64), outer, uv, data["_REGION"], kind)
            self.assertEqual(set(report), {island.name for island in LAYOUTS[kind]["islands"]}, path.name)
            bounds = bounds_for(path)
            fold_violations = []
            for name, island in report.items():
                label = f"{path.name} {name}"
                self.assertEqual(island["uv_corners_outside_island"], 0, label)
                folds_ok = (island["uv_overlap_excluding_folded_pct"] < bounds["overlap_excluding_folded_pct"]  # edge pixels only
                            and island["folded_pct"] <= bounds["folded_pct"] and island["folded_area_cm2"] <= bounds["folded_area_cm2"])
                if not folds_ok:
                    fold_violations.append(name)
                if path.name not in KNOWN_FOLDS:
                    self.assertLess(island["uv_overlap_excluding_folded_pct"], bounds["overlap_excluding_folded_pct"], label)
                    self.assertLessEqual(island["folded_pct"], bounds["folded_pct"], label)
                    self.assertLessEqual(island["folded_area_cm2"], bounds["folded_area_cm2"], label)
                self.assertGreaterEqual(1 - island["outside_tolerance_pct"] / 100, bounds["min_within_tolerance"], label)
                self.assertLessEqual(island["anisotropy_p99"], bounds["anisotropy_p99"], label)
                self.assertAlmostEqual(island["median_density_uv_per_m"], LAYOUTS[kind]["density"], delta=0.03, msg=label)
            if path.name in KNOWN_FOLDS:  # expected failure: still folded, else remove it from KNOWN_FOLDS
                self.assertTrue(fold_violations, f"{path.name} now passes the overlap/fold bounds: remove it from KNOWN_FOLDS")
            self.assertTrue((uv >= 0).all() and (uv <= 1).all(), path.name)

    def test_up_runs_along_plus_v_and_the_outside_is_not_mirrored(self) -> None:
        for path, kind in uv_glbs()[:2]:
            document, blob = read_glb(path)
            data = skinned_primitive(document, blob)
            uv, positions = data["TEXCOORD_0"].astype(np.float64), data["POSITION"].astype(np.float64)
            outer = glb_outer_faces(data["indices"], uv)
            region = np.asarray(data["_REGION"]).astype(int)
            for island in LAYOUTS[kind]["islands"]:
                face_region = np.array([np.bincount(row, minlength=8).argmax() for row in region[outer]])
                faces = outer[np.isin(face_region, island.regions)]
                vertices = np.unique(faces)
                slope = np.linalg.lstsq(np.column_stack([uv[vertices], np.ones(len(vertices))]), positions[vertices, 1], rcond=None)[0]
                self.assertGreater(slope[1], 0, f"{path.name} {island.name}: up must run along +v")
                self.assertGreater(abs(slope[1]), 5 * abs(slope[0]), f"{path.name} {island.name}: up must be aligned with v")


if __name__ == "__main__":
    unittest.main()
