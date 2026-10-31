"""Unit tests for the Sprint 1.0 garment engine (synthetic geometry) plus checks on generated neutral assets."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from body import RestBody  # noqa: E402
from garment_glb import read_glb, skinned_primitive, write_garment_glb  # noqa: E402
from tshirt import OuterGarment, assemble, boundary_loops, fill_small_holes, repair_manifold, surface_nets  # noqa: E402

PROJECT = Path(__file__).resolve().parents[3]
NEUTRAL_AVATAR = PROJECT / "outputs" / "avatars" / "mhr-neutral.glb"
NEUTRAL_GARMENT = PROJECT / "outputs" / "garments" / "tshirt-mhr-neutral.glb"


def tube(rings: int = 6, segments: int = 24) -> tuple[np.ndarray, np.ndarray]:
    """Open cylinder of radius 0.1 m along +Y, outward-facing, with two boundary loops."""
    angle = np.linspace(0, 2 * np.pi, segments, endpoint=False)
    vertices = np.array([[0.1 * np.sin(a), 0.05 * r, 0.1 * np.cos(a)] for r in range(rings) for a in angle])
    faces = []
    for r in range(rings - 1):
        for s in range(segments):
            a, b = r * segments + s, r * segments + (s + 1) % segments
            c, d = a + segments, b + segments
            faces += [[a, b, d], [a, d, c]]
    faces = np.array(faces)
    mesh = trimesh.Trimesh(vertices, faces, process=False)
    if mesh.face_normals[0] @ (mesh.triangles_center[0] * [1, 0, 1]) < 0:
        faces = faces[:, ::-1]
    return vertices, faces


def two_joint_body(vertex_count: int) -> RestBody:
    state = np.array([[0, 0, 0, 0, 0, 0, 1, 1], [0, 0.1, 0, 0, 0, 0, 1, 1]], dtype=np.float64)
    return RestBody("neutral", np.zeros((vertex_count, 3)), np.zeros((0, 3), dtype=np.int64), ("root", "child"), np.array([-1, 0], dtype=np.int32), state, np.zeros((vertex_count, 4), dtype=np.int64), np.tile([1.0, 0, 0, 0], (vertex_count, 1)), np.zeros(vertex_count, dtype=np.int32), np.zeros(45, np.float32), np.zeros(204, np.float32))


class SurfaceTests(unittest.TestCase):
    def test_surface_nets_cut_sphere_is_closed_and_outward(self) -> None:
        h = 0.05
        axis = np.arange(-1.5, 1.5 + h, h)
        grid = np.stack(np.meshgrid(axis, axis, axis, indexing="ij"), -1)
        stack = np.stack([np.linalg.norm(grid, axis=-1) - 1.0, grid[..., 1] - 0.5]).astype(np.float32)
        vertices, faces, caps = surface_nets(stack, np.full(3, -1.5), h)
        closed = trimesh.Trimesh(vertices, faces, process=False)
        self.assertTrue(closed.is_watertight and closed.is_winding_consistent)
        self.assertAlmostEqual(closed.volume, np.pi * (4 / 3 - 0.25 * 2.5 / 3), delta=0.05)
        opened, _ = repair_manifold(faces[~caps])
        self.assertEqual(len(boundary_loops(opened)), 1)

    def test_repair_manifold_removes_fin_faces(self) -> None:
        faces = np.array([[0, 1, 2], [1, 0, 3], [0, 1, 4]])  # edge 0-1 shared by three faces
        repaired, report = repair_manifold(faces)
        self.assertEqual(report["non_manifold_edges_found"], 1)
        self.assertEqual(len(repaired), 0)

    def test_fill_small_holes_keeps_largest_openings(self) -> None:
        vertices, faces = tube()
        interior = 2 * (2 * 24 + 5)  # one quad (two faces) on ring 2, away from both openings
        mesh = trimesh.Trimesh(vertices, np.delete(faces, [interior, interior + 1], axis=0), process=False)
        self.assertEqual(fill_small_holes(mesh, keep=2), 1)
        self.assertEqual(len(boundary_loops(np.asarray(mesh.faces))), 2)


class AssemblyTests(unittest.TestCase):
    def test_assemble_solidifies_tube_into_consistent_shell(self) -> None:
        vertices, faces = tube()
        loops = {f"loop{i}": loop for i, loop in enumerate(boundary_loops(faces))}
        garment = OuterGarment(vertices, faces, np.zeros(faces.shape + (2,)), np.zeros((len(vertices), 4), dtype=np.int64), np.tile([1.0, 0, 0, 0], (len(vertices), 1)), np.zeros(len(vertices), dtype=np.int32), loops)
        arrays = assemble(garment, 0.002)
        welded = trimesh.Trimesh(arrays["position"], arrays["faces"], process=False)
        welded.merge_vertices(merge_tex=True, merge_norm=True)
        self.assertTrue(welded.is_watertight and welded.is_winding_consistent and welded.volume > 0)
        euler = len(welded.vertices) - len(welded.edges_unique) + len(welded.faces)
        self.assertEqual(euler, 0)  # thickened tube with two openings is a torus
        self.assertAlmostEqual(float(np.abs(np.linalg.norm(arrays["normal"], axis=1) - 1).max()), 0.0, places=5)

    def test_glb_round_trip_keeps_official_inverse_binds(self) -> None:
        vertices, faces = tube()
        loops = {f"loop{i}": loop for i, loop in enumerate(boundary_loops(faces))}
        joints = np.zeros((len(vertices), 4), dtype=np.int64)
        joints[:, 1] = 1
        weights = np.tile([0.75, 0.25, 0, 0], (len(vertices), 1))
        garment = OuterGarment(vertices, faces, np.zeros(faces.shape + (2,)), joints, weights, np.zeros(len(vertices), dtype=np.int32), loops)
        arrays = assemble(garment, 0.002)
        body = two_joint_body(len(arrays["position"]))
        metadata = {"garmentId": "test-tube", "regions": ["torso"]}
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "tube.glb"
            write_garment_glb(path, arrays, body, metadata, {"name": "m", "baseColor": [1, 1, 1, 1], "metalness": 0.0, "roughness": 0.9})
            document, blob = read_glb(path)
            data = skinned_primitive(document, blob)
        self.assertEqual(list(data["joint_names"]), ["root", "child"])
        np.testing.assert_allclose(data["inverse_bind"][1][:3, 3], [0, -0.1, 0], atol=1e-6)
        np.testing.assert_allclose(data["WEIGHTS_0"].sum(axis=1), 1.0, atol=1e-6)
        for name in ("POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0", "_REGION"):
            self.assertIn(name, data)
        self.assertEqual(document["asset"]["extras"]["garment"]["garmentId"], "test-tube")


@unittest.skipUnless(NEUTRAL_GARMENT.is_file() and NEUTRAL_AVATAR.is_file(), "generate the neutral T-shirt first")
class GeneratedNeutralGarmentTests(unittest.TestCase):
    def test_neutral_garment_validates_against_neutral_avatar(self) -> None:
        from validate_garment import validate

        report = validate(NEUTRAL_GARMENT, NEUTRAL_AVATAR)
        self.assertEqual(report["shell"]["genus"], 3)
        self.assertLess(report["max_inverse_bind_delta_vs_avatar"], 1e-5)
        self.assertEqual(report["rest_clearance"]["penetrating_vertices"], 0)


if __name__ == "__main__":
    unittest.main()


class Sprint11Tests(unittest.TestCase):
    def test_closest_point_matches_brute_force(self) -> None:
        from tshirt import closest_point_on_triangles

        rng = np.random.default_rng(5)
        u, v = np.meshgrid(np.linspace(0, 1, 300), np.linspace(0, 1, 300))
        inside = u + v <= 1
        for _ in range(60):
            tri = rng.normal(size=(3, 3))
            point = rng.normal(size=(1, 3)) * 2
            bary = closest_point_on_triangles(point, tri[0:1], tri[1:2], tri[2:3])
            samples = (1 - u[inside] - v[inside])[:, None] * tri[0] + u[inside][:, None] * tri[1] + v[inside][:, None] * tri[2]
            self.assertAlmostEqual(float(bary.sum()), 1.0, places=9)
            self.assertLessEqual(float(np.linalg.norm(bary @ tri - point)), float(np.linalg.norm(samples - point, axis=1).min()) + 1e-12)

    def test_v1_rules_record_has_no_sprint_1_1_fields(self) -> None:
        from dataclasses import asdict

        from tshirt import SPRINT_1_1_FIELDS, V2_RULES, FitRules, rules_record

        record = rules_record(FitRules())
        self.assertFalse(set(SPRINT_1_1_FIELDS) & set(record))
        self.assertEqual(list(record), [k for k in asdict(FitRules()) if k not in SPRINT_1_1_FIELDS])
        self.assertEqual(rules_record(V2_RULES)["weight_mode"], "projection")


RECONSTRUCTION = PROJECT / "outputs" / "sam3d-person-front-sprint03-run2" / "reconstruction.npz"


@unittest.skipUnless(RECONSTRUCTION.is_file(), "private reconstruction not present")
class FloorAlignmentTests(unittest.TestCase):
    def test_floor_alignment_is_a_rigid_vertical_translation(self) -> None:
        from body import evaluate_rest_body, load_model

        model = load_model()
        raw = evaluate_rest_body(model, "personal-identity-scale", RECONSTRUCTION)
        aligned = evaluate_rest_body(model, "personal-identity-scale", RECONSTRUCTION, floor_align=True)
        offset = aligned.floor_offset_m
        self.assertGreater(abs(offset), 0.04)  # the Sprint 1.0 body floated about 5.2 cm
        self.assertAlmostEqual(float(aligned.vertices[:, 1].min()), 0.0, places=6)
        np.testing.assert_allclose(aligned.vertices - raw.vertices, np.tile([0, offset, 0], (len(raw.vertices), 1)), atol=1e-9)
        np.testing.assert_allclose(aligned.skeleton_state[:, :3] - raw.skeleton_state[:, :3], np.tile([0, offset, 0], (len(raw.skeleton_state), 1)), atol=1e-9)
        np.testing.assert_array_equal(aligned.skeleton_state[:, 3:], raw.skeleton_state[:, 3:])  # rotations and scales untouched
        np.testing.assert_array_equal(aligned.identity, raw.identity)
        identity_only = evaluate_rest_body(model, "personal-identity", RECONSTRUCTION, floor_align=True)
        self.assertEqual(identity_only.floor_offset_m, 0.0)  # within the 2 mm tolerance: skeleton stays identical to neutral


V2_GARMENT = PROJECT / "outputs" / "garments" / "tshirt-v2-mhr-neutral.glb"


@unittest.skipUnless(V2_GARMENT.is_file() and NEUTRAL_AVATAR.is_file(), "generate the v2 neutral T-shirt first")
class GeneratedV2GarmentTests(unittest.TestCase):
    def test_v2_garment_validates_against_neutral_avatar(self) -> None:
        from validate_garment import validate

        report = validate(V2_GARMENT, NEUTRAL_AVATAR)
        self.assertEqual(report["shell"]["genus"], 3)
        self.assertEqual(report["rest_clearance"]["penetrating_vertices"], 0)
        self.assertLess(report["max_inverse_bind_delta_vs_avatar"], 1e-5)
