"""Validate a self-contained MHR GLB's geometry, hierarchy and skinning."""
from __future__ import annotations

import argparse
import json
import math
import struct
from pathlib import Path
from typing import Any

COMPONENTS = {5121: ("B", 1), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
WIDTHS = {"SCALAR": 1, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def parse_glb(path: Path) -> tuple[dict[str, Any], bytes]:
    raw = path.read_bytes()
    require(len(raw) >= 20, "GLB is truncated")
    magic, version, total = struct.unpack_from("<4sII", raw)
    require(magic == b"glTF" and version == 2 and total == len(raw), "Invalid GLB header")
    chunks: list[tuple[bytes, bytes]] = []
    offset = 12
    while offset < len(raw):
        require(offset + 8 <= len(raw), "Truncated chunk header")
        size, kind = struct.unpack_from("<I4s", raw, offset)
        offset += 8
        require(size % 4 == 0 and offset + size <= len(raw), "Invalid chunk length")
        chunks.append((kind, raw[offset:offset + size]))
        offset += size
    require(len(chunks) == 2 and chunks[0][0] == b"JSON" and chunks[1][0] == b"BIN\x00", "Expected one JSON and one BIN chunk")
    doc = json.loads(chunks[0][1].decode("utf-8"))
    require(doc.get("asset", {}).get("version") == "2.0", "Expected glTF 2.0")
    return doc, chunks[1][1]


def accessor(doc: dict[str, Any], blob: bytes, index: int) -> list[tuple[int | float, ...]]:
    item = doc["accessors"][index]
    require("sparse" not in item and "bufferView" in item, "Sparse or missing buffer view is unsupported")
    view = doc["bufferViews"][item["bufferView"]]
    require(view.get("buffer", 0) == 0, "External buffers are unsupported")
    component = item["componentType"]
    require(component in COMPONENTS and item["type"] in WIDTHS, "Unsupported accessor encoding")
    fmt, size = COMPONENTS[component]
    width = WIDTHS[item["type"]]
    count = item["count"]
    start = view.get("byteOffset", 0) + item.get("byteOffset", 0)
    stride = view.get("byteStride", size * width)
    end = start + (count - 1) * stride + size * width if count else start
    require(count >= 0 and stride >= size * width and start >= view.get("byteOffset", 0) and end <= view.get("byteOffset", 0) + view["byteLength"] and end <= len(blob), "Accessor exceeds its buffer view")
    result = [struct.unpack_from("<" + fmt * width, blob, start + i * stride) for i in range(count)]
    if item.get("normalized", False):
        require(component in (5121, 5123), "Unsupported normalized component type")
        maximum = 255 if component == 5121 else 65535
        return [tuple(value / maximum for value in row) for row in result]
    return result


def validate(path: Path) -> dict[str, Any]:
    doc, blob = parse_glb(path)
    nodes = doc.get("nodes", [])
    skins = doc.get("skins", [])
    require(bool(skins), "No skeleton/skin found")
    skinned_nodes = [node for node in nodes if "mesh" in node and "skin" in node]
    require(bool(skinned_nodes), "No mesh node references a skin")
    all_positions: list[tuple[int | float, ...]] = []
    triangles = 0
    max_weight_error = 0.0
    joint_counts: list[int] = []
    for node in skinned_nodes:
        skin = skins[node["skin"]]
        joints = skin.get("joints", [])
        require(bool(joints) and len(set(joints)) == len(joints) and all(isinstance(j, int) and 0 <= j < len(nodes) for j in joints), "Invalid skin joints")
        require("inverseBindMatrices" in skin, "Missing inverse bind matrices")
        matrices = accessor(doc, blob, skin["inverseBindMatrices"])
        require(len(matrices) == len(joints) and all(len(m) == 16 and all(math.isfinite(v) for v in m) for m in matrices), "Invalid inverse bind matrices")
        # Check joint links form an acyclic hierarchy, with at least one parent-child link.
        joint_set = set(joints)
        links = [(p, c) for p in joints for c in nodes[p].get("children", []) if c in joint_set]
        require(bool(links) and len({c for _, c in links}) == len(links), "Missing or invalid joint hierarchy")
        parents = {c: p for p, c in links}
        for joint in joints:
            seen: set[int] = set()
            while joint in parents:
                require(joint not in seen, "Cyclic joint hierarchy")
                seen.add(joint)
                joint = parents[joint]
        joint_counts.append(len(joints))
        for primitive in doc["meshes"][node["mesh"]]["primitives"]:
            require(primitive.get("mode", 4) == 4, "Only triangle primitives are supported")
            attrs = primitive["attributes"]
            require(all(k in attrs for k in ("POSITION", "JOINTS_0", "WEIGHTS_0")), "Missing vertex or skinning attributes")
            positions = accessor(doc, blob, attrs["POSITION"])
            indices = accessor(doc, blob, primitive["indices"]) if "indices" in primitive else [(i,) for i in range(len(positions))]
            influences = accessor(doc, blob, attrs["JOINTS_0"])
            weights = accessor(doc, blob, attrs["WEIGHTS_0"])
            require(bool(positions) and len(indices) >= 3 and len(indices) % 3 == 0, "No vertices or triangles")
            require(len(influences) == len(weights) == len(positions), "Skinning attribute count mismatch")
            require(all(len(p) == 3 and all(math.isfinite(v) for v in p) for p in positions), "Non-finite or invalid vertex coordinates")
            require(all(len(i) == 1 and isinstance(i[0], int) and 0 <= i[0] < len(positions) for i in indices), "Triangle index out of range")
            for js, ws in zip(influences, weights):
                require(len(js) == len(ws) == 4 and all(isinstance(j, int) and 0 <= j < len(joints) for j in js), "Invalid joint indices")
                require(all(math.isfinite(w) and 0 <= w <= 1 for w in ws), "Invalid skinning weight")
                error = abs(sum(ws) - 1.0)
                require(error <= 1e-4, "Skinning weights do not sum to one")
                max_weight_error = max(max_weight_error, error)
            all_positions.extend(positions)
            triangles += len(indices) // 3
    bounds = [[min(p[i] for p in all_positions), max(p[i] for p in all_positions)] for i in range(3)]
    return {"vertices": len(all_positions), "triangles": triangles, "joint_counts": joint_counts, "bounds_xyz": bounds, "max_weight_sum_error": max_weight_error, "units": "meters (official viewer convention)", "up_axis": "+Y (official viewer convention)"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("glb", type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(validate(args.glb), indent=2))
    except (OSError, ValueError, KeyError, IndexError, TypeError, struct.error) as exc:
        parser.exit(1, f"GLB validation failed: {exc}\n")


if __name__ == "__main__":
    main()
