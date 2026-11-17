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

# Measured maximum over the candidate GLBs (Sprint 3.5) + 0.5 deg. Filled from the measurement in the 3.5 report.
UP_ANGLE_LIMIT_DEG: dict[tuple[str, str], float] = {}
UP_ANGLE_EXEMPT = {("pants", "gusset")}


def v3_glbs() -> list[tuple[Path, str]]:
    found = [(GARMENTS / "experiments" / "tshirt-v5.3-mhr-neutral.glb", "tshirt"), (GARMENTS / "pants-basic-v3-mhr-neutral.glb", "pants")]
    found += [(p, "tshirt") for p in sorted((GARMENTS / "sizes-v5.3").glob("tshirt-v5.3-*.glb"))]
    found += [(p, "pants") for p in sorted((GARMENTS / "sizes-v5.3").glob("pants-v3-*.glb"))]
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
        """The 3A back chevron (torso 12.4 deg) came from one tube cut at the centre back; the v5.3 back is one panel."""
        for path, kind in v3_glbs():
            if kind == "tshirt":
                report, _ = check(path, kind)
                self.assertLess(report["back"]["up_angle_mean_deg"], 4.0, path.name)

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
