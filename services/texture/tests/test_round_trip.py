"""Sprint 4A: synthetic flat-lay photos -> producer -> the painted reference texture (no personal photos).

The photos are rotated (4 deg, which the capture outline cannot express), carry a smooth 10 px drape and JPEG
compression, and the capture alignment is 4 % off in scale. Bounds sit just above the values measured when the producer
was introduced (Sprint 4A plan), as regression guards:
- coverage (texels filled / visible island texels) >= 0.97 (measured 0.977-0.993);
- texels more than 40 levels from the reference, allowing 4.3 mm of shift (4 texels), <= 12 % (measured 3.8-9.9 %);
- the T-shirt's chest logo lands within 5 mm of its place (measured 2.2-3.1 mm).
"""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from flatlay import TEMPLATES, flat_lay  # noqa: E402
from produce import TEXTURE_SIZE, produce  # noqa: E402
from synthetic import alignment_for, reference_texture, render_photo, write_capture  # noqa: E402

LOGO = (250, 196, 30)
TOLERANCE_TEXELS = 4
MAX_WRONG_SHARE = 0.12
MIN_COVERAGE = 0.97
MAX_LOGO_SHIFT_MM = 5.0


def tolerant_error(texture: np.ndarray, reference: np.ndarray) -> np.ndarray:
    """Per texel, the colour error to the closest reference colour within +-TOLERANCE_TEXELS."""
    got, ref = texture[..., :3].astype(np.int16), reference[..., :3].astype(np.int16)
    best = np.full(ref.shape[:2], 255, dtype=np.int16)
    for dy in range(-TOLERANCE_TEXELS, TOLERANCE_TEXELS + 1):
        for dx in range(-TOLERANCE_TEXELS, TOLERANCE_TEXELS + 1):
            best = np.minimum(best, np.abs(got - np.roll(np.roll(ref, dy, axis=0), dx, axis=1)).max(axis=2))
    return best


class RoundTripTests(unittest.TestCase):
    def round_trip(self, template: str) -> tuple[dict, np.ndarray, np.ndarray]:
        model = flat_lay(template)
        reference = reference_texture(model)
        with tempfile.TemporaryDirectory() as directory:
            wardrobe = Path(directory)
            for view in ("front", "back"):
                photo, S = render_photo(model, view, reference)
                write_capture(wardrobe, "synthetic", view, photo, alignment_for(model, view, S, photo.shape[1]))
            result = produce("synthetic", template, wardrobe)
            texture = np.asarray(Image.open(wardrobe / "textures" / "synthetic.png"))
            metadata = json.loads((wardrobe / "textures" / "synthetic.texture.json").read_text(encoding="utf-8"))
        self.assertEqual({k: v for k, v in result.items() if k != "views_report"}, metadata)
        return metadata, texture, reference

    def check(self, template: str) -> None:
        metadata, texture, reference = self.round_trip(template)
        self.assertEqual(set(metadata), {"version", "item", "template", "views", "coverage", "fallback_hex", "created_at"})
        self.assertEqual((metadata["version"], metadata["template"], metadata["views"]), (1, template, ["front", "back"]))
        self.assertRegex(metadata["fallback_hex"], r"^#[0-9a-f]{6}$")
        self.assertEqual(texture.shape, (TEXTURE_SIZE, TEXTURE_SIZE, 4))
        self.assertGreaterEqual(metadata["coverage"], MIN_COVERAGE)
        both = (texture[..., 3] > 0) & (reference[..., 3] > 0)
        self.assertEqual(int(((texture[..., 3] > 0) & (reference[..., 3] == 0)).sum()), 0, "texels filled outside the visible islands")
        wrong = float((tolerant_error(texture, reference)[both] > 40).mean())
        self.assertLessEqual(wrong, MAX_WRONG_SHARE, f"{template}: {wrong:.3f} of texels wrong")
        if template.startswith("tshirt"):
            logo = (reference[..., :3] == LOGO).all(axis=2)
            found = (np.abs(texture[..., :3].astype(int) - LOGO).max(axis=2) < 40) & (texture[..., 3] > 0)
            shift_mm = np.linalg.norm(np.argwhere(found).mean(axis=0) - np.argwhere(logo).mean(axis=0)) / (TEXTURE_SIZE * 0.45) * 1000
            self.assertLessEqual(shift_mm, MAX_LOGO_SHIFT_MM)

    @unittest.skipUnless(TEMPLATES["tshirt-v5.3"][1].is_file(), "generate tshirt-v5.3 first")
    def test_tshirt(self) -> None:
        self.check("tshirt-v5.3")

    @unittest.skipUnless(TEMPLATES["pants-v3"][1].is_file(), "generate pants-v3 first")
    def test_pants(self) -> None:
        self.check("pants-v3")


class LinkTests(unittest.TestCase):
    def test_link_sets_only_the_items_texture(self) -> None:
        from produce import link_texture

        with tempfile.TemporaryDirectory() as directory:
            wardrobe = Path(directory)
            self.assertFalse(link_texture("shirt-1", wardrobe), "no wardrobe file")
            data = {"version": 1, "items": [{"id": "shirt-1", "name": "Tee", "photo": ""}, {"id": "pants-1", "name": "Chinos", "texture": None}], "outfits": []}
            (wardrobe / "wardrobe.json").write_text(json.dumps(data), encoding="utf-8")
            self.assertTrue(link_texture("shirt-1", wardrobe))
            self.assertFalse(link_texture("missing", wardrobe))
            written = json.loads((wardrobe / "wardrobe.json").read_text(encoding="utf-8"))
            self.assertEqual(written["items"][0], {**data["items"][0], "texture": "outputs/wardrobe/textures/shirt-1.png"})
            self.assertEqual(written["items"][1], data["items"][1])
            self.assertEqual({k: v for k, v in written.items() if k != "items"}, {k: v for k, v in data.items() if k != "items"})
            self.assertEqual(sorted(p.name for p in wardrobe.iterdir()), ["wardrobe.json"], "no temporary file left behind")


if __name__ == "__main__":
    unittest.main()
