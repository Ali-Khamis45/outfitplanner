"""Small synthetic fixtures exercise validator failure paths, not MHR itself."""
from __future__ import annotations

import json
import struct
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from validate_glb import validate  # noqa: E402


def fixture(path: Path, *, weights: tuple[float, ...] = (1, 0, 0, 0), position: float = 0.0, skin: bool = True) -> None:
    chunks = [
        struct.pack("<9f", position, 0, 0, 1, 0, 0, 0, 1, 0),
        struct.pack("<3H", 0, 1, 2),
        struct.pack("<12H", *([0, 1, 0, 0] * 3)),
        struct.pack("<12f", *(weights * 3)),
        struct.pack("<32f", *([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] * 2)),
    ]
    blob = b""
    views = []
    for chunk in chunks:
        blob += b"\0" * (-len(blob) % 4)
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(chunk)})
        blob += chunk
    blob += b"\0" * (-len(blob) % 4)
    doc = {"asset": {"version": "2.0"}, "buffers": [{"byteLength": len(blob)}], "bufferViews": views,
           "accessors": [{"bufferView": i, "componentType": ct, "count": n, "type": kind} for i, (ct, n, kind) in enumerate([(5126, 3, "VEC3"), (5123, 3, "SCALAR"), (5123, 3, "VEC4"), (5126, 3, "VEC4"), (5126, 2, "MAT4")])],
           "nodes": [{"mesh": 0, "skin": 0}, {"children": [2]}, {}], "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "JOINTS_0": 2, "WEIGHTS_0": 3}, "indices": 1}]}],
           "skins": [{"joints": [1, 2], "inverseBindMatrices": 4}] if skin else []}
    encoded = json.dumps(doc).encode("utf-8")
    encoded += b" " * (-len(encoded) % 4)
    total = 12 + 8 + len(encoded) + 8 + len(blob)
    path.write_bytes(struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<I4s", len(encoded), b"JSON") + encoded + struct.pack("<I4s", len(blob), b"BIN\0") + blob)


class ValidationTests(unittest.TestCase):
    def test_valid_skinned_triangle(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "fixture.glb"
            fixture(path)
            result = validate(path)
            self.assertEqual((result["vertices"], result["triangles"], result["joint_counts"]), (3, 1, [2]))

    def test_bad_weights_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "fixture.glb"
            fixture(path, weights=(0.5, 0, 0, 0))
            with self.assertRaisesRegex(ValueError, "sum to one"):
                validate(path)

    def test_nonfinite_position_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "fixture.glb"
            fixture(path, position=float("nan"))
            with self.assertRaisesRegex(ValueError, "Non-finite"):
                validate(path)

    def test_static_mesh_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "fixture.glb"
            fixture(path, skin=False)
            with self.assertRaisesRegex(ValueError, "No skeleton"):
                validate(path)

    def test_corrupt_file_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "fixture.glb"
            path.write_bytes(b"bad")
            with self.assertRaisesRegex(ValueError, "truncated"):
                validate(path)


if __name__ == "__main__":
    unittest.main()
