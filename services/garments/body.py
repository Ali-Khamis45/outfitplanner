"""Rest-pose MHR bodies evaluated from parameters with the official model (never by resetting a posed GLB)."""
from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import numpy as np
import torch

PROJECT = Path(__file__).resolve().parents[2]
VIEWER = PROJECT / "external" / "MHR" / "web-viewer"
DEFAULT_MHR = PROJECT / "external" / "MHR" / "assets" / "mhr_model.pt"
BodyVariant = Literal["neutral", "personal-identity", "personal-identity-scale"]
VARIANTS: tuple[BodyVariant, ...] = ("neutral", "personal-identity", "personal-identity-scale")

# Joint-group labels used for fitting, weight transfer and diagnostics.
TORSO, LEFT_ARM, RIGHT_ARM, FOREARM_HAND, HEAD, LEG = range(6)


@dataclass(frozen=True)
class RestBody:
    """MHR body in the official rest pose, in meters with +Y up (MHR convention)."""

    variant: BodyVariant
    vertices: np.ndarray  # (N, 3) float64
    faces: np.ndarray  # (F, 3) int64
    joint_names: tuple[str, ...]
    joint_parents: np.ndarray  # (J,) int32
    skeleton_state: np.ndarray  # (J, 8): translation (m), quaternion xyzw, uniform scale
    skin_joints: np.ndarray  # (N, 4) official top-four influences
    skin_weights: np.ndarray  # (N, 4)
    labels: np.ndarray  # (N,) joint-group label of each vertex's dominant influence
    identity: np.ndarray  # (45,) identity coefficients used
    model_parameters: np.ndarray  # (204,) rest model parameters used
    floor_offset_m: float = 0.0  # rigid +Y translation applied to vertices and every joint (0 = none)

    def joint(self, name: str) -> np.ndarray:
        return self.skeleton_state[self.joint_names.index(name), :3]


def load_model(path: Path = DEFAULT_MHR) -> Any:
    if not path.is_file():
        raise FileNotFoundError(f"Official MHR model not found: {path}")
    return torch.jit.load(str(path), map_location="cpu").eval()


def joint_groups(names: tuple[str, ...], parents: np.ndarray) -> np.ndarray:
    """Label each joint by its nearest named ancestor: arms, forearm/hand, head, legs, else torso."""
    anchors = {"l_uparm": LEFT_ARM, "r_uparm": RIGHT_ARM, "l_lowarm": FOREARM_HAND, "r_lowarm": FOREARM_HAND, "c_head": HEAD, "l_upleg": LEG, "r_upleg": LEG}
    groups = np.full(len(names), TORSO, dtype=np.int32)
    for index in range(len(names)):
        cursor = index
        while cursor >= 0:
            if names[cursor] in anchors:
                groups[index] = anchors[names[cursor]]
                break
            cursor = int(parents[cursor])
    return groups


def rest_parameters(model: Any, variant: BodyVariant, reconstruction: Path | None) -> tuple[np.ndarray, np.ndarray]:
    """Identity and model parameters for a rest-pose variant; SAM parameters are read, never modified."""
    identity, parameters = np.zeros(45, np.float32), np.zeros(204, np.float32)
    if variant == "neutral":
        return identity, parameters
    if reconstruction is None:
        raise ValueError(f"Variant {variant!r} requires a SAM reconstruction.npz")
    with np.load(reconstruction, allow_pickle=False) as data:
        identity = np.array(data["shape_params"], dtype=np.float32)
        estimated = np.array(data["mhr_model_params"], dtype=np.float32)
    if identity.shape != (45,) or estimated.shape != (204,) or not (np.isfinite(identity).all() and np.isfinite(estimated).all()):
        raise ValueError("Reconstruction must contain finite shape_params (45) and mhr_model_params (204).")
    if variant == "personal-identity-scale":
        scale_mask = model.character_torch.parameter_transform.scaling_parameters[:204].numpy()
        parameters = np.where(scale_mask, estimated, 0).astype(np.float32)  # keep proportions, zero every pose parameter
    return identity, parameters


FLOOR_TOLERANCE_M = 0.002


def evaluate_rest_body(model: Any, variant: BodyVariant, reconstruction: Path | None = None, floor_align: bool = False) -> RestBody:
    """Official rest-pose evaluation. With floor_align, a body whose lowest vertex is more than 2 mm off y = 0 is
    translated rigidly (vertices and all joint positions together), so shape, proportions and the bone hierarchy
    are unchanged and the inverse bind matrices are recomputed consistently from the moved skeleton."""
    identity, parameters = rest_parameters(model, variant, reconstruction)
    with torch.inference_mode():
        vertices, skeleton = model(torch.from_numpy(identity[None]), torch.from_numpy(parameters[None]), torch.zeros(1, 72))
    skeleton_state = skeleton[0].numpy().astype(np.float64)
    skeleton_state[:, :3] /= 100.0
    names = tuple(str(name) for name in model.get_joint_names())
    parents = model.character_torch.skeleton.joint_parents.numpy().astype(np.int32)
    sys.path.insert(0, str(VIEWER))
    from server import MHREngine  # official viewer helper; imported lazily because it pulls in the viewer stack

    source_joints, source_weights = model.get_lbsw()
    skin_joints, skin_weights = MHREngine._top_four_skinning(source_joints.numpy(), source_weights.numpy())
    groups = joint_groups(names, parents)
    positions = vertices[0].numpy().astype(np.float64) / 100.0
    offset = 0.0
    if floor_align and abs(float(positions[:, 1].min())) > FLOOR_TOLERANCE_M:
        offset = -float(positions[:, 1].min())
        positions[:, 1] += offset
        skeleton_state[:, 1] += offset
    return RestBody(
        variant=variant,
        vertices=positions,
        faces=model.character_torch.mesh.faces.numpy().astype(np.int64),
        joint_names=names,
        joint_parents=parents,
        skeleton_state=skeleton_state,
        skin_joints=np.asarray(skin_joints, dtype=np.int64),
        skin_weights=np.asarray(skin_weights, dtype=np.float64),
        labels=groups[np.asarray(skin_joints)[:, 0]],
        identity=identity,
        model_parameters=parameters,
        floor_offset_m=offset,
    )
