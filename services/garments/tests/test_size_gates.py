"""Sprint 3.6: deformation gates on every shipped size (size_gates.py) and the chained hip corrective keys."""
from __future__ import annotations

import hashlib
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pants import PANTS_V2_SPECS, leg_corrective_specs  # noqa: E402

PROJECT = Path(__file__).resolve().parents[3]
SIZES_DIR = PROJECT / "outputs" / "garments" / "sizes"
MANIFEST = PROJECT / "outputs" / "garments" / "personal" / "manifest.json"
GATE_REPORTS = PROJECT / "outputs" / "garment-tests"


class ChainedHipKeyTests(unittest.TestCase):
    def test_the_default_keeps_the_single_90_deg_key(self) -> None:
        """Pants v1-v3 and the v5.2 / pants-v2 sizes keep their exact specs (byte-for-byte regeneration)."""
        specs = leg_corrective_specs(**PANTS_V2_SPECS)
        self.assertEqual([s.target for s in specs], ["corr_L_hip90", "corr_L_knee90", "corr_R_hip90", "corr_R_knee90"])
        hip = specs[0]
        self.assertEqual((hip.ramp, hip.rotations[0][2], hip.base), ((20.0, 90.0), -90.0, None))

    def test_60_and_90_deg_keys_chain_with_contiguous_ramps(self) -> None:
        specs = leg_corrective_specs(**{**PANTS_V2_SPECS, "hip_keys_deg": (60.0, 90.0)})
        self.assertEqual([s.target for s in specs], ["corr_L_hip60", "corr_L_hip90", "corr_L_knee90", "corr_R_hip60", "corr_R_hip90", "corr_R_knee90"])
        by_name = {s.target: s for s in specs}
        for tag in ("L", "R"):
            low, high = by_name[f"corr_{tag}_hip60"], by_name[f"corr_{tag}_hip90"]
            self.assertEqual((low.ramp, low.rotations[0][2], low.base), ((20.0, 60.0), -60.0, None))
            self.assertEqual((high.ramp, high.rotations[0][2], high.base), ((60.0, 90.0), -90.0, low.target))
            self.assertLess(specs.index(low), specs.index(high))  # the base is solved first
            self.assertEqual(low.measure, "signed_swing_deg")


class OriginalShirtTests(unittest.TestCase):
    def test_every_avatar_variant_maps_to_its_v1_fit(self) -> None:
        from size_gates import AVATARS, GARMENTS, original_shirt

        stem = "sam3d-person-front-sprint03-run2"
        self.assertEqual(original_shirt(AVATARS / "mhr-neutral.glb"), (GARMENTS / "tshirt-mhr-neutral.glb", AVATARS / "mhr-neutral.glb"))
        for suffix, base in (("rest-identity-scale-floor-calibrated", "rest-identity-scale"), ("rest-identity-scale-floor", "rest-identity-scale"), ("rest-identity", "rest-identity")):
            self.assertEqual(original_shirt(AVATARS / f"{stem}-{suffix}.glb"), (GARMENTS / f"tshirt-{stem}-{base}.glb", AVATARS / f"{stem}-{base}.glb"))
        with self.assertRaises(ValueError):
            original_shirt(AVATARS / "someone-else.glb")


def gate_reports() -> dict[str, list[dict]]:
    """Every size_gates report on disk (<name>.gates.json, written by generate_sizes.py or the size_gates.py CLI), by GLB name."""
    found: dict[str, list[dict]] = {}
    for path in GATE_REPORTS.rglob("*.gates.json"):
        for name, report in json.loads(path.read_text(encoding="utf-8")).items():
            found.setdefault(name, []).append(report)
    return found


@unittest.skipUnless(any(SIZES_DIR.glob("*.glb")), "generate the sizes first")
class ShippedGarmentGateTests(unittest.TestCase):
    """A size (and every garment the personal manifest lists) ships only with a passing gate report for its exact bytes."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.reports = gate_reports()

    def assert_gated(self, glb: Path) -> None:
        digest = hashlib.sha256(glb.read_bytes()).hexdigest()
        matching = [r for r in self.reports.get(glb.name, []) if r.get("sha256") == digest]
        self.assertTrue(matching, f"{glb.name}: no gate report for these bytes")
        self.assertTrue(all(r["pass"] for r in matching), f"{glb.name}: gates failed")

    def test_every_shipped_size_passes_its_gates(self) -> None:
        for glb in sorted(SIZES_DIR.glob("*.glb")):
            with self.subTest(glb=glb.name):
                self.assert_gated(glb)

    @unittest.skipUnless(MANIFEST.is_file(), "no personal manifest")
    def test_every_personal_manifest_garment_passes_its_gates(self) -> None:
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        for entry in [manifest["primary"], *manifest["secondary"]]:
            for part in ("top", "bottom"):
                with self.subTest(body=entry["id"], part=part):
                    self.assert_gated(PROJECT / entry[part]["glb"])

    def test_every_withheld_size_has_its_note_and_failing_gates(self) -> None:
        """A withheld size (outputs/garments/sizes-withheld/) failed its gates for these exact bytes and is not shipped."""
        withheld = SIZES_DIR.with_name("sizes-withheld")
        for note_path in sorted(withheld.glob("*.withheld.json")):
            note = json.loads(note_path.read_text(encoding="utf-8"))
            name = note_path.name[: -len(".withheld.json")]
            with self.subTest(size=name):
                self.assertEqual((note["version"], note["size"]), (1, name))
                self.assertTrue(note["failed_gates"])
                self.assertFalse((SIZES_DIR / f"{name}.glb").exists(), "withheld and shipped at once")
                glb = withheld / f"{name}.glb"
                digest = hashlib.sha256(glb.read_bytes()).hexdigest()
                reports = [r for r in self.reports.get(glb.name, []) if r.get("sha256") == digest]
                self.assertTrue(reports and not any(r["pass"] for r in reports), f"{name}: no failing gate report for these bytes")
                fit = json.loads((withheld / f"{name}.fit.json").read_text(encoding="utf-8"))
                self.assertFalse(fit["recommended"], "a recommended size is never withheld")

    def test_size_pants_carry_the_chained_hip_keys(self) -> None:
        for sidecar_path in sorted(SIZES_DIR.glob("pants-*.correctives.json")):
            ramps = {e["target"]: e["ramp"] for e in json.loads(sidecar_path.read_text(encoding="utf-8"))["correctives"]}
            for tag in ("L", "R"):
                self.assertEqual(ramps.get(f"corr_{tag}_hip60"), [20.0, 60.0], sidecar_path.name)
                self.assertEqual(ramps.get(f"corr_{tag}_hip90"), [60.0, 90.0], sidecar_path.name)


if __name__ == "__main__":
    unittest.main()
