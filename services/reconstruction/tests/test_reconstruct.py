"""Offline failure-path tests; no model outputs or personal photos are fabricated."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from reconstruct import ReconstructionError, infer, main, require_assets, require_cuda, validate_detection, validate_image


class ReconstructionValidationTests(unittest.TestCase):
    def test_corrupt_image(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "broken.png"
            path.write_bytes(b"not an image")
            with self.assertRaisesRegex(ReconstructionError, "cannot be decoded"):
                validate_image(path)

    def test_unsupported_image(self) -> None:
        with self.assertRaisesRegex(ReconstructionError, "Unsupported image format"):
            validate_image(Path("input.txt"))

    def test_small_image(self) -> None:
        from PIL import Image
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "small.png"
            Image.new("RGB", (32, 32)).save(path)
            with self.assertRaisesRegex(ReconstructionError, "too small"):
                validate_image(path)

    def test_low_contrast_image(self) -> None:
        from PIL import Image
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "blank.png"
            Image.new("RGB", (256, 384)).save(path)
            with self.assertRaisesRegex(ReconstructionError, "contrast"):
                validate_image(path)

    def test_jfif_format(self) -> None:
        from PIL import Image, ImageDraw
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic.jfif"
            image = Image.new("RGB", (256, 384), "white")
            ImageDraw.Draw(image).rectangle((50, 50, 200, 300), fill="black")
            image.save(path, format="JPEG")
            self.assertEqual(validate_image(path).size, (256, 384))

    def test_missing_checkpoint(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ReconstructionError, "Missing official checkpoint"):
                require_assets(Path(directory), Path(directory))

    def test_cli_missing_checkpoint_does_not_create_output(self) -> None:
        from PIL import Image, ImageDraw
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            photo = root / "synthetic.png"
            image = Image.new("RGB", (256, 384), "white")
            ImageDraw.Draw(image).rectangle((50, 50, 200, 300), fill="black")
            image.save(photo)
            output = root / "output"
            args = ["reconstruct.py", "--input", str(photo), "--output", str(output), "--checkpoint-dir", str(root / "missing")]
            with patch.object(sys, "argv", args), patch("sys.stderr"):
                self.assertEqual(main(), 1)
            self.assertFalse(output.exists())

    def test_unavailable_gpu(self) -> None:
        torch = Mock()
        torch.cuda.is_available.return_value = False
        with self.assertRaisesRegex(ReconstructionError, "CUDA is unavailable"):
            require_cuda(torch)

    def test_failed_inference(self) -> None:
        estimator = Mock()
        estimator.process_one_image.side_effect = RuntimeError("inference error")
        with self.assertRaisesRegex(ReconstructionError, "inference failed"):
            infer(estimator, object(), object())

    def test_detection_count_and_crop(self) -> None:
        for boxes in ([], [[30, 20, 150, 700], [200, 20, 300, 700]]):
            with self.assertRaisesRegex(ReconstructionError, "exactly one"):
                validate_detection(boxes, 400, 800)
        with self.assertRaisesRegex(ReconstructionError, "touches an image edge"):
            validate_detection([[0, 10, 200, 750]], 400, 800)
        box, warnings = validate_detection([[30, 10, 300, 750]], 400, 800)
        self.assertEqual(len(box), 1)
        self.assertTrue(warnings)


if __name__ == "__main__":
    unittest.main()
