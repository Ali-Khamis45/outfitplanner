"""Synthetic MHR fixtures test the adapter; they are not SAM inference results."""
from __future__ import annotations

import importlib.util
import sys
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
DEPENDENCIES = all(importlib.util.find_spec(name) is not None for name in ("torch", "numpy", "flask", "trimesh"))


@unittest.skipUnless(DEPENDENCIES, "MHR test environment is unavailable")
class AdapterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import numpy as np
        import torch
        import sam3d_mhr_adapter as adapter
        cls.np, cls.torch, cls.adapter = np, torch, adapter
        if not adapter.DEFAULT_MHR.is_file():
            raise unittest.SkipTest("Official MHR model asset is unavailable")
        cls.model = torch.jit.load(str(adapter.DEFAULT_MHR), map_location="cpu").eval()
        identity = np.zeros(45, dtype=np.float32)
        identity[0] = 0.5
        pose = np.zeros(204, dtype=np.float32)
        expression = np.zeros(72, dtype=np.float32)
        with torch.inference_mode():
            vertices, _ = cls.model(torch.from_numpy(identity[None]), torch.from_numpy(pose[None]), torch.from_numpy(expression[None]))
        cls.data = {"shape_params": identity, "mhr_model_params": pose, "expr_params": expression,
                    "pred_cam_t": np.array([0, 0, 2], dtype=np.float32), "focal_length": np.float32(1000),
                    "pred_vertices": vertices[0].numpy() / 100 * np.array([1, -1, -1], dtype=np.float32),
                    "mesh_faces": cls.model.character_torch.mesh.faces.cpu().numpy()}

    def test_official_evaluation_and_skinned_export(self) -> None:
        from validate_glb import validate
        payload, metadata = self.adapter.export(self.data, self.model)
        self.assertLess(metadata["max_vertex_error_m"], 1e-4)
        self.assertFalse(metadata["camera_applied_to_export"])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic.glb"
            path.write_bytes(payload)
            result = validate(path)
            if shutil.which("node"):
                loader_test = self.adapter.PROJECT / "apps" / "web" / "tests" / "mhr-loader.test.mjs"
                subprocess.run(["node", str(loader_test), str(path)], check=True, capture_output=True, text=True)
        self.assertEqual((result["vertices"], result["triangles"], result["joint_counts"]), (18439, 36874, [127]))

    def test_invalid_dimensions_and_nonfinite_are_rejected(self) -> None:
        data = dict(self.data)
        data["shape_params"] = self.np.zeros(44, dtype=self.np.float32)
        with self.assertRaisesRegex(self.adapter.AdapterError, "shape_params"):
            self.adapter.evaluate(data, self.model)
        data["shape_params"] = self.data["shape_params"].copy()
        data["shape_params"][0] = self.np.nan
        with self.assertRaisesRegex(self.adapter.AdapterError, "shape_params"):
            self.adapter.evaluate(data, self.model)

    def test_mismatched_geometry_is_rejected(self) -> None:
        data = dict(self.data)
        data["pred_vertices"] = self.data["pred_vertices"].copy()
        data["pred_vertices"][0, 0] += 0.1
        with self.assertRaisesRegex(self.adapter.AdapterError, "differ"):
            self.adapter.evaluate(data, self.model)

    def test_changed_identity_is_not_silently_accepted(self) -> None:
        data = dict(self.data)
        data["shape_params"] = self.np.zeros(45, dtype=self.np.float32)
        with self.assertRaisesRegex(self.adapter.AdapterError, "differ"):
            self.adapter.evaluate(data, self.model)


if __name__ == "__main__":
    unittest.main()
