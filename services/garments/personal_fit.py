"""Personal-fit clean-up (Sprint 2.3A): collapse degenerate rest triangles before skinning.

Retargeting the neutral garment to a personal body and pushing it clear can squash a few triangles (for example a
0.3 mm boundary edge on the back armpit rim of the identity-only body). Their edges then dominate max-stretch metrics
without being a fabric problem. The fit step therefore collapses, on the outer garment surface:

- every edge shorter than `min_edge_m` (1 mm), and
- an edge (shortest first, at most `max_tiny_edge_m` = 3 mm) of every triangle with area under `min_area_m2` (1 mm^2).

A collapse is skipped when it would make the surface non-manifold (link condition) or pinch a boundary. When one end
lies on an opening, the merged vertex keeps that boundary position; otherwise it moves to the edge midpoint. The
merged vertex's skin weights are the average of its two vertices' weights, truncated to 4 influences. UVs of the
surviving faces are kept per corner. Repeated until no candidate remains.
"""
from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import Any

import numpy as np


def _boundary_vertices(faces: np.ndarray) -> set[int]:
    edges = np.sort(np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]), axis=1)
    unique, counts = np.unique(edges, axis=0, return_counts=True)
    return set(unique[counts == 1].ravel().tolist())


def _flip_caps(vertices: np.ndarray, faces: np.ndarray, corner_uv: np.ndarray, min_area_m2: float) -> tuple[np.ndarray, int]:
    """Flip an edge (longest first) of each remaining tiny 'cap' triangle (no short edge to collapse) when the flip is
    valid: interior edge, the new diagonal not already an edge, both new triangles larger and consistently oriented."""
    faces = faces.copy()
    flips = 0

    def area(tri: np.ndarray) -> float:
        a, b, c = vertices[tri]
        return 0.5 * float(np.linalg.norm(np.cross(b - a, c - a)))

    for _ in range(3):
        tiny = [f for f in range(len(faces)) if area(faces[f]) < min_area_m2]
        if not tiny:
            break
        edges = {}
        for f, face in enumerate(faces.tolist()):
            for i in range(3):
                edges.setdefault((min(face[i], face[(i + 1) % 3]), max(face[i], face[(i + 1) % 3])), []).append(f)
        changed = False
        for f in tiny:
            face = faces[f].tolist()
            for k in sorted(range(3), key=lambda i: -np.linalg.norm(vertices[face[i]] - vertices[face[(i + 1) % 3]])):  # longest first
                u, v, w = face[k], face[(k + 1) % 3], face[(k + 2) % 3]  # edge u->v, apex w
                owners = edges.get((min(u, v), max(u, v)), [])
                if len(owners) != 2:  # an opening's edge cannot be flipped
                    continue
                g = owners[0] if owners[1] == f else owners[1]
                x = next(i for i in faces[g].tolist() if i not in (u, v))
                if (min(w, x), max(w, x)) in edges:
                    continue
                new_f, new_g = np.array([w, u, x]), np.array([w, x, v])  # keeps the orientation of u->v->w
                normal = np.cross(vertices[v] - vertices[u], vertices[w] - vertices[u]) + np.cross(vertices[u] - vertices[v], vertices[x] - vertices[v])
                ok = all(np.dot(np.cross(vertices[t[1]] - vertices[t[0]], vertices[t[2]] - vertices[t[0]]), normal) > 0 for t in (new_f, new_g))
                if not ok or min(area(new_f), area(new_g)) <= area(faces[f]):
                    continue
                faces[f], faces[g] = new_f, new_g
                corner_uv[f] = corner_uv[f].mean(axis=0)  # the flipped pair gets the mean UV of each face (2 small triangles)
                corner_uv[g] = corner_uv[g].mean(axis=0)
                flips += 1
                changed = True
                break
            if changed:
                break  # edge map is stale after a flip
        if not changed:
            break
    return faces, flips


