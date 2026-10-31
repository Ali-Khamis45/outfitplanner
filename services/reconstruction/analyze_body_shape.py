"""Attribute posture and torso-shape features of a SAM 3D Body result to identity, scale, pose or camera.

Re-evaluates the saved parameters with the official MHR model under controlled variants (mean body,
identity only, identity + scale in rest pose, full pose with and without pose correctives), then
measures sagittal angles and torso depth profiles. Renders orthographic front/side/back views into a
new private directory under outputs/. Read-only with respect to the reconstruction itself.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import torch

PROJECT = Path(__file__).resolve().parents[2]
DEFAULT_MHR = PROJECT / "external" / "MHR" / "assets" / "mhr_model.pt"
SLICE_HALF_HEIGHT_M = 0.01
TORSO_HALF_WIDTH_M = 0.17
PROFILE_HEIGHTS = (0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75)


def evaluate(model: Any, identity: np.ndarray, params: np.ndarray, expression: np.ndarray, correctives: bool = True) -> tuple[np.ndarray, np.ndarray]:
    with torch.inference_mode():
        vertices, skeleton = model(torch.from_numpy(identity[None]), torch.from_numpy(params[None]), torch.from_numpy(expression[None]), correctives)
    return vertices[0].numpy().astype(np.float64) / 100.0, skeleton[0].numpy().astype(np.float64)[:, :3] / 100.0


def unit(vector: np.ndarray) -> np.ndarray:
    return vector / np.linalg.norm(vector)


class Body:
    """Joint lookups and a sagittal frame (up = +Y in MHR, forward = horizontal toe direction)."""

    def __init__(self, vertices: np.ndarray, joints: np.ndarray, names: list[str]) -> None:
        self.vertices, self.joints, self.index = vertices, joints, {name: i for i, name in enumerate(names)}
        self.up = np.array([0.0, 1.0, 0.0])
        toes = self.mid("l_ball", "r_ball") - self.mid("l_talocrural", "r_talocrural")
        self.forward = unit(toes - toes.dot(self.up) * self.up)

    def joint(self, name: str) -> np.ndarray:
        return self.joints[self.index[name]]

    def mid(self, left: str, right: str) -> np.ndarray:
        return (self.joint(left) + self.joint(right)) / 2

    def lean_degrees(self, start: np.ndarray, end: np.ndarray, up: np.ndarray | None = None) -> float:
        """Signed angle of start→end from vertical in the sagittal plane; positive leans forward."""
        vector = end - start
        return float(np.degrees(np.arctan2(vector.dot(self.forward), vector.dot(self.up if up is None else up))))

    def angles(self) -> dict[str, float]:
        ankles, hips = self.mid("l_talocrural", "r_talocrural"), self.mid("l_upleg", "r_upleg")
        neck, head = self.joint("c_neck"), self.joint("c_head")
        return {
            "legs_ankle_to_hip": self.lean_degrees(ankles, hips),
            "torso_hip_to_neck": self.lean_degrees(hips, neck),
            "lower_spine_root_to_spine2": self.lean_degrees(self.joint("root"), self.joint("c_spine2")),
            "upper_spine_spine2_to_neck": self.lean_degrees(self.joint("c_spine2"), neck),
            "head_neck_to_head": self.lean_degrees(neck, head),
            "whole_body_ankle_to_head": self.lean_degrees(ankles, head),
            "left_foot_pitch": float(np.degrees(np.arcsin(unit(self.joint("l_ball") - self.joint("l_talocrural")).dot(self.up)))),
            "right_foot_pitch": float(np.degrees(np.arcsin(unit(self.joint("r_ball") - self.joint("r_talocrural")).dot(self.up)))),
        }

    def torso_profile(self) -> dict[str, Any]:
        """Front/back extent of thin horizontal torso slices in a torso-aligned frame."""
        hips, neck = self.mid("l_upleg", "r_upleg"), self.joint("c_neck")
        up = unit(neck - hips)
        forward = unit(self.forward - self.forward.dot(up) * up)
        side = np.cross(up, forward)
        local = self.vertices - hips
        height = local @ up
        depth = local @ forward
        lateral = local @ side
        bottom, top = float((self.vertices @ self.up).min()), float((self.vertices @ self.up).max())
        stature = top - bottom
        hip_height = float(hips @ self.up) - bottom
        slices = {}
        for fraction in PROFILE_HEIGHTS:
            target = fraction * stature - hip_height
            mask = (np.abs(height - target) < SLICE_HALF_HEIGHT_M) & (np.abs(lateral) < TORSO_HALF_WIDTH_M)
            if mask.sum() < 10:
                continue
            slices[f"{fraction:.2f}"] = {"front_m": float(depth[mask].max()), "back_m": float(depth[mask].min()), "depth_m": float(np.ptp(depth[mask])), "width_m": float(np.ptp(lateral[mask])), "vertices": int(mask.sum())}
        abdomen = [slices[k]["front_m"] for k in ("0.55", "0.60") if k in slices]
        chest = slices.get("0.70", {}).get("front_m")
        return {"stature_m": stature, "slices": slices, "abdomen_minus_chest_front_m": (max(abdomen) - chest) if abdomen and chest is not None else None}


def render_views(vertices: np.ndarray, faces: np.ndarray, path: Path, label: str, forward: np.ndarray) -> None:
    """Flat-shaded orthographic front, side and back views (painter's algorithm, no GPU)."""
    from PIL import Image, ImageDraw

    up = np.array([0.0, 1.0, 0.0])
    side = np.cross(up, forward)
    views = {"front": (side, forward), "side": (forward, -side), "back": (-side, -forward)}
    size, margin = 520, 30
    canvas = Image.new("RGB", (size * 3, size + 40), "white")
    centre = vertices.mean(axis=0)
    span = float(np.ptp(vertices @ up)) * 1.08
    for column, (name, (right, toward)) in enumerate(views.items()):
        local = vertices - centre
        x = local @ right
        y = local @ up
        z = local @ toward
        scale = (size - 2 * margin) / span
        px = np.stack([size / 2 + x * scale + column * size, size / 2 - y * scale + 20], axis=1)
        triangles = faces[np.argsort(z[faces].mean(axis=1))]
        normals = np.cross(local[triangles[:, 1]] - local[triangles[:, 0]], local[triangles[:, 2]] - local[triangles[:, 0]])
        normals /= np.linalg.norm(normals, axis=1, keepdims=True) + 1e-12
        light = np.clip(np.abs(normals @ unit(toward + 0.4 * up)), 0.15, 1.0)
        draw = ImageDraw.Draw(canvas)
        for triangle, shade in zip(triangles, light):
            tone = int(70 + 170 * shade)
            draw.polygon([tuple(px[i]) for i in triangle], fill=(tone, tone, min(255, tone + 12)))
        draw.text((column * size + 12, 6), f"{label} — {name}", fill=(20, 20, 20))
        draw.line([(column * size + size / 2, 20), (column * size + size / 2, size + 20)], fill=(220, 120, 120))
    canvas.save(path)


def reprojection_error(data: Any, width: int, height: int) -> float:
    """Mean pixel error of the 3D keypoints projected with the model's own camera versus its 2D keypoints."""
    points = np.asarray(data["pred_keypoints_3d"], dtype=np.float64) + np.asarray(data["pred_cam_t"], dtype=np.float64)
    focal = float(np.asarray(data["focal_length"]).reshape(-1)[0])
    projected = focal * points[:, :2] / points[:, 2:3] + np.array([width / 2, height / 2])
    return float(np.linalg.norm(projected - np.asarray(data["pred_keypoints_2d"], dtype=np.float64), axis=1).mean())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", type=Path, required=True, help="reconstruction.npz from the SAM CLI")
    parser.add_argument("--metadata", type=Path, required=True, help="metadata.json from the same run")
    parser.add_argument("--output", type=Path, required=True, help="New directory inside outputs/ for renders and metrics")
    parser.add_argument("--mhr-model", type=Path, default=DEFAULT_MHR)
    args = parser.parse_args()
    target = args.output.resolve()
    if (PROJECT / "outputs").resolve() not in target.parents or target.exists():
        parser.error("output must be a new directory inside outputs/")
    model = torch.jit.load(str(args.mhr_model), map_location="cpu").eval()
    names = list(model.get_joint_names())
    transform = model.character_torch.parameter_transform
    pose_mask = transform.pose_parameters[:204].numpy()
    scale_mask = transform.scaling_parameters[:204].numpy()
    if pose_mask.sum() + scale_mask.sum() != 204 or (pose_mask & scale_mask).any():
        raise SystemExit("Unexpected MHR parameter layout; pose and scale masks must partition the 204 model parameters.")
    metadata = json.loads(args.metadata.read_text(encoding="utf-8"))
    with np.load(args.input, allow_pickle=False) as data:
        identity = data["shape_params"].astype(np.float32)
        params = data["mhr_model_params"].astype(np.float32)
        expression = data["expr_params"].astype(np.float32)
        sam_vertices = data["pred_vertices"].astype(np.float64)
        faces = data["mesh_faces"]
        dims = metadata["input_dimensions"]
        camera = {"focal_length_px": float(np.asarray(data["focal_length"]).reshape(-1)[0]), "image_height_px": dims["height"], "vertical_fov_deg": float(np.degrees(2 * np.arctan(dims["height"] / 2 / float(np.asarray(data["focal_length"]).reshape(-1)[0])))), "cam_t_m": data["pred_cam_t"].tolist(), "keypoint_reprojection_error_px": reprojection_error(data, dims["width"], dims["height"])}
    zeros_identity, zeros_params = np.zeros_like(identity), np.zeros_like(params)
    rest_scaled = np.where(scale_mask, params, 0).astype(np.float32)
    variants = {
        "mean_body_rest": (zeros_identity, zeros_params, True),
        "identity_rest": (identity, zeros_params, True),
        "identity_scale_rest": (identity, rest_scaled, True),
        "posed": (identity, params, True),
        "posed_without_correctives": (identity, params, False),
    }
    report: dict[str, Any] = {"camera": camera, "parameter_layout": {"pose": int(pose_mask.sum()), "scale": int(scale_mask.sum())}, "variants": {}}
    bodies: dict[str, Body] = {}
    for name, (shape, pose, correctives) in variants.items():
        vertices, joints = evaluate(model, shape, pose, expression if name.startswith("posed") else np.zeros_like(expression), correctives)
        bodies[name] = Body(vertices, joints, names)
        report["variants"][name] = {"angles_deg": bodies[name].angles(), "torso": bodies[name].torso_profile()}
    posed_sam_axes = bodies["posed"].vertices * np.array([1.0, -1.0, -1.0])
    report["export_vs_sam_max_vertex_error_m"] = float(np.abs(posed_sam_axes - sam_vertices).max())
    rest, posed = report["variants"]["identity_scale_rest"]["angles_deg"], report["variants"]["posed"]["angles_deg"]
    report["posed_minus_rest_deg"] = {key: posed[key] - rest[key] for key in posed}
    corrective_shift = np.linalg.norm(bodies["posed"].vertices - bodies["posed_without_correctives"].vertices, axis=1)
    report["pose_corrective_vertex_shift_m"] = {"max": float(corrective_shift.max()), "mean": float(corrective_shift.mean())}
    target.mkdir(parents=True)
    for name in ("mean_body_rest", "identity_scale_rest", "posed"):
        render_views(bodies[name].vertices, faces, target / f"{name}.png", name, bodies["posed" if name == "posed" else name].forward)
    (target / "metrics.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
