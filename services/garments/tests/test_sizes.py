"""Sprint 3A: size specs, fit statuses, recommendation, measurements, calibration and the generated sizes."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

import numpy as np
import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from calibrate import parse_measurements  # noqa: E402
from measure import girth  # noqa: E402
from sizes import CHART_CM, LENGTH_GRADE_M, PANTS_HIP_EASE_M, SHIRT_CHEST_EASE_M, SIZES, recommend, status  # noqa: E402

PROJECT = Path(__file__).resolve().parents[3]
SIZES_DIR = PROJECT / "outputs" / "garments" / "sizes"  # the default generation: tshirt-v5.3 / pants-v3
LEGACY_SIZES_DIR = PROJECT / "outputs" / "garments" / "sizes-v5.2"  # tshirt-v5.2 / pants-v2, kept for one sprint
CANDIDATE_PANTS_DIR = PROJECT / "outputs" / "garments" / "sizes-pants-v3.1"  # candidate pants-v3.1 (no knee step)
SIZE_DIRS = [d for d in (SIZES_DIR, LEGACY_SIZES_DIR, CANDIDATE_PANTS_DIR) if d.is_dir()]
# per generation: its folder, the generate_sizes reports holding each size's ease levels, and the garment tags
GENERATIONS = [(SIZES_DIR, ("sizes-sprint-3.5-neutral.json", "sizes-sprint-3.5-personal.json"), {"tshirt": "tshirt-v5.3", "pants": "pants-v3"}),
               (LEGACY_SIZES_DIR, ("sizes-sprint-3a.json",), {"tshirt": "tshirt-v5.2", "pants": "pants-v2"}),
               (CANDIDATE_PANTS_DIR, ("sizes-sprint-3.5-knee-neutral.json", "sizes-sprint-3.5-knee-personal-scaled.json"), {"pants": "pants-v3.1"})]
MODEL_PRESENT = (PROJECT / "external").is_dir()


class SpecTests(unittest.TestCase):
    def test_chart_midpoints_and_eases_match_the_contract(self) -> None:
        self.assertEqual(CHART_CM["S"], (89.5, 73.5, 91.5))
        self.assertEqual(CHART_CM["XL"], (119.5, 109.5, 121.5))
        self.assertAlmostEqual(SHIRT_CHEST_EASE_M, 0.116)
        self.assertAlmostEqual(PANTS_HIP_EASE_M, 0.090)
        self.assertAlmostEqual(LENGTH_GRADE_M, 0.0254)

    def test_grading_is_by_region_not_uniform(self) -> None:
        chest_steps = np.diff([CHART_CM[s][0] for s in SIZES])
        waist_steps = np.diff([CHART_CM[s][1] for s in SIZES])
        self.assertFalse(np.allclose(waist_steps / chest_steps, waist_steps[0] / chest_steps[0]))  # waist grades differently
        ratios = [CHART_CM[s][0] / CHART_CM["M"][0] for s in SIZES]
        self.assertNotAlmostEqual(ratios[3] - 1, (CHART_CM["XL"][1] / CHART_CM["M"][1]) - 1, places=3)


class StatusTests(unittest.TestCase):
    def test_thresholds_include_their_bounds_in_good(self) -> None:
        self.assertEqual(status(76.2, 76.2, 203.2), "good")
        self.assertEqual(status(76.1, 76.2, 203.2), "tight")
        self.assertEqual(status(203.3, 76.2, 203.2), "loose")

    def test_recommend_is_the_smallest_size_without_tight_girths(self) -> None:
        good, tight = {"status": "good"}, {"status": "tight"}
        regions = {"S": {"chest": tight, "waist": good}, "M": {"chest": good, "waist": tight}, "L": {"chest": good, "waist": good}, "XL": {"chest": good, "waist": good}}
        self.assertEqual(recommend(regions, ("chest", "waist")), "L")
        all_tight = {s: {"chest": tight} for s in SIZES}
        self.assertEqual(recommend(all_tight, ("chest",)), "XL")


class MeasureTests(unittest.TestCase):
    def test_girth_of_a_cylinder_is_its_circumference(self) -> None:
        cylinder = trimesh.creation.cylinder(radius=0.15, height=0.4, sections=256)
        cylinder.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))  # axis along y
        self.assertAlmostEqual(girth(np.asarray(cylinder.vertices), np.asarray(cylinder.faces), 0.05), 2 * np.pi * 0.15, delta=0.001)


class MeasurementsSchemaTests(unittest.TestCase):
    def test_nulls_are_skipped_and_height_is_required(self) -> None:
        document = {"version": 1, "units": "cm", "height_cm": 178.0, "chest_cm": 102.0, "waist_cm": None, "hips_cm": 100.0, "inseam_cm": None, "measured_at": "2026-11-13"}
        self.assertEqual(parse_measurements(document), {"chest_cm": 102.0, "hips_cm": 100.0, "height_cm": 178.0})
        for broken in ({**document, "height_cm": None}, {**document, "units": "in"}, {**document, "version": 2}, {**document, "chest_cm": -3}):
            with self.assertRaises(ValueError):
                parse_measurements(broken)


@unittest.skipUnless(MODEL_PRESENT, "MHR model not installed")
class CalibrationTests(unittest.TestCase):
    def test_calibration_matches_circumferences_within_1_cm(self) -> None:
        from body import evaluate_rest_body, load_model
        from calibrate import calibrate_body
        from measure import body_measurements

        model = load_model()
        m = body_measurements(evaluate_rest_body(model, "neutral"))
        document = {"version": 1, "units": "cm", "height_cm": m["height_m"] * 100, "chest_cm": m["chest_m"] * 100 + 2.0, "waist_cm": m["waist_m"] * 100 - 1.5, "hips_cm": None, "inseam_cm": None, "measured_at": "2026-11-13"}
        _, report = calibrate_body(model, "neutral", None, document, components=8)
        self.assertTrue(report["circumferences_within_1cm"])
        self.assertEqual(report["not_provided"], ["hips_cm", "inseam_cm"])
        self.assertEqual(report["held_at_reconstruction"], ["hips_cm"])
        self.assertGreater(abs(report["errors"]["chest_cm"]["before_cm"]), 1.5)
        self.assertLessEqual(abs(report["errors"]["chest_cm"]["after_cm"]), 1.0)


class HeightOnlyCalibrationTests(unittest.TestCase):
    def test_height_only_changes_height_and_holds_the_girths(self) -> None:
        from body import evaluate_rest_body, load_model
        from calibrate import calibrate_body
        from measure import body_measurements

        model = load_model()
        m = body_measurements(evaluate_rest_body(model, "neutral"))
        document = {"version": 1, "units": "cm", "height_cm": m["height_m"] * 100 + 6.0, "chest_cm": None, "waist_cm": None, "hips_cm": None, "inseam_cm": None, "measured_at": "2026-11-16"}
        _, report = calibrate_body(model, "neutral", None, document)
        self.assertEqual(report["calibrated"], ["height_cm"])
        self.assertEqual(report["held_at_reconstruction"], ["chest_cm", "waist_cm", "hips_cm"])
        self.assertLess(report["errors"]["height_cm"]["before_cm"], -5.9)
        self.assertLessEqual(abs(report["errors"]["height_cm"]["after_cm"]), 0.1)
        for key in ("chest_cm", "waist_cm", "hips_cm"):
            self.assertLessEqual(abs(report["errors"][key]["after_cm"]), 0.2, key)


@unittest.skipUnless(any(any(d.glob("*.fit.json")) for d in SIZE_DIRS), "generate the sizes first")
class GeneratedSizesTests(unittest.TestCase):
    def test_fit_json_schema_and_one_recommendation_per_garment_and_body(self) -> None:
        recommended: dict[tuple[str, str], int] = {}
        for path in (p for d in SIZE_DIRS for p in d.glob("*.fit.json")):
            fit = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(set(fit), {"version", "garment", "size", "body", "regions", "recommended"}, path.name)
            self.assertEqual(fit["version"], 1)
            self.assertEqual(path.name, f"{fit['garment']}-{fit['size']}-{fit['body']}.fit.json")
            expected = {"chest", "waist", "hips", "shoulders", "length"} if fit["garment"].startswith("tshirt") else {"waist", "hips", "length"}
            self.assertEqual(set(fit["regions"]), expected, path.name)
            for name, region in fit["regions"].items():
                self.assertIn(region["status"], ("tight", "good", "loose"))
                base = {"delta_mm", "status"} if name == "length" else {"ease_mm", "status"}
                self.assertIn(set(region), (base, base | {"clamped"}), f"{path.name} {name}")
                self.assertIs(region.get("clamped", True), True)  # only ever present as true
                if name == "length":
                    self.assertNotIn("clamped", region)
                self.assertIsInstance(region["delta_mm" if name == "length" else "ease_mm"], int)
            key = (fit["garment"], fit["body"])
            recommended[key] = recommended.get(key, 0) + int(fit["recommended"])
        self.assertTrue(recommended)
        self.assertTrue(all(count == 1 for count in recommended.values()), recommended)

    def test_clamped_shoulders_report_the_spec_not_the_mesh(self) -> None:
        for path in (p for d in SIZE_DIRS for p in d.glob("tshirt-*-S-*.fit.json")):
            fit = json.loads(path.read_text(encoding="utf-8"))
            self.assertTrue(fit["regions"]["shoulders"].get("clamped"), path.name)  # S keeps the base armhole
        for path in (p for d in SIZE_DIRS for p in d.glob("tshirt-*-L-*.fit.json")):
            fit = json.loads(path.read_text(encoding="utf-8"))
            self.assertNotIn("clamped", fit["regions"]["shoulders"], path.name)  # L grades up: mesh follows the spec

    def test_vertex_ease_agrees_in_sign_with_each_region(self) -> None:
        """Per region, the median _EASE_MM of the region's vertices has the sign of the region's ease_mm (fit.json)."""
        from garment_glb import accessor_array, read_glb
        from sizes import region_vertex_masks

        def reported_sizes():
            """(GLB, fit.json, size entry of the report, garment) for every size a generation's reports describe."""
            for directory, report_names, tags in GENERATIONS:
                for report_name in report_names:
                    report_path = PROJECT / "outputs" / "garment-tests" / report_name
                    if not (report_path.is_file() and directory.is_dir()):
                        continue
                    for body_id, body in json.loads(report_path.read_text(encoding="utf-8"))["bodies"].items():
                        for garment, sizes in body["garments"].items():
                            for size in SIZES:
                                if size in sizes:
                                    stem = directory / f"{tags[garment]}-{size}-{body_id}"
                                    yield stem.with_name(stem.name + ".glb"), stem.with_name(stem.name + ".fit.json"), sizes[size], garment

        checked = 0
        for glb, fit_path, entry, garment in reported_sizes():
            fit = json.loads(fit_path.read_text(encoding="utf-8"))
            document, blob = read_glb(glb)
            attributes = document["meshes"][0]["primitives"][0]["attributes"]
            ease = accessor_array(document, blob, attributes["_EASE_MM"])
            positions = accessor_array(document, blob, attributes["POSITION"]).astype(np.float64)
            region = accessor_array(document, blob, attributes["_REGION"])
            masks = region_vertex_masks(positions, region, entry["levels"], "pants" if garment == "pants" else "shirt")
            for name, mask in masks.items():
                value = fit["regions"][name]["ease_mm"]
                self.assertGreater(int(mask.sum()), 20, f"{glb.name} {name}")
                if abs(value) < 5:  # within the fitting tolerance: no meaningful sign
                    continue
                median = float(np.median(ease[mask]))
                self.assertEqual(np.sign(median), np.sign(value), f"{glb.name} {name}: median vertex ease {median:.1f} mm vs region {value} mm")
                checked += 1
        if not checked:
            self.skipTest("size reports not generated")

    def test_vertex_ease_has_no_steps_along_the_torso(self) -> None:
        """No hard horizontal edge: the median ease of 1 cm torso slices never jumps by more than 8 mm between slices."""
        from garment_glb import accessor_array, read_glb
        from tshirt import REGION_TORSO

        for glb in (p for d in SIZE_DIRS for p in d.glob("tshirt-*.glb")):
            document, blob = read_glb(glb)
            attributes = document["meshes"][0]["primitives"][0]["attributes"]
            ease = accessor_array(document, blob, attributes["_EASE_MM"])
            positions = accessor_array(document, blob, attributes["POSITION"]).astype(np.float64)
            torso = accessor_array(document, blob, attributes["_REGION"]) == REGION_TORSO
            y = positions[torso, 1]
            levels = np.arange(np.ceil(y.min() * 100) / 100 + 0.01, np.floor(y.max() * 100) / 100 - 0.01, 0.01)
            medians = np.array([np.median(ease[torso][np.abs(y - level) < 0.005]) for level in levels if (np.abs(y - level) < 0.005).sum() > 20])
            self.assertLess(float(np.abs(np.diff(medians)).max()), 8.0, glb.name)

    def test_glbs_carry_ease_and_matching_sidecars(self) -> None:
        from garment_glb import accessor_array, read_glb

        for glb in (p for d in SIZE_DIRS for p in d.glob("*.glb")):
            document, blob = read_glb(glb)
            primitive = document["meshes"][0]["primitives"][0]
            self.assertIn("_EASE_MM", primitive["attributes"], glb.name)
            ease = accessor_array(document, blob, primitive["attributes"]["_EASE_MM"])
            self.assertEqual(len(ease), document["accessors"][primitive["attributes"]["POSITION"]]["count"])
            self.assertTrue(np.isfinite(ease).all())
            sidecar = json.loads((glb.parent / (glb.name[: -len(".glb")] + ".correctives.json")).read_text(encoding="utf-8"))
            self.assertEqual(sorted(e["target"] for e in sidecar["correctives"]), sorted(document["meshes"][0]["extras"]["targetNames"]))


if __name__ == "__main__":
    unittest.main()
