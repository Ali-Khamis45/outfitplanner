"""Pants v3.1 (candidate): no step in the garment-to-body gap at the knee (leg_profile.py).

pants v2 / v3 build the leg as the thigh offset cut by a plane at knee + 5 cm, united with a straight tube whose flat
top sits at knee + 10 cm: the gap jumps 7-12 mm within 1 cm there. v3.1 morphs one into the other over 10 cm.
Acceptance, on every v3.1 GLB (neutral base garment, every size of both bodies), per leg sector (leg_profile.py):
- from the crotch down to the bottom of the blend (knee + 2.5 cm), the median gap changes by at most 4 mm between
  neighbouring 1 cm bins;
- below that, down to the turned-in cuff, the leg is the unchanged straight tube of v3 and the gap follows the body's
  relief (kneecap, tibial tuberosity, fibula head): each sector stays within 4 mm, or, where v3 already exceeds 4 mm
  there, within the same v3 GLB's value + 0.3 mm (the blend's smoothstep tail reaches ~1 cm into this zone);
- the cuff narrows on purpose and is only reported.
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from leg_profile import body_tree, largest_step, profile  # noqa: E402

PROJECT = Path(__file__).resolve().parents[3]
GARMENTS = PROJECT / "outputs" / "garments"
MANIFEST = GARMENTS / "personal" / "manifest.json"
MAX_STEP_MM = 4.0


def avatar(body_id: str) -> Path | None:
    if body_id == "neutral":
        return PROJECT / "outputs" / "avatars" / "mhr-neutral.glb"
    if not MANIFEST.is_file():
        return None
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    entry = next((e for e in [manifest["primary"], *manifest["secondary"]] if e["id"] == body_id), None)
    return PROJECT / entry["body"] if entry else None


def v3_1_glbs() -> list[tuple[Path, str]]:
    found = [(GARMENTS / "pants-basic-v3.1-mhr-neutral.glb", "neutral")]
    found += [(p, p.name[: -len(".glb")].split("-", 3)[3]) for p in sorted((GARMENTS / "sizes-pants-v3.1").glob("pants-v3.1-*.glb"))]
    return [(p, body) for p, body in found if p.is_file() and avatar(body) is not None and avatar(body).is_file()]


@unittest.skipUnless(v3_1_glbs(), "generate pants v3.1 first")
class KneeStepTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.trees = {body: body_tree(avatar(body)) for body in {body for _, body in v3_1_glbs()}}

    def test_the_metric_sees_the_v3_step(self) -> None:
        v3 = GARMENTS / "pants-basic-v3-mhr-neutral.glb"
        if not v3.is_file():
            self.skipTest("pants v3 not generated")
        for name, leg in profile(v3, avatar("neutral"), self.trees["neutral"]).items():
            step = largest_step(leg)
            self.assertGreater(abs(step["mm"]), 6.0, f"v3 {name}: {step}")
            self.assertAlmostEqual(step["y"], 0.607, delta=0.02, msg=f"v3 {name}: the step sits at the tube's flat top")

    def test_no_gap_change_above_4_mm_per_cm_along_the_leg(self) -> None:
        for path, body in v3_1_glbs():
            for name, leg in profile(path, avatar(body), self.trees[body]).items():
                step = largest_step(leg)
                self.assertLessEqual(abs(step["mm"]), MAX_STEP_MM, f"{path.name} {name}: {step}")

    def test_the_straight_tube_is_no_worse_than_v3(self) -> None:
        for path, body in v3_1_glbs():
            v3 = GARMENTS / "pants-basic-v3-mhr-neutral.glb" if path.parent == GARMENTS else GARMENTS / "sizes" / path.name.replace("pants-v3.1-", "pants-v3-")
            if not v3.is_file():
                continue
            new, old = (profile(p, avatar(body), self.trees[body]) for p in (path, v3))
            for name in new:
                for sector in ("front", "back", "outer", "inner"):
                    a, b = (largest_step(p[name], "tube", (sector,)) for p in (new, old))
                    self.assertLessEqual(abs(a["mm"]), max(MAX_STEP_MM, abs(b["mm"]) + 0.3), f"{path.name} {name} {sector}: v3.1 {a} vs v3 {b}")


if __name__ == "__main__":
    unittest.main()
