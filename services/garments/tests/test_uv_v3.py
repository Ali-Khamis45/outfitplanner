"""UV layout v3 (Sprint 3.5): one island per pattern panel on tshirt-v5.3 / pants-v3 (docs/contracts/garment-texture.md).

Every panel of every candidate GLB (neutral base garments and every size) meets the STRICT bounds: texel density within
+/-15% of the panel median for >= 99% of triangles, anisotropy p99 <= 1.35, no folded triangles, overlap < 0.5% (edge
pixels), no UV outside the panel's rectangle, 0.45 UV/m. The up angle (area-weighted, garment up vs +v) of each panel
must stay at or below UP_ANGLE_LIMIT_DEG: the largest value measured over all candidate GLBs when the layout was
introduced, plus 0.5 deg, so it guards against regressions rather than setting a loose bound. The gusset has no limit:
it lies under the crotch, where garment up has no direction on the cloth (garment-texture.md).
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from garment_glb import read_glb, skinned_primitive  # noqa: E402
from uv_layout import PANEL_LAYOUTS, STRICT, glb_outer_faces, panel_check  # noqa: E402

PROJECT = Path(__file__).resolve().parents[3]
GARMENTS = PROJECT / "outputs" / "garments"

# Measured maximum over the 18 candidate GLBs when layout v3 was introduced (Sprint 3.5 report) + 0.5 deg.
UP_ANGLE_LIMIT_DEG: dict[tuple[str, str], float] = {
    ("tshirt", "front"): 7.66 + 0.5,  # S personal (the most pushed-out hem)
    ("tshirt", "back"): 8.72 + 0.5,  # S personal; 2.36 on the neutral base garment
    ("tshirt", "sleeve_left"): 9.91 + 0.5,  # XL personal
    ("tshirt", "sleeve_right"): 7.96 + 0.5,  # XL personal
    ("pants", "left_front"): 7.30 + 0.5,
    ("pants", "left_back"): 4.48 + 0.5,
    ("pants", "right_front"): 7.25 + 0.5,
    ("pants", "right_back"): 4.55 + 0.5,
}
UP_ANGLE_EXEMPT = {("pants", "gusset")}


def v3_glbs() -> list[tuple[Path, str]]:
    found = [(GARMENTS / "experiments" / "tshirt-v5.3-mhr-neutral.glb", "tshirt"), (GARMENTS / "pants-basic-v3-mhr-neutral.glb", "pants")]
    found += [(p, "tshirt") for p in sorted((GARMENTS / "sizes").glob("tshirt-v5.3-*.glb"))]
    found += [(p, "pants") for p in sorted((GARMENTS / "sizes").glob("pants-v3-*.glb"))]
    return [(p, kind) for p, kind in found if p.is_file()]


def check(path: Path, kind: str) -> dict:
    document, blob = read_glb(path)
    data = skinned_primitive(document, blob)
    uv = data["TEXCOORD_0"].astype(np.float64)
    return panel_check(data["POSITION"].astype(np.float64), glb_outer_faces(data["indices"], uv), uv, data["_PANEL"], kind), uv


@unittest.skipUnless(v3_glbs(), "generate tshirt-v5.3 / pants-v3 first")
class UVLayoutV3Tests(unittest.TestCase):
    def test_every_panel_meets_strict_bounds_and_its_up_angle_limit(self) -> None:
        for path, kind in v3_glbs():
            report, uv = check(path, kind)
            self.assertEqual(set(report), {island.name for island in PANEL_LAYOUTS[kind]["islands"]}, path.name)
            for name, panel in report.items():
                label = f"{path.name} {name}"
                self.assertEqual(panel["uv_corners_outside_island"], 0, label)
                self.assertEqual(panel["folded_triangles"], 0, label)
                self.assertLess(panel["uv_overlap_pct"], STRICT["overlap_excluding_folded_pct"], label)
                self.assertGreaterEqual(1 - panel["outside_tolerance_pct"] / 100, STRICT["min_within_tolerance"], label)
                self.assertLessEqual(panel["anisotropy_p99"], STRICT["anisotropy_p99"], label)
                self.assertAlmostEqual(panel["median_density_uv_per_m"], PANEL_LAYOUTS[kind]["density"], delta=0.03, msg=label)
                if (kind, name) not in UP_ANGLE_EXEMPT:
                    self.assertIn((kind, name), UP_ANGLE_LIMIT_DEG, f"no up-angle limit recorded for {kind} {name}")
                    self.assertLessEqual(panel["up_angle_mean_deg"], UP_ANGLE_LIMIT_DEG[(kind, name)], label)
            self.assertTrue((uv >= 0).all() and (uv <= 1).all(), path.name)

    def test_the_back_chevron_is_gone(self) -> None:
        """The 3A chevron came from the torso being one tube cut at the centre back: the two cut edges met there with
        opposite tilts (12.4 deg on the neutral torso). In v5.3 no seam runs down the middle of the back: the back panel
        has no seam copies (split vertices at the same position) near x = 0, and on the neutral base garment it reads
        under 3 deg."""
        for path, kind in v3_glbs():
            if kind != "tshirt":
                continue
            data = skinned_primitive(*read_glb(path))
            uv = data["TEXCOORD_0"].astype(np.float64)
            outer = glb_outer_faces(data["indices"], uv)
            back = np.unique(outer[np.rint(data["_PANEL"][outer[:, 0]]).astype(int) == 1])
            positions = data["POSITION"].astype(np.float64)[back]
            unique, counts = np.unique(positions, axis=0, return_counts=True)
            copies = unique[counts > 1]  # one position, several vertices: a seam inside the back panel
            self.assertEqual(int((np.abs(copies[:, 0]) < 0.02).sum()), 0, f"{path.name}: seam copies down the middle of the back")
            if path.name == "tshirt-v5.3-mhr-neutral.glb":
                report, _ = check(path, kind)
                self.assertLess(report["back"]["up_angle_mean_deg"], 3.0, path.name)

    def test_seams_split_vertices_only(self) -> None:
        """A v5.3 GLB has the same triangles and shape as the v5.2 garment it is cut from: only the vertex split
        pattern (the seams) differs. Checked on the neutral base garments: same welded positions and triangle count."""
        pairs = [(GARMENTS / "experiments" / "tshirt-v5.2-mhr-neutral.glb", GARMENTS / "experiments" / "tshirt-v5.3-mhr-neutral.glb"),
                 (GARMENTS / "pants-basic-v2-mhr-neutral.glb", GARMENTS / "pants-basic-v3-mhr-neutral.glb")]
        for old, new in pairs:
            if not (old.is_file() and new.is_file()):
                continue
            a, b = (skinned_primitive(*read_glb(path)) for path in (old, new))
            self.assertEqual(len(a["indices"]), len(b["indices"]), new.name)
            weld = lambda p: np.unique(np.round(p["POSITION"].astype(np.float64), 7), axis=0)  # noqa: E731
            np.testing.assert_array_equal(weld(a), weld(b), err_msg=new.name)


if __name__ == "__main__":
    unittest.main()
