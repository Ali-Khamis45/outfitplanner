"""Sprint 4A: the flat-lay model's panel landmarks sit where the pattern pieces meet (flatlay.py)."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from flatlay import PANELS, TEMPLATES, flat_lay  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "garments"))
from uv_layout import PANEL_LAYOUTS  # noqa: E402


def available(template: str) -> bool:
    return TEMPLATES[template][1].is_file()


@unittest.skipUnless(available("tshirt-v5.3"), "generate tshirt-v5.3 first")
class ShirtLandmarkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.m = flat_lay("tshirt-v5.3")

    def xyz(self, panel: str, name: str) -> np.ndarray:
        return self.m.positions[self.m.panels[panel].landmarks[name]]

    def test_torso_landmarks_are_anatomical(self) -> None:
        for panel in ("front", "back"):
            for side, sign in (("left", 1), ("right", -1)):
                with self.subTest(panel=panel, side=side):
                    self.assertGreater(self.xyz(panel, f"shoulder_{side}")[1] - self.xyz(panel, f"armpit_{side}")[1], 0.12)  # the armhole is deep
                    self.assertGreater(sign * self.xyz(panel, f"armpit_{side}")[0], 0.15)
                    self.assertLess(abs(self.xyz(panel, f"neck_{side}")[0]), abs(self.xyz(panel, f"shoulder_{side}")[0]))
                    self.assertLess(self.xyz(panel, f"hem_{side}")[1], self.xyz(panel, f"armpit_{side}")[1] - 0.3)
            for name in ("neck_centre", "hem_centre"):
                self.assertLess(abs(self.xyz(panel, name)[0]), 0.01, f"{panel} {name}")
        self.assertLess(self.xyz("front", "neck_centre")[1], self.xyz("back", "neck_centre")[1])  # the front neckline is lower

    def test_left_and_right_mirror_each_other(self) -> None:
        for panel in ("front", "back"):
            for name in ("armpit", "shoulder", "neck", "hem"):
                left, right = self.xyz(panel, f"{name}_left"), self.xyz(panel, f"{name}_right")
                # 2 cm: a landmark is one mesh vertex, and the garment mesh is not exactly symmetric (front neck: 1.4 cm)
                self.assertLess(np.linalg.norm(left * [-1, 1, 1] - right), 0.02, f"{panel} {name}")

    def test_sleeve_cuff_is_away_from_the_armhole(self) -> None:
        for panel in ("sleeve_left", "sleeve_right"):
            for name in ("cuff_top", "cuff_under"):
                self.assertGreater(np.linalg.norm(self.xyz(panel, name) - self.xyz(panel, "armpit")), 0.05, f"{panel} {name}")


@unittest.skipUnless(available("pants-v3"), "generate pants-v3 first")
class PantsLandmarkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.m = flat_lay("pants-v3")

    def test_leg_panel_landmarks_are_anatomical(self) -> None:
        for panel in ("left_front", "left_back", "right_front", "right_back"):
            P = {k: self.m.positions[v] for k, v in self.m.panels[panel].landmarks.items()}
            with self.subTest(panel=panel):
                self.assertLess(abs(P["waist_centre"][0]), 0.01)
                self.assertLess(P["crotch"][1], P["waist_centre"][1] - 0.15)
                self.assertGreater(abs(P["waist_side"][0]), 0.15)
                for hem in ("hem_outer", "hem_inner"):
                    self.assertLess(P[hem][1], 0.2)
                self.assertGreater(abs(P["hem_outer"][0]), abs(P["hem_inner"][0]))
                self.assertLess(P["inseam_top"][1], P["crotch"][1])


class IslandTests(unittest.TestCase):
    def test_landmarks_lie_inside_their_island_rectangle(self) -> None:
        for template, (kind, _) in TEMPLATES.items():
            if not available(template):
                continue
            m = flat_lay(template)
            rects = {island.name: island.rect for island in PANEL_LAYOUTS[kind]["islands"]}
            for name, panel in m.panels.items():
                u0, v0, u1, v1 = rects[name]
                for landmark, vertex in panel.landmarks.items():
                    u, v = m.uv[vertex]
                    self.assertTrue(u0 <= u <= u1 and v0 <= v <= v1, f"{template} {name} {landmark} ({u:.3f}, {v:.3f})")


if __name__ == "__main__":
    unittest.main()
