"""Sprint 1.4A: corrective morph contract (swing, weights, GLB morph targets) and the generated v5 neutral asset."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from correctives import TARGETS, CorrectiveRules, dual_quaternion_skin, region_weight, sidecar  # noqa: E402
from garment_glb import read_glb, write_garment_glb  # noqa: E402
from posing import Skeleton, corrective_weights, load_asset, pose_local, posed_positions, raise_arm, skin, skin_matrices, swing_deg, world_from_local  # noqa: E402
from test_garment import boundary_loops, tube, two_joint_body  # noqa: E402
from tshirt import OuterGarment, assemble  # noqa: E402

PROJECT = Path(__file__).resolve().parents[3]
NEUTRAL_AVATAR = PROJECT / "outputs" / "avatars" / "mhr-neutral.glb"
V2_GARMENT = PROJECT / "outputs" / "garments" / "tshirt-v2-mhr-neutral.glb"
V5_GARMENT = PROJECT / "outputs" / "garments" / "experiments" / "tshirt-v5-mhr-neutral.glb"
CONTRACT_NAMES = ["corr_L_abd90", "corr_L_abd120", "corr_R_abd90", "corr_R_abd120"]


def arm_skeleton() -> Skeleton:
    """root -> l_uparm (rotated 30 deg about Z at rest, like an A-pose) -> l_lowarm 0.25 m along local +X."""
    local = np.repeat(np.eye(4)[None], 3, axis=0)
    c, s = np.cos(np.radians(-30)), np.sin(np.radians(-30))
    local[1][:3, :3] = [[c, -s, 0], [s, c, 0], [0, 0, 1]]
    local[1][:3, 3] = [0.2, 1.4, 0]
    local[2][:3, 3] = [0.25, 0, 0]
    skeleton = Skeleton(["root", "l_uparm", "l_lowarm"], np.array([-1, 0, 1]), local, np.eye(4)[None].repeat(3, axis=0))
    skeleton.inverse_bind = np.linalg.inv(world_from_local(skeleton, local))
    return skeleton


class SwingAndWeightTests(unittest.TestCase):
    def test_swing_is_zero_at_rest_and_follows_world_raise(self) -> None:
        skeleton = arm_skeleton()
        self.assertAlmostEqual(swing_deg(skeleton, skeleton.local, "l_uparm", "l_lowarm"), 0.0, places=6)
        for degrees in (45, 90, 120):
            local = pose_local(skeleton, [raise_arm("l", degrees)])
            self.assertAlmostEqual(swing_deg(skeleton, local, "l_uparm", "l_lowarm"), degrees, places=4)

    def test_swings_below_the_epsilon_count_as_zero(self) -> None:
        skeleton = arm_skeleton()
        self.assertEqual(swing_deg(skeleton, pose_local(skeleton, [raise_arm("l", 0.009)]), "l_uparm", "l_lowarm"), 0.0)
        self.assertAlmostEqual(swing_deg(skeleton, pose_local(skeleton, [raise_arm("l", 0.02)]), "l_uparm", "l_lowarm"), 0.02, places=6)

    def test_twist_about_the_bone_does_not_change_swing(self) -> None:
        skeleton = arm_skeleton()
        bone_world = world_from_local(skeleton, skeleton.local)[1][:3, :3] @ skeleton.local[2][:3, 3]
        local = pose_local(skeleton, [("l_uparm", tuple(bone_world), 70.0)])
        self.assertAlmostEqual(swing_deg(skeleton, local, "l_uparm", "l_lowarm"), 0.0, places=4)

    def test_contract_ramps_are_additive(self) -> None:
        skeleton = arm_skeleton()
        side = {"version": 1, "correctives": [e for e in sidecar()["correctives"] if e["joint"] == "l_uparm"]}
        expected = {0: (0.0, 0.0), 45: (0.5, 0.0), 90: (1.0, 0.0), 105: (1.0, 0.5), 120: (1.0, 1.0), 150: (1.0, 1.0)}
        for degrees, (low, high) in expected.items():
            weights = corrective_weights(side, skeleton, pose_local(skeleton, [raise_arm("l", degrees)]))
            self.assertAlmostEqual(weights["corr_L_abd90"], low, places=4)
            self.assertAlmostEqual(weights["corr_L_abd120"], high, places=4)

    def test_sidecar_lists_contract_targets_in_order(self) -> None:
        document = sidecar()
        self.assertEqual(document["version"], 1)
        self.assertEqual([e["target"] for e in document["correctives"]], CONTRACT_NAMES)
        self.assertEqual([e["ramp"] for e in document["correctives"]], [[0, 90], [90, 120]] * 2)
        self.assertEqual([t for _, low, high in TARGETS for t in (low, high)], CONTRACT_NAMES)


class SkinningTests(unittest.TestCase):
    def test_dual_quaternions_equal_linear_blending_for_rigid_vertices(self) -> None:
        skeleton = arm_skeleton()
        matrices = skin_matrices(skeleton, pose_local(skeleton, [raise_arm("l", 100)]))
        rng = np.random.default_rng(0)
        points = rng.normal(size=(50, 3))
        joints = np.tile([1, 0, 0, 0], (50, 1))
        weights = np.tile([1.0, 0, 0, 0], (50, 1))
        np.testing.assert_allclose(dual_quaternion_skin(points, joints, weights, matrices), skin(points, joints, weights, matrices), atol=1e-9)
        rest = skin_matrices(skeleton, skeleton.local)
        mixed = np.tile([0.5, 0.5, 0, 0], (50, 1))
        np.testing.assert_allclose(dual_quaternion_skin(points, np.tile([1, 0, 0, 0], (50, 1)), mixed, rest), points, atol=1e-9)

    def test_region_weight_is_zero_across_the_midline_and_far_away(self) -> None:
        rules = CorrectiveRules()
        pivot = np.array([0.17, 1.42, 0.0])
        points = np.array([[0.17, 1.42, 0.0], [-0.01, 1.42, 0.0], [0.17, 1.42 - rules.outer_radius_m - 0.01, 0.0]])
        np.testing.assert_allclose(region_weight(points, pivot, "l", rules), [1.0, 0.0, 0.0])


class MorphGlbTests(unittest.TestCase):
    def test_morph_targets_round_trip_and_are_optional(self) -> None:
        vertices, faces = tube()
        loops = {f"loop{i}": loop for i, loop in enumerate(boundary_loops(faces))}
        joints = np.zeros((len(vertices), 4), dtype=np.int64)
        weights = np.tile([1.0, 0, 0, 0], (len(vertices), 1))
        arrays = assemble(OuterGarment(vertices, faces, np.zeros(faces.shape + (2,)), joints, weights, np.zeros(len(vertices), dtype=np.int32), loops), 0.002)
        body = two_joint_body(len(arrays["position"]))
        material = {"name": "m", "baseColor": [1, 1, 1, 1], "metalness": 0.0, "roughness": 0.9}
        morphs = {name: np.full((len(arrays["position"]), 3), k * 0.001) for k, name in enumerate(CONTRACT_NAMES)}
        with tempfile.TemporaryDirectory() as folder:
            plain, morphed, again = (Path(folder) / f"{n}.glb" for n in ("plain", "morphed", "again"))
            write_garment_glb(plain, arrays, body, {"garmentId": "t", "regions": ["torso"]}, material)
            write_garment_glb(again, arrays, body, {"garmentId": "t", "regions": ["torso"]}, material, None)
            write_garment_glb(morphed, arrays, body, {"garmentId": "t", "regions": ["torso"]}, material, morphs)
            self.assertEqual(plain.read_bytes(), again.read_bytes())
            document, _ = read_glb(plain)
            self.assertNotIn("targets", document["meshes"][0]["primitives"][0])
            document, _ = read_glb(morphed)
            mesh = document["meshes"][0]
            self.assertEqual(mesh["extras"]["targetNames"], CONTRACT_NAMES)
            self.assertEqual(mesh["weights"], [0.0] * 4)
            self.assertTrue(all(set(t) == {"POSITION"} for t in mesh["primitives"][0]["targets"]))
            (Path(folder) / "morphed.correctives.json").write_text(json.dumps(sidecar()), encoding="utf-8")
            asset = load_asset(morphed)
            self.assertEqual(list(asset.morphs), CONTRACT_NAMES)
            np.testing.assert_allclose(asset.morphs["corr_R_abd120"], 0.003, atol=1e-7)
            self.assertEqual(asset.sidecar, sidecar())


@unittest.skipUnless(V5_GARMENT.is_file() and V2_GARMENT.is_file() and NEUTRAL_AVATAR.is_file(), "generate the v5 corrective candidate first")
class GeneratedV5Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.v2 = load_asset(V2_GARMENT)
        cls.v5 = load_asset(V5_GARMENT)

    def test_rest_data_is_byte_equal_to_v2(self) -> None:
        from evaluate_correctives import accessor_bytes

        mine, base = accessor_bytes(V5_GARMENT), accessor_bytes(V2_GARMENT)
        self.assertEqual(set(mine), set(base))
        for key in base:
            self.assertEqual(mine[key], base[key], key)

    def test_rest_pose_has_zero_weights_and_equals_v2(self) -> None:
        posed5, _, weights = posed_positions(self.v5, [])
        posed2, _, _ = posed_positions(self.v2, [])
        self.assertEqual(set(weights.values()), {0.0})
        np.testing.assert_array_equal(posed5, posed2)

    def test_targets_are_local_to_their_own_shoulder(self) -> None:
        self.assertEqual(list(self.v5.morphs), CONTRACT_NAMES)
        rest_world = world_from_local(self.v5.skeleton, self.v5.skeleton.local)
        for name, delta in self.v5.morphs.items():
            side = "l" if "_L_" in name else "r"
            pivot = rest_world[self.v5.skeleton.index(f"{side}_uparm")][:3, 3]
            outside = region_weight(self.v5.positions, pivot, side, CorrectiveRules()) == 0
            self.assertTrue(outside.any())
            self.assertEqual(float(np.abs(delta[outside]).max()), 0.0, name)
            other = self.v5.positions[:, 0] < 0 if side == "l" else self.v5.positions[:, 0] > 0
            self.assertEqual(float(np.abs(delta[other]).max()), 0.0, name)
            self.assertGreater(float(np.linalg.norm(delta, axis=1).max()), 0.01, name)

    def test_deltas_have_no_single_vertex_spikes(self) -> None:
        from evaluate_correctives import morph_quality

        for name, quality in morph_quality(self.v5).items():
            # Large Laplacians exist only across the back armpit crease (a steep continuous gradient); no vertex sticks
            # out beyond the spread of its own neighbours, which is what a single-vertex spike would do (ratio >> 1).
            self.assertLess(quality["max_isolation_ratio"], 2.0, name)
            self.assertLess(quality["max_laplacian_m"], 0.03, name)

    def test_both_arms_at_90_meet_the_stretch_gate(self) -> None:
        from deform_metrics import triangle_deformation

        posed, matrices, weights = posed_positions(self.v5, [raise_arm("l", 90), raise_arm("r", 90)])
        self.assertGreater(weights["corr_L_abd90"], 0.99)  # a world-Z raise of the A-pose arm swings it ~89.8 deg
        stretch = triangle_deformation(self.v5.positions, posed, self.v5.indices, self.v5.joints, self.v5.weights, matrices)["stretch"]
        self.assertLessEqual(float(stretch.max()), 8.785)

    def test_sidecar_matches_contract(self) -> None:
        self.assertEqual(self.v5.sidecar, sidecar())


if __name__ == "__main__":
    unittest.main()
