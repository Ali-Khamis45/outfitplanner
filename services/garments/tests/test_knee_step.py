"""Pants v3.1 (candidate): no step in the garment-to-body gap at the knee (leg_profile.py).

pants v2 / v3 build the leg as the thigh offset cut by a plane at knee + 5 cm, united with a straight tube whose flat
top sits at knee + 10 cm: the gap jumps 7-12 mm within 1 cm there. v3.1 morphs one into the other over 10 cm.
Acceptance: on every v3.1 GLB (neutral base garment, every size of both bodies) the median gap of each leg sector
changes by at most 4 mm between neighbouring 1 cm bins, from the crotch to where the turned-in cuff starts.
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
        for name, leg in profile(v3, None, self.trees["neutral"]).items():
            step = largest_step(leg)
            self.assertGreater(abs(step["mm"]), 6.0, f"v3 {name}: {step}")
            self.assertAlmostEqual(step["y"], 0.607, delta=0.02, msg=f"v3 {name}: the step sits at the tube's flat top")

    def test_no_gap_change_above_4_mm_per_cm_along_the_leg(self) -> None:
        for path, body in v3_1_glbs():
            for name, leg in profile(path, None, self.trees[body]).items():
                step = largest_step(leg)
                self.assertLessEqual(abs(step["mm"]), MAX_STEP_MM, f"{path.name} {name}: {step}")


if __name__ == "__main__":
    unittest.main()
