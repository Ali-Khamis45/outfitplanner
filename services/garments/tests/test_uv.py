"""UV layout v2 (docs/contracts/garment-texture.md): texel density, islands and orientation of the generated GLBs."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from garment_glb import read_glb, skinned_primitive  # noqa: E402
from uv_layout import LAYOUTS, MIN_WITHIN_TOLERANCE, density_check, glb_outer_faces  # noqa: E402

PROJECT = Path(__file__).resolve().parents[3]
GARMENTS = PROJECT / "outputs" / "garments"


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
            for name, island in report.items():
                label = f"{path.name} {name}"
                self.assertEqual(island["uv_corners_outside_island"], 0, label)
                self.assertLess(island["uv_overlap_pct"], 0.5, label)  # rasterisation edge pixels only
                self.assertGreaterEqual(1 - island["outside_tolerance_pct"] / 100, MIN_WITHIN_TOLERANCE, label)
                self.assertLessEqual(island["anisotropy_p99"], 1.35, label)
                self.assertAlmostEqual(island["median_density_uv_per_m"], LAYOUTS[kind]["density"], delta=0.03, msg=label)
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
