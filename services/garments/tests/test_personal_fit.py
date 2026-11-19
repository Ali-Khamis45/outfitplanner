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
MEASUREMENTS = PROJECT / "outputs" / "avatars" / "measurements.json"
SIZES_DIR = PROJECT / "outputs" / "garments" / "sizes"  # default generation (tshirt-v5.3 / pants-v3)
SIZE_DIRS = (SIZES_DIR, PROJECT / "outputs" / "garments" / "sizes-v5.2")  # + the previous generation, for one sprint


def inverse_binds(path: Path) -> np.ndarray:
    """A GLB's skin inverse bind matrices, read from its first skin."""
    from garment_glb import accessor_array, read_glb

    document, blob = read_glb(path)
    return np.asarray(accessor_array(document, blob, document["skins"][0]["inverseBindMatrices"]), dtype=np.float64)


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
        ids = [entry["id"] for entry in self.entries]
        self.assertEqual(len(ids), len(set(ids)), "body ids must be unique")
        secondary = [(e["id"], e["label"]) for e in self.manifest["secondary"]]
        if MEASUREMENTS.is_file():  # calibrated: the primary is the calibrated body, the photo estimate moves to secondary
            self.assertTrue(self.manifest["primary"]["body"].endswith("-rest-identity-scale-floor-calibrated.glb"))
            self.assertEqual(secondary, [("personal-scaled-photo", "My avatar (photo estimate)"), ("personal-identity", "My avatar (identity only)")])
            self.assertTrue(self.manifest["secondary"][0]["body"].endswith("-rest-identity-scale-floor.glb"))
        else:
            self.assertTrue(self.manifest["primary"]["body"].endswith("-rest-identity-scale-floor.glb"))
            self.assertEqual(secondary, [("personal-identity", "My avatar (identity only)")])
        for entry in self.entries:
            self.assertEqual(set(entry), {"id", "label", "body", "top", "bottom"})
            for part in ("top", "bottom"):
                self.assertEqual(set(entry[part]), {"glb", "sidecar"})
                glb, sidecar = entry[part]["glb"], entry[part]["sidecar"]
                self.assertTrue(glb.endswith(".glb") and sidecar.endswith(".correctives.json"), glb)
                if glb.startswith("outputs/garments/sizes/"):  # a body without a base fit wears its own size files
                    self.assertTrue(glb.endswith(f"-{entry['id']}.glb"), glb)
                    self.assertTrue(glb.split("/")[-1].startswith("tshirt-v5.3-" if part == "top" else "pants-v3.1-"), glb)  # the default generation
                    self.assertEqual(sidecar, glb[: -len(".glb")] + ".correctives.json")
                else:
                    self.assertTrue(glb.startswith("outputs/garments/personal/") and sidecar.startswith("outputs/garments/personal/"), glb)
            for path in (entry["body"], entry["top"]["glb"], entry["top"]["sidecar"], entry["bottom"]["glb"], entry["bottom"]["sidecar"]):
                self.assertTrue(path.startswith("outputs/") and "\\" not in path and not re.match(r"^[A-Za-z]:|^/", path), path)

    def test_the_builder_reproduces_the_manifest(self) -> None:
        """personal_manifest.py writes this manifest: the bodies and garments it lists are the ones on disk (Sprint 3.6)."""
        from personal_manifest import build

        built = build("sam3d-person-front-sprint03-run2")
        self.assertEqual({k: v for k, v in built.items() if k != "fit_date"}, {k: v for k, v in self.manifest.items() if k != "fit_date"})

    def test_every_listed_file_exists(self) -> None:
        for entry in self.entries:
            for path in (entry["body"], entry["top"]["glb"], entry["top"]["sidecar"], entry["bottom"]["glb"], entry["bottom"]["sidecar"]):
                self.assertTrue((PROJECT / path).is_file(), path)

    def test_every_body_s_garments_and_sizes_are_bound_to_that_body(self) -> None:
        """Top, bottom and every size file of a body id (outputs/garments/sizes/*-<id>.glb) carry that body's own
        inverse bind matrices: a garment bound to another body (e.g. the uncalibrated one) would be skinned wrongly."""
        for entry in self.entries:
            body = inverse_binds(PROJECT / entry["body"])
            garments = {PROJECT / entry["top"]["glb"], PROJECT / entry["bottom"]["glb"], *(p for d in SIZE_DIRS for p in d.glob(f"*-{entry['id']}.glb"))}
            for garment in sorted(garments):
                with self.subTest(body=entry["id"], garment=garment.name):
                    binds = inverse_binds(garment)
                    self.assertEqual(binds.shape, body.shape)
                    self.assertLessEqual(float(np.abs(binds - body).max()), 1e-5)
            others = [e for e in self.entries if e is not entry]
            for other in others:  # and not to any other listed body (the bodies must differ for this to mean anything)
                if np.abs(inverse_binds(PROJECT / other["body"]) - body).max() > 1e-4:
                    for path in (p for d in SIZE_DIRS for p in d.glob(f"*-{entry['id']}.glb")):
                        self.assertGreater(float(np.abs(inverse_binds(path) - inverse_binds(PROJECT / other["body"])).max()), 1e-4, f"{path.name} bound to {other['id']}")

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
