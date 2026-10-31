"""Write and read skinned garment GLBs that carry the same skeleton as the official MHR avatar export.

The skeleton, local joint transforms and inverse bind matrices come from the official MHR exporter's
own rig validation (`exporters._validated_rig`, imported unmodified), so a garment and an avatar
exported from the same skeleton state have identical bind data and can be bound by joint name.
"""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path
from typing import Any

import numpy as np

from body import VIEWER, RestBody

FLOAT, UNSIGNED_SHORT, UNSIGNED_INT = 5126, 5123, 5125
ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER = 34962, 34963
COMPONENT_DTYPES = {5121: "<u1", 5123: "<u2", 5125: "<u4", 5126: "<f4"}
TYPE_WIDTHS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def _official_exporter() -> Any:
    sys.path.insert(0, str(VIEWER))
    import exporters

    return exporters


def write_garment_glb(path: Path, arrays: dict[str, np.ndarray], body: RestBody, metadata: dict[str, Any], material: dict[str, Any]) -> None:
    exporters = _official_exporter()
    rig = exporters._validated_rig(
        exporters.RigData(joint_names=body.joint_names, joint_parents=body.joint_parents, skeleton_state=body.skeleton_state, joint_indices=arrays["joints"], joint_weights=arrays["weights"]),
        len(arrays["position"]),
    )
    builder = exporters._GlbBuilder()
    attributes = {
        "POSITION": builder.add_accessor(arrays["position"].astype("<f4"), component_type=FLOAT, accessor_type="VEC3", target=ARRAY_BUFFER, include_bounds=True),
        "NORMAL": builder.add_accessor(arrays["normal"].astype("<f4"), component_type=FLOAT, accessor_type="VEC3", target=ARRAY_BUFFER),
        "TEXCOORD_0": builder.add_accessor(arrays["uv"].astype("<f4"), component_type=FLOAT, accessor_type="VEC2", target=ARRAY_BUFFER),
        "JOINTS_0": builder.add_accessor(rig.joint_indices.astype("<u2"), component_type=UNSIGNED_SHORT, accessor_type="VEC4", target=ARRAY_BUFFER),
        "WEIGHTS_0": builder.add_accessor(rig.joint_weights.astype("<f4"), component_type=FLOAT, accessor_type="VEC4", target=ARRAY_BUFFER),
        "_REGION": builder.add_accessor(arrays["region"].astype("<f4"), component_type=FLOAT, accessor_type="SCALAR", target=ARRAY_BUFFER),
    }
    indices = builder.add_accessor(arrays["faces"].reshape(-1).astype("<u4"), component_type=UNSIGNED_INT, accessor_type="SCALAR", target=ELEMENT_ARRAY_BUFFER)
    inverse_binds = builder.add_accessor(rig.inverse_bind_matrices.astype("<f4"), component_type=FLOAT, accessor_type="MAT4", matrix_column_major=True)
    nodes: list[dict[str, Any]] = []
    for index, (name, matrix) in enumerate(zip(rig.joint_names, rig.local_transforms, strict=True)):
        node: dict[str, Any] = {"name": name, "matrix": matrix.reshape(-1, order="F").astype(float).tolist()}
        children = np.flatnonzero(rig.joint_parents == index).tolist()
        if children:
            node["children"] = [int(child) for child in children]
        nodes.append(node)
    mesh_node = len(nodes)
    nodes.append({"name": metadata["garmentId"], "mesh": 0, "skin": 0})
    roots = [int(index) for index in np.flatnonzero(rig.joint_parents < 0)] + [mesh_node]
    document = {
        "asset": {"version": "2.0", "generator": "Virtual Wardrobe garment generator (Sprint 1.0)", "extras": {"garment": metadata}},
        "scene": 0,
        "scenes": [{"name": "Garment", "nodes": roots}],
        "nodes": nodes,
        "materials": [{"name": material["name"], "pbrMetallicRoughness": {"baseColorFactor": material["baseColor"], "metallicFactor": material["metalness"], "roughnessFactor": material["roughness"]}, "doubleSided": False}],
        "meshes": [{"name": metadata["garmentId"], "primitives": [{"attributes": attributes, "indices": indices, "material": 0, "mode": 4}], "extras": {"regions": metadata["regions"], "openingVertices": arrays.get("openings", {})}}],
        "skins": [{"name": "MHR_Armature", "inverseBindMatrices": inverse_binds, "joints": list(range(len(rig.joint_names))), "skeleton": roots[0]}],
    }
    path.write_bytes(builder.build(document))


def read_glb(path: Path) -> tuple[dict[str, Any], bytes]:
    raw = path.read_bytes()
    magic, version, total = struct.unpack_from("<4sII", raw)
    if magic != b"glTF" or version != 2 or total != len(raw):
        raise ValueError(f"Invalid GLB header: {path}")
    json_length, json_type = struct.unpack_from("<I4s", raw, 12)
    if json_type != b"JSON":
        raise ValueError("First GLB chunk must be JSON")
    document = json.loads(raw[20:20 + json_length])
    bin_offset = 20 + json_length
    bin_length, bin_type = struct.unpack_from("<I4s", raw, bin_offset)
    if bin_type != b"BIN\x00":
        raise ValueError("Second GLB chunk must be BIN")
    return document, raw[bin_offset + 8:bin_offset + 8 + bin_length]


def accessor_array(document: dict[str, Any], blob: bytes, index: int) -> np.ndarray:
    item = document["accessors"][index]
    view = document["bufferViews"][item["bufferView"]]
    width = TYPE_WIDTHS[item["type"]]
    dtype = np.dtype(COMPONENT_DTYPES[item["componentType"]])
    if view.get("byteStride", dtype.itemsize * width) != dtype.itemsize * width:
        raise ValueError("Interleaved accessors are not supported by this reader")
    start = view.get("byteOffset", 0) + item.get("byteOffset", 0)
    values = np.frombuffer(blob, dtype=dtype, count=item["count"] * width, offset=start)
    if item["type"] == "MAT4":
        return values.reshape(-1, 4, 4).transpose(0, 2, 1)  # column-major on disk
    return values.reshape(item["count"], width) if width > 1 else values.copy()


def skinned_primitive(document: dict[str, Any], blob: bytes) -> dict[str, np.ndarray]:
    primitive = document["meshes"][0]["primitives"][0]
    arrays = {name: accessor_array(document, blob, index) for name, index in primitive["attributes"].items()}
    arrays["indices"] = accessor_array(document, blob, primitive["indices"]).reshape(-1, 3)
    skin = document["skins"][0]
    arrays["inverse_bind"] = accessor_array(document, blob, skin["inverseBindMatrices"])
    arrays["joint_names"] = np.array([document["nodes"][j]["name"] for j in skin["joints"]])
    return arrays
