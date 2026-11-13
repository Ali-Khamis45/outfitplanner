"""Sprint 2.3A: degenerate-triangle clean-up of personal fits, and the generated personal manifest."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

import numpy as np
import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from personal_fit import collapse_degenerate  # noqa: E402
from test_garment import boundary_loops, tube  # noqa: E402
from tshirt import OuterGarment, assemble  # noqa: E402

PROJECT = Path(__file__).resolve().parents[3]
MANIFEST = PROJECT / "outputs" / "garments" / "personal" / "manifest.json"


def squashed_tube() -> OuterGarment:
    vertices, faces = tube(rings=6, segments=24)
    vertices = vertices.copy()
    vertices[2 * 24 + 5] = vertices[2 * 24 + 6] + np.array([0.0003, 0.0, 0.0])  # an interior edge of 0.3 mm
    loops = {f"loop{i}": loop for i, loop in enumerate(boundary_loops(faces))}
    joints = np.tile([0, 1, 0, 0], (len(vertices), 1))
    weights = np.zeros((len(vertices), 4))
    weights[:, 0] = np.linspace(0.2, 0.8, len(vertices))
    weights[:, 1] = 1.0 - weights[:, 0]
    return OuterGarment(vertices, faces, np.zeros(faces.shape + (2,)), joints, weights, np.zeros(len(vertices), dtype=np.int32), loops)


class CollapseDegenerateTests(unittest.TestCase):
    def test_short_edges_are_collapsed_and_the_shell_stays_closed(self) -> None:
        garment = squashed_tube()
        cleaned, report = collapse_degenerate(garment, joint_count=4)
        self.assertGreaterEqual(report["collapses"], 1)
        self.assertEqual(report["remaining_edges_under_min"], 0)
        self.assertEqual(report["outer_triangles_removed"], len(garment.faces) - len(cleaned.faces))
        lengths = trimesh.Trimesh(cleaned.vertices, cleaned.faces, process=False).edges_unique_length
        self.assertGreaterEqual(float(lengths.min()), 0.001)
        np.testing.assert_allclose(cleaned.weights.sum(axis=1), 1.0, atol=1e-9)
        self.assertEqual(len(cleaned.boundaries), 2)
        arrays = assemble(cleaned, 0.002)
        welded = trimesh.Trimesh(arrays["position"], arrays["faces"], process=False)
        welded.merge_vertices(merge_tex=True, merge_norm=True)
        self.assertTrue(welded.is_watertight and welded.is_winding_consistent)

    def test_untouched_vertices_keep_their_weights(self) -> None:
        garment = squashed_tube()
        cleaned, report = collapse_degenerate(garment, joint_count=4)
        self.assertEqual(report["vertices_reweighted"], report["collapses"])
        far = np.linalg.norm(cleaned.vertices - garment.vertices[2 * 24 + 6], axis=1) > 0.05
        original = {tuple(np.round(v, 9)): w for v, w in zip(garment.vertices, garment.weights)}
        for vertex, weight in zip(cleaned.vertices[far], cleaned.weights[far]):
            np.testing.assert_array_equal(weight, original[tuple(np.round(vertex, 9))])


@unittest.skipUnless(MANIFEST.is_file(), "generate the personal fit and its manifest first")
class PersonalManifestTests(unittest.TestCase):
    """outputs/garments/personal/manifest.json is read by the web app: its schema must stay exact."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        cls.entries = [cls.manifest["primary"], *cls.manifest["secondary"]]

    def test_schema_is_exact(self) -> None:
        import re

        self.assertEqual(set(self.manifest), {"version", "fit_date", "primary", "secondary"})
        self.assertEqual(self.manifest["version"], 1)
        self.assertRegex(self.manifest["fit_date"], r"^\d{4}-\d{2}-\d{2}$")
        self.assertIsInstance(self.manifest["secondary"], list)
        self.assertEqual((self.manifest["primary"]["id"], self.manifest["primary"]["label"]), ("personal-scaled", "My avatar"))
        self.assertTrue(self.manifest["primary"]["body"].endswith("-rest-identity-scale-floor.glb"))
        self.assertEqual([(e["id"], e["label"]) for e in self.manifest["secondary"]], [("personal-identity", "My avatar (identity only)")])
        for entry in self.entries:
            self.assertEqual(set(entry), {"id", "label", "body", "top", "bottom"})
            for part in ("top", "bottom"):
                self.assertEqual(set(entry[part]), {"glb", "sidecar"})
                self.assertTrue(entry[part]["glb"].startswith("outputs/garments/personal/") and entry[part]["glb"].endswith(".glb"))
                self.assertTrue(entry[part]["sidecar"].startswith("outputs/garments/personal/") and entry[part]["sidecar"].endswith(".correctives.json"))
            for path in (entry["body"], entry["top"]["glb"], entry["top"]["sidecar"], entry["bottom"]["glb"], entry["bottom"]["sidecar"]):
                self.assertTrue(path.startswith("outputs/") and "\\" not in path and not re.match(r"^[A-Za-z]:|^/", path), path)

    def test_every_listed_file_exists(self) -> None:
        for entry in self.entries:
            for path in (entry["body"], entry["top"]["glb"], entry["top"]["sidecar"], entry["bottom"]["glb"], entry["bottom"]["sidecar"]):
                self.assertTrue((PROJECT / path).is_file(), path)

    def test_every_sidecar_target_exists_in_its_glb(self) -> None:
        from garment_glb import read_glb

        for entry in self.entries:
            for part in ("top", "bottom"):
                document, _ = read_glb(PROJECT / entry[part]["glb"])
                names = document["meshes"][0].get("extras", {}).get("targetNames", [])
                sidecar = json.loads((PROJECT / entry[part]["sidecar"]).read_text(encoding="utf-8"))
                targets = [item["target"] for item in sidecar["correctives"]]
                self.assertTrue(targets, entry[part]["sidecar"])
                self.assertEqual(sorted(set(targets) - set(names)), [], entry[part]["sidecar"])
                self.assertEqual(sorted(set(names) - set(targets)), [], entry[part]["glb"])  # and no undriven morphs


if __name__ == "__main__":
    unittest.main()