def collapse_degenerate(garment: Any, joint_count: int, min_edge_m: float = 0.001, min_area_m2: float = 1e-6, passes: int = 20, max_tiny_edge_m: float = 0.003) -> tuple[Any, dict[str, Any]]:
    vertices = np.array(garment.vertices, dtype=np.float64)
    faces = np.array(garment.faces)
    corner_uv = np.array(garment.corner_uv)
    dense = np.zeros((len(vertices), joint_count))
    np.put_along_axis(dense, np.asarray(garment.joints), np.asarray(garment.weights, dtype=np.float64), axis=1)
    loops = {kind: list(loop) for kind, loop in garment.boundaries.items()}
    affected = np.zeros(len(vertices), dtype=bool)  # merged vertices: the only ones re-weighted
    initial_faces = len(faces)
    collapses, skipped = 0, 0
    for _ in range(passes):
        a, b, c = vertices[faces[:, 0]], vertices[faces[:, 1]], vertices[faces[:, 2]]
        area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
        candidates: dict[tuple[int, int], float] = {}
        for k, (p, q) in enumerate(((0, 1), (1, 2), (2, 0))):
            length = np.linalg.norm(vertices[faces[:, p]] - vertices[faces[:, q]], axis=1)
            for f in np.flatnonzero(length < min_edge_m):
                key = tuple(sorted((int(faces[f, p]), int(faces[f, q]))))
                candidates[key] = float(length[f])
        for f in np.flatnonzero(area < min_area_m2):  # every edge up to max_tiny_edge_m: if the shortest fails the link
            for p, q in ((0, 1), (1, 2), (2, 0)):    # condition, a longer one may still collapse (shortest tried first)
                u, v = int(faces[f, p]), int(faces[f, q])
                length = float(np.linalg.norm(vertices[u] - vertices[v]))
                if length <= max_tiny_edge_m:
                    candidates[tuple(sorted((u, v)))] = length
        if not candidates:
            break
        boundary = _boundary_vertices(faces)
        neighbours: dict[int, set[int]] = {}
        edge_faces: dict[tuple[int, int], int] = {}
        for face in faces.tolist():
            for i in range(3):
                u, v = face[i], face[(i + 1) % 3]
                neighbours.setdefault(u, set()).add(v)
                neighbours.setdefault(v, set()).add(u)
                key = (min(u, v), max(u, v))
                edge_faces[key] = edge_faces.get(key, 0) + 1
        touched: set[int] = set()
        target = np.arange(len(vertices))
        for (u, v), _length in sorted(candidates.items(), key=lambda item: item[1]):
            if u in touched or v in touched or (u, v) not in edge_faces:
                continue
            shared = len(neighbours[u] & neighbours[v])
            on_boundary_edge = edge_faces[(u, v)] == 1
            if shared != edge_faces[(u, v)] or (u in boundary and v in boundary and not on_boundary_edge):
                skipped += 1
                continue
            keep, drop = (v, u) if (v in boundary and u not in boundary) else (u, v)
            if not (keep in boundary) ^ (drop in boundary):  # both interior, or a boundary edge: midpoint
                vertices[keep] = 0.5 * (vertices[keep] + vertices[drop])
            dense[keep] = 0.5 * (dense[keep] + dense[drop])  # re-weight the merged vertex
            affected[keep] = True
            target[drop] = keep
            touched.update({keep, drop} | neighbours[keep] | neighbours[drop])
            collapses += 1
        if not (target != np.arange(len(vertices))).any():
            break
        faces = target[faces]
        alive = (faces[:, 0] != faces[:, 1]) & (faces[:, 1] != faces[:, 2]) & (faces[:, 2] != faces[:, 0])
        faces, corner_uv = faces[alive], corner_uv[alive]
        for kind, loop in loops.items():
            mapped = [int(target[i]) for i in loop]
            loops[kind] = [x for k, x in enumerate(mapped) if x != mapped[k - 1]]  # drop repeats (wraps around)
    faces, flips = _flip_caps(vertices, faces, corner_uv, min_area_m2)
    used = np.zeros(len(vertices), dtype=bool)
    used[faces.ravel()] = True
    remap = np.cumsum(used) - 1
    joints, weights = np.array(garment.joints)[used], np.array(garment.weights, dtype=np.float64)[used]
    merged = affected[used]
    order = np.argsort(dense[used][merged], axis=1)[:, -4:][:, ::-1]
    top = np.take_along_axis(dense[used][merged], order, axis=1)
    joints[merged], weights[merged] = order, top / top.sum(axis=1, keepdims=True)
    cleaned = replace(garment, vertices=vertices[used], faces=remap[faces], corner_uv=corner_uv, joints=joints.astype(np.int64), weights=weights,
                      region=np.asarray(garment.region)[used], boundaries={kind: remap[np.asarray(loop)].tolist() for kind, loop in loops.items()}, report=dict(garment.report))
    report = {"collapses": collapses, "cap_edge_flips": flips, "vertices_reweighted": int(merged.sum()), "skipped_non_manifold": skipped, "outer_triangles_removed": int(initial_faces - len(faces)), "outer_vertices_removed": int(len(vertices) - used.sum()), "min_edge_m": min_edge_m, "min_area_m2": min_area_m2,
              "remaining_edges_under_min": int(sum(np.linalg.norm(vertices[faces[:, p]] - vertices[faces[:, q]], axis=1).__lt__(min_edge_m).sum() for p, q in ((0, 1), (1, 2), (2, 0))) // 2),
              "remaining_triangles_under_min_area": int((0.5 * np.linalg.norm(np.cross(vertices[faces[:, 1]] - vertices[faces[:, 0]], vertices[faces[:, 2]] - vertices[faces[:, 0]]), axis=1) < min_area_m2).sum())}
    return cleaned, report


# --- Sprint 2.3A: per-body shoulder correctives, solved against the body's own gates -------------------------------

# Candidate shoulder settings in the order tried: the neutral v5 settings first, then weaker 90 deg anchors (spread the
# armpit fold further) and more iterations. Only CorrectiveRules fields change; the 120 deg anchor stays 1.0.
SHOULDER_CANDIDATES = (
    {},
    {"anchor_weights": ((90.0, 0.2), (120.0, 1.0))},
    {"anchor_weights": ((90.0, 0.1), (120.0, 1.0))},
    {"anchor_weights": ((90.0, 0.2), (120.0, 1.0)), "iterations": 50},
    {"anchor_weights": ((90.0, 0.1), (120.0, 1.0)), "iterations": 50},
    {"anchor_weights": ((90.0, 0.05), (120.0, 1.0)), "iterations": 50},
)


def body_gates(original_glb: Path, avatar: Any) -> dict[str, Any]:
    """The body's own gates, derived from its original (v1) shirt exactly as the neutral gates were from the neutral
    original: both +90 max stretch <= half the original's; both +120 flips and self-intersections above rest <= the
    original's."""
    from posing import load_asset

    metrics = shoulder_metrics(load_asset(original_glb), avatar)
    return {"source": str(original_glb), "original": metrics, "both_90_stretch_max": metrics["both_90_stretch_max"] / 2.0,
            "both_120_flipped": metrics["both_120_flipped"], "both_120_self_above_rest": metrics["both_120_self_above_rest"]}


def shoulder_metrics(asset: Any, avatar: Any) -> dict[str, Any]:
    """Both-arms +90 / +120 metrics through the contract (morph weights from the asset's sidecar)."""
    from deform_metrics import body_penetration, self_intersections, triangle_deformation, weld_ids
    from posing import posed_positions, raise_arm

    welded = weld_ids(asset.positions)
    rest_pairs, _ = self_intersections(asset.positions, asset.indices, welded)
    out: dict[str, Any] = {}
    for degrees in (90, 120):
        rotations = [raise_arm("l", degrees), raise_arm("r", degrees)]
        posed, matrices, _ = posed_positions(asset, rotations)
        body_posed, _, _ = posed_positions(avatar, rotations)
        deformation = triangle_deformation(asset.positions, posed, asset.indices, asset.joints, asset.weights, matrices)
        pairs, _ = self_intersections(posed, asset.indices, welded)
        out[f"both_{degrees}_stretch_max"] = round(float(deformation["stretch"].max()), 4)
        out[f"both_{degrees}_flipped"] = int(deformation["flipped"].sum())
        out[f"both_{degrees}_self_above_rest"] = max(0, pairs - rest_pairs)
        out[f"both_{degrees}_penetrating_beyond_3mm"] = int((body_penetration(body_posed, avatar.indices, posed) < -0.003).sum())
    return out


def _passes(metrics: dict[str, Any], gates: dict[str, Any]) -> dict[str, bool]:
    return {
        "both_90_stretch_max": metrics["both_90_stretch_max"] <= gates["both_90_stretch_max"],
        "both_120_flipped": metrics["both_120_flipped"] <= gates["both_120_flipped"],
        "both_120_self_above_rest": metrics["both_120_self_above_rest"] <= gates["both_120_self_above_rest"],
        "penetrating_beyond_3mm": metrics["both_90_penetrating_beyond_3mm"] == 0 and metrics["both_120_penetrating_beyond_3mm"] == 0,
    }


def fit_shoulders(arrays: dict[str, Any], outer: Any, avatar: Any, gates: dict[str, Any]) -> tuple[dict[str, np.ndarray], dict[str, Any]]:
    """Solve the four shoulder targets with each candidate in turn; keep the first that passes the body's gates (else
    the one with the fewest failed gates, then the lowest +90 max stretch)."""
    import correctives
    from posing import SkinnedAsset

    sidecar = {"version": 2, "correctives": correctives.shoulder_signed_entries(avatar.skeleton)}
    tried, best = [], None
    for index, overrides in enumerate(SHOULDER_CANDIDATES):
        rules = replace(correctives.CorrectiveRules(), **overrides)
        morphs, solve_report = correctives.solve_targets(arrays, outer.vertices, outer.faces, avatar.skeleton, avatar, rules)
        asset = SkinnedAsset(avatar.skeleton, np.asarray(arrays["position"], dtype=np.float32).astype(np.float64), np.asarray(arrays["faces"]).reshape(-1, 3),
                             np.asarray(arrays["joints"], dtype=np.int64), np.asarray(arrays["weights"], dtype=np.float32).astype(np.float64), None,
                             {k: v.astype(np.float32).astype(np.float64) for k, v in morphs.items()}, sidecar)
        metrics = shoulder_metrics(asset, avatar)
        verdict = _passes(metrics, gates)
        tried.append({"candidate": index, "overrides": {k: v for k, v in overrides.items()}, "metrics": metrics, "passes": verdict})
        key = (sum(not ok for ok in verdict.values()), metrics["both_90_stretch_max"])
        if best is None or key < best[0]:
            best = (key, index, morphs, solve_report)
        if all(verdict.values()):
            break
    _, chosen, morphs, solve_report = best
    return morphs, {"gates": gates, "chosen_candidate": chosen, "tried": tried, "solve": solve_report}
