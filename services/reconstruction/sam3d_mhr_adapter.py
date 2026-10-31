"""Evaluate and export validated SAM 3D Body parameters with official MHR code.

The reconstructed, posed MHR mesh is checked against SAM's returned vertices
before export. Verified on one real SAM result (max vertex error 5.96e-7 m).
"""
from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path
from typing import Any

import numpy as np
import torch

from validate_glb import validate as validate_glb
from reconstruct import sha256

PROJECT = Path(__file__).resolve().parents[2]
VIEWER = PROJECT / "external" / "MHR" / "web-viewer"
DEFAULT_MHR = PROJECT / "external" / "MHR" / "assets" / "mhr_model.pt"
MAX_VERTEX_ERROR_METERS = 1e-4


class AdapterError(Exception):
    """The input cannot be safely evaluated or exported."""


def read_vector(data: Any, key: str, size: int) -> np.ndarray:
    if key not in data:
        raise AdapterError(f"Missing required SAM output: {key}")
    value = np.asarray(data[key])
    if value.shape != (size,) or value.dtype.kind != "f" or not np.isfinite(value).all():
        raise AdapterError(f"{key} must be a finite floating-point vector of shape ({size},); got {value.shape} / {value.dtype}.")
    return value.astype(np.float32, copy=False)


def evaluate(data: Any, model: Any) -> tuple[np.ndarray, np.ndarray, np.ndarray, dict[str, Any]]:
    identity = read_vector(data, "shape_params", 45)
    model_parameters = read_vector(data, "mhr_model_params", 204)
    expression = read_vector(data, "expr_params", 72)
    camera_translation = read_vector(data, "pred_cam_t", 3)
    if "focal_length" not in data:
        raise AdapterError("Missing required camera field: focal_length")
    focal = np.asarray(data["focal_length"])
    if focal.size != 1 or focal.dtype.kind != "f" or not np.isfinite(focal).all() or float(focal.reshape(-1)[0]) <= 0:
        raise AdapterError("focal_length must be a positive finite floating-point scalar.")
    if "pred_vertices" not in data or "mesh_faces" not in data:
        raise AdapterError("SAM output must include pred_vertices and mesh_faces for cross-checking.")
    predicted = np.asarray(data["pred_vertices"])
    faces = np.asarray(data["mesh_faces"])
    if predicted.ndim != 2 or predicted.shape[1] != 3 or predicted.dtype.kind != "f" or not np.isfinite(predicted).all():
        raise AdapterError("pred_vertices must be a finite floating-point Nx3 array.")
    expected_faces = model.character_torch.mesh.faces.detach().cpu().numpy()
    if faces.shape != expected_faces.shape or faces.dtype.kind not in "iu" or not np.array_equal(faces, expected_faces):
        raise AdapterError("SAM output topology does not match the selected MHR asset.")
    try:
        with torch.inference_mode():
            vertices, skeleton = model(torch.from_numpy(identity[None]), torch.from_numpy(model_parameters[None]), torch.from_numpy(expression[None]))
    except Exception as exc:
        raise AdapterError(f"Official MHR evaluation failed: {exc}") from exc
    mhr_vertices = vertices[0].detach().cpu().numpy().astype(np.float32) / 100.0
    skeleton_state = skeleton[0].detach().cpu().numpy().astype(np.float32)
    skeleton_state[:, :3] /= 100.0
    if mhr_vertices.shape != predicted.shape or not np.isfinite(mhr_vertices).all() or not np.isfinite(skeleton_state).all():
        raise AdapterError("MHR evaluation returned invalid geometry or skeleton data.")
    # SAM's MHR head explicitly flips Y and Z after converting centimeters to meters.
    sam_axes_vertices = mhr_vertices * np.array([1.0, -1.0, -1.0], dtype=np.float32)
    error = float(np.max(np.abs(sam_axes_vertices - predicted)))
    if error > MAX_VERTEX_ERROR_METERS:
        raise AdapterError(f"MHR vertices differ from SAM output by {error:.6g} m (limit {MAX_VERTEX_ERROR_METERS} m); check model versions, parameter semantics and coordinate conventions.")
    return mhr_vertices, skeleton_state, expected_faces, {"max_vertex_error_m": error, "camera_translation": camera_translation.tolist(), "focal_length": float(focal.reshape(-1)[0]), "camera_applied_to_export": False}


def export(data: Any, model: Any) -> tuple[bytes, dict[str, Any]]:
    if not VIEWER.is_dir():
        raise AdapterError(f"Official MHR viewer checkout missing: {VIEWER}")
    sys.path.insert(0, str(VIEWER))
    try:
        from exporters import RigData, export_mesh
        from server import MHREngine
    except ImportError as exc:
        raise AdapterError(f"Official MHR exporter dependencies are unavailable: {exc}") from exc
    vertices, skeleton, faces, metadata = evaluate(data, model)
    source_indices, source_weights = model.get_lbsw()
    indices, weights = MHREngine._top_four_skinning(source_indices.detach().cpu().numpy(), source_weights.detach().cpu().numpy())
    rig = RigData(joint_names=tuple(model.get_joint_names()), joint_parents=np.asarray(model.character_torch.skeleton.joint_parents, dtype=np.int32), skeleton_state=skeleton, joint_indices=indices, joint_weights=weights)
    try:
        result = export_mesh(vertices, faces, "glb", rig)
    except Exception as exc:
        raise AdapterError(f"Official MHR GLB exporter failed: {exc}") from exc
    metadata.update({"units": "meters", "up_axis": "+Y (MHR convention)", "pose": "SAM predicted pose; no neutralization", "skinning": "official viewer top four normalized influences", "exporter": "official MHR web-viewer"})
    return result.data, metadata


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Existing reconstruction.npz from the SAM CLI")
    parser.add_argument("--output", type=Path, required=True, help="New GLB under outputs/")
    parser.add_argument("--mhr-model", type=Path, default=DEFAULT_MHR)
    args = parser.parse_args()
    target = args.output.resolve()
    root = (PROJECT / "outputs").resolve()
    if root not in target.parents or target.suffix.lower() != ".glb" or target.exists():
        parser.error("output must be a new .glb file inside outputs/")
    try:
        if not args.mhr_model.is_file():
            raise AdapterError(f"MHR model not found: {args.mhr_model}")
        model = torch.jit.load(str(args.mhr_model), map_location="cpu").eval()
        with np.load(args.input, allow_pickle=False) as data:
            payload, metadata = export(data, model)
        # Validate before publishing; retain no temporary personal artifact on failure.
        with tempfile.TemporaryDirectory() as folder:
            temporary = Path(folder) / "avatar.glb"
            temporary.write_bytes(payload)
            metadata["glb_validation"] = validate_glb(temporary)
        metadata["mhr_model_sha256"] = sha256(args.mhr_model)
        target.parent.mkdir(parents=True, exist_ok=True)
        metadata_path = target.with_suffix(".json")
        if metadata_path.exists():
            raise AdapterError(f"Metadata already exists: {metadata_path}")
        target.write_bytes(payload)
        try:
            metadata_path.write_text(json.dumps(metadata, indent=2, allow_nan=False), encoding="utf-8")
        except OSError:
            target.unlink(missing_ok=True)
            raise
    except (AdapterError, OSError, ValueError, KeyError, RuntimeError) as exc:
        print(f"MHR adapter error: {exc}", file=sys.stderr)
        return 1
    print(f"Exported validated posed MHR GLB: {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
