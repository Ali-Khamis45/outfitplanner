"""Sprint 2.0A: leg pose contract and the generated basic pants."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from correctives import spec_sidecar  # noqa: E402
from leg_poses import LEG_POSES  # noqa: E402
from posing import corrective_weights, load_asset, pose_local, posed_positions, world_from_local  # noqa: E402

PROJECT = Path(__file__).resolve().parents[3]
NEUTRAL_AVATAR = PROJECT / "outputs" / "avatars" / "mhr-neutral.glb"
PANTS = PROJECT / "outputs" / "garments" / "pants-basic-v1-mhr-neutral.glb"
PANTS_TARGETS = ["corr_L_hip90", "corr_L_knee90", "corr_R_hip90", "corr_R_knee90"]
# docs/contracts/leg-poses.md sanity table: unit left thigh (l_upleg->l_lowleg) and shank (l_lowleg->l_foot) directions
SANITY = {
    "rest": ((0.119, -0.991, -0.058), (0.114, -0.988, -0.102)),
    "l-hip-60": ((0.119, -0.546, 0.830), (0.114, -0.583, 0.805)),
    "step": ((0.119, -0.058, 0.991), (0.114, -0.988, -0.102)),
    "squat": ((0.119, -0.742, 0.660), (0.114, -0.928, -0.355)),
    "wide": ((0.451, -0.891, -0.058), (0.445, -0.890, -0.102)),
}


@unittest.skipUnless(NEUTRAL_AVATAR.is_file(), "neutral avatar GLB not generated")
class LegPoseContractTests(unittest.TestCase):
    def test_pose_table_matches_contract_sanity_values(self) -> None:
        skeleton = load_asset(NEUTRAL_AVATAR).skeleton
        self.assertEqual(list(LEG_POSES), ["rest", "walk", "l-hip-60", "step", "squat", "wide"])

        def direction(world: np.ndarray, a: str, b: str) -> np.ndarray:
            v = world[skeleton.index(b)][:3, 3] - world[skeleton.index(a)][:3, 3]
            return v / np.linalg.norm(v)

        for name, (thigh, shank) in SANITY.items():
            world = world_from_local(skeleton, pose_local(skeleton, LEG_POSES[name]))
            np.testing.assert_allclose(direction(world, "l_upleg", "l_lowleg"), thigh, atol=1.5e-3, err_msg=name)
            np.testing.assert_allclose(direction(world, "l_lowleg", "l_foot"), shank, atol=1.5e-3, err_msg=name)

    def test_poses_only_rotate_hips_and_knees(self) -> None:
        allowed = {"l_upleg", "r_upleg", "l_lowleg", "r_lowleg"}
        for name, rotations in LEG_POSES.items():
            self.assertTrue({joint for joint, _, _ in rotations} <= allowed, name)


@unittest.skipUnless(PANTS.is_file() and NEUTRAL_AVATAR.is_file(), "generate the basic pants first")
class GeneratedPantsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.pants = load_asset(PANTS)

    def test_pants_validate_against_the_neutral_avatar(self) -> None:
        from validate_garment import validate

        report = validate(PANTS, NEUTRAL_AVATAR)
        self.assertEqual(report["shell"]["genus"], 2)  # closed shell with three openings: waist and two hems
        self.assertEqual(report["rest_clearance"]["penetrating_vertices"], 0)
        self.assertEqual(report["morph_targets"]["targets"], PANTS_TARGETS)

    def test_sidecar_matches_the_leg_corrective_specs(self) -> None:
        from pants import leg_corrective_specs

        self.assertEqual(self.pants.sidecar, spec_sidecar(leg_corrective_specs()))
        self.assertEqual(list(self.pants.morphs), PANTS_TARGETS)

    def test_hip_targets_stay_off_for_extension_and_abduction(self) -> None:
        skeleton = self.pants.skeleton
        for name in ("rest", "wide"):
            weights = corrective_weights(self.pants.sidecar, skeleton, pose_local(skeleton, LEG_POSES[name]))
            self.assertEqual(weights["corr_L_hip90"], 0.0, name)
            self.assertEqual(weights["corr_R_hip90"], 0.0, name)
        walk = corrective_weights(self.pants.sidecar, skeleton, pose_local(skeleton, LEG_POSES["walk"]))
        self.assertEqual(walk["corr_R_hip90"], 0.0)  # right hip extends 15 deg
        self.assertGreater(walk["corr_L_hip90"], 0.0)  # left hip flexes 30 deg

    def test_rest_pose_is_the_bind_geometry(self) -> None:
        posed, _, weights = posed_positions(self.pants, [])
        self.assertEqual(set(weights.values()), {0.0})
        np.testing.assert_allclose(posed, self.pants.positions, atol=2e-7)

    def test_side_targets_do_not_cross_the_midline(self) -> None:
        for name, delta in self.pants.morphs.items():
            other = self.pants.positions[:, 0] < 0 if "_L_" in name else self.pants.positions[:, 0] > 0
            self.assertEqual(float(np.abs(delta[other]).max()), 0.0, name)

    def test_crotch_weights_are_shared_equally_on_the_seam(self) -> None:
        names = self.pants.skeleton.names
        left = np.array([n.startswith("l_") for n in names])[self.pants.joints]
        right = np.array([n.startswith("r_") for n in names])[self.pants.joints]
        left_share, right_share = (self.pants.weights * left).sum(axis=1), (self.pants.weights * right).sum(axis=1)
        seam = (np.abs(self.pants.positions[:, 0]) < 0.002) & (self.pants.positions[:, 1] < 0.79) & (self.pants.positions[:, 1] > 0.76)
        self.assertGreater(int(seam.sum()), 10)
        # without the blend the share jumps by ~1.0 across the seam; the remainder is the 4-influence truncation (root plus
        # two twist joints per leg is five influences, one of which is dropped)
        self.assertLess(float(np.abs(left_share[seam] - right_share[seam]).max()), 0.2)

    def test_waistband_sits_above_the_v2_shirt_hem_by_three_centimetres(self) -> None:
        shirt = PROJECT / "outputs" / "garments" / "tshirt-v2-mhr-neutral.glb"  # v5 rest geometry is byte-equal to v2
        if not shirt.is_file():
            self.skipTest("v2 shirt not generated")
        self.assertGreaterEqual(float(self.pants.positions[:, 1].max() - load_asset(shirt).positions[:, 1].min()), 0.03)


if __name__ == "__main__":
    unittest.main()
