"""Pattern panels and seams for tshirt-v5.3 and pants-v3 (Sprint 3.5).

A garment is cut into the pieces of a real pattern by seams that run along mesh edges, as shortest paths between pattern
landmarks found on the garment itself:

T-shirt: front and back torso, left and right sleeve.
  - armholes: where the torso meets each sleeve;
  - side seams: armpit (lowest armhole point) down to the hem's raw edge, at the side;
  - shoulder seams: neckline (its point nearest the shoulder) to the shoulder point (highest armhole point);
  - underarm seams: armpit to the cuff, along the sleeve's underside (a sleeve is a tube: one cut makes it a piece).
Pants: left front, left back, right front, right back, crotch gusset.
  - gusset border; centre front and centre back (waistband at the middle to the gusset's front and back tips);
  - outseams: waistband side to the hem, on the leg's outer side;
  - inseams: the gusset's side tip to the hem, on the leg's inner side.

The garment's shape is not changed: seams only decide where vertices are split (`corner_keys`, consumed by
tshirt.assemble as per-corner UV keys) and which UV island each face belongs to.
"""
from __future__ import annotations

from typing import Any

import numpy as np
from scipy import sparse
from scipy.sparse.csgraph import connected_components, dijkstra

SHIRT_PANELS = ("front", "back", "sleeve_left", "sleeve_right")
PANTS_PANELS = ("left_front", "left_back", "right_front", "right_back", "gusset")


def face_regions(faces: np.ndarray, region: np.ndarray) -> np.ndarray:
    """Majority region of each face's corners."""
    return np.array([np.bincount(row, minlength=8).argmax() for row in np.asarray(region).astype(int)[faces]])


def _edges(faces: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Unique undirected edges (sorted pairs) and, per face, the index of each of its 3 edges (k -> edge k, k+1)."""
    raw = np.sort(np.stack([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]], axis=1).reshape(-1, 2), axis=1)
    unique, inverse = np.unique(raw, axis=0, return_inverse=True)
    return unique, inverse.reshape(-1, 3)


def boundary_loops(faces: np.ndarray, n_vertices: int) -> list[np.ndarray]:
    """Vertex sets of the boundary components (edges used by exactly one face)."""
    edges, face_edges = _edges(faces)
    count = np.bincount(face_edges.ravel(), minlength=len(edges))
    boundary = edges[count == 1]
    if not len(boundary):
        return []
    graph = sparse.coo_matrix((np.ones(len(boundary)), (boundary[:, 0], boundary[:, 1])), shape=(n_vertices, n_vertices))
    _, label = connected_components(graph, directed=False)
    used = np.unique(boundary)
    return [used[label[used] == k] for k in np.unique(label[used])]


SEAM_LINE_WEIGHT = 20.0  # how strongly a seam path is held to its intended line (side, inner side, middle)


def _graph(vertices: np.ndarray, faces: np.ndarray, penalty: np.ndarray | None = None) -> sparse.csr_matrix:
    edges, _ = _edges(faces)
    length = np.linalg.norm(vertices[edges[:, 0]] - vertices[edges[:, 1]], axis=1)
    if penalty is not None:  # edges off the seam's line cost more: the path follows the line, not just the shortest route
        length = length * (1.0 + SEAM_LINE_WEIGHT * 0.5 * (penalty[edges[:, 0]] + penalty[edges[:, 1]]))
    n = len(vertices)
    return sparse.coo_matrix((np.r_[length, length], (np.r_[edges[:, 0], edges[:, 1]], np.r_[edges[:, 1], edges[:, 0]])), shape=(n, n)).tocsr()


def line_penalty(vertices: np.ndarray, centre_of: Any, target: float) -> np.ndarray:
    """Squared angular distance (in quarter turns) of each vertex from the meridian at angle `target` around a vertical
    axis whose (x, z) centre at height y is centre_of(y) (angle 0 = front +z, +pi/2 = +x side)."""
    cx, cz = centre_of(vertices[:, 1])
    angle = np.arctan2(vertices[:, 0] - cx, vertices[:, 2] - cz)
    delta = np.angle(np.exp(1j * (angle - target)))
    return (delta / (np.pi / 2)) ** 2


def axis_centre(vertices: np.ndarray, mask: np.ndarray, bin_m: float = 0.01) -> Any:
    """Per-height (x, z) centre of the masked vertices, smoothed over 7 bins; a function of y."""
    y = vertices[mask, 1]
    edges = np.arange(y.min(), y.max() + bin_m, bin_m)
    index = np.clip(((vertices[mask, 1] - y.min()) / bin_m).astype(int), 0, len(edges) - 1)
    centres = np.full((len(edges), 2), np.nan)
    for k in np.unique(index):
        centres[k] = vertices[mask][index == k][:, [0, 2]].mean(axis=0)
    good = ~np.isnan(centres[:, 0])
    for c in range(2):
        centres[:, c] = np.interp(np.arange(len(edges)), np.flatnonzero(good), centres[good, c])
        centres[:, c] = np.convolve(np.pad(centres[:, c], 3, mode="edge"), np.ones(7) / 7, mode="valid")
    mid = edges + bin_m / 2
    return lambda q: (np.interp(q, mid, centres[:, 0]), np.interp(q, mid, centres[:, 1]))


def shortest_path(vertices: np.ndarray, faces: np.ndarray, start: int, targets: np.ndarray, penalty: np.ndarray | None = None) -> list[int]:
    """Vertex path along the edges of `faces` from `start` to the nearest of `targets` (Dijkstra), optionally held to a
    seam line by a per-vertex penalty."""
    distance, predecessor = dijkstra(_graph(vertices, faces, penalty), indices=start, return_predecessors=True)
    end = int(targets[np.argmin(distance[targets])])
    if not np.isfinite(distance[end]):
        raise ValueError(f"no path from vertex {start} to the seam's end")
    path = [end]
    while path[-1] != start:
        path.append(int(predecessor[path[-1]]))
    return path[::-1]


def _path_edges(path: list[int]) -> set[tuple[int, int]]:
    return {(min(a, b), max(a, b)) for a, b in zip(path[:-1], path[1:])}


def _region_border(faces: np.ndarray, fr: np.ndarray, inside: np.ndarray) -> set[tuple[int, int]]:
    """Edges between a face with inside[fr] and a face without."""
    edges, face_edges = _edges(faces)
    flag = inside[fr]
    owners: dict[int, set[bool]] = {}
    for f, row in enumerate(face_edges):
        for e in row:
            owners.setdefault(int(e), set()).add(bool(flag[f]))
    return {tuple(int(v) for v in edges[e]) for e, kinds in owners.items() if len(kinds) == 2}


def panels_from_seams(faces: np.ndarray, seams: set[tuple[int, int]]) -> np.ndarray:
    """Connected components of faces when adjacency across seam edges is removed."""
    edges, face_edges = _edges(faces)
    is_seam = np.array([(int(a), int(b)) in seams for a, b in edges])
    owner: dict[int, list[int]] = {}
    for f, row in enumerate(face_edges):
        for e in row:
            if not is_seam[e]:
                owner.setdefault(int(e), []).append(f)
    pairs = np.array([fs[:2] for fs in owner.values() if len(fs) == 2])
    n = len(faces)
    graph = sparse.coo_matrix((np.ones(len(pairs)), (pairs[:, 0], pairs[:, 1])), shape=(n, n)) if len(pairs) else sparse.coo_matrix((n, n))
    _, label = connected_components(graph, directed=False)
    return label


MIN_PIECE_FACES = 50


def panel_border(faces: np.ndarray, panel: np.ndarray) -> set[tuple[int, int]]:
    """Edges between faces of different panels."""
    edges, face_edges = _edges(faces)
    first = np.full(len(edges), -1)
    border: set[tuple[int, int]] = set()
    for f, row in enumerate(face_edges):
        for e in row:
            if first[e] < 0:
                first[e] = panel[f]
            elif first[e] != panel[f]:
                border.add((int(edges[e, 0]), int(edges[e, 1])))
    return border


def absorb_small_pieces(faces: np.ndarray, panel: np.ndarray, cuts: set[tuple[int, int]], min_faces: int = MIN_PIECE_FACES) -> tuple[np.ndarray, set[tuple[int, int]], int]:
    """Pieces of fewer than min_faces triangles, or not the largest of their panel (e.g. slivers touching their region
    only at a vertex), join the neighbouring panel they share the most edges with. If that is their own panel (a piece
    enclosed by seam paths), the cut edges around it are dropped. Returns (panel, cuts, pieces absorbed)."""
    panel, cuts = panel.copy(), set(cuts)
    absorbed = 0
    for _ in range(6):
        seams = cuts | panel_border(faces, panel)
        label = panels_from_seams(faces, seams)
        counts = np.bincount(label)
        largest = {}
        for piece in np.unique(label):
            k = int(panel[label == piece][0])
            if k not in largest or counts[piece] > counts[largest[k]]:
                largest[k] = int(piece)
        # stray: small, or not the largest piece of its panel (a panel must be one piece)
        small = np.array([piece for piece in np.unique(label) if counts[piece] < min_faces or largest[int(panel[label == piece][0])] != piece])
        if not len(small):
            break
        edges, face_edges = _edges(faces)
        edge_faces: dict[int, list[int]] = {}
        for f, row in enumerate(face_edges):
            for e in row:
                edge_faces.setdefault(int(e), []).append(f)
        for piece in small:
            members = np.flatnonzero(label == piece)
            votes: dict[int, int] = {}
            for f in members:
                for e in face_edges[f]:
                    for g in edge_faces[int(e)]:
                        if label[g] != piece:
                            votes[int(panel[g])] = votes.get(int(panel[g]), 0) + 1
            if votes:
                best = max(votes, key=votes.get)
                if best == int(panel[members[0]]):  # enclosed by cut paths inside its own panel: drop those cuts
                    for f in members:
                        for e in face_edges[f]:
                            cuts.discard((int(edges[e, 0]), int(edges[e, 1])))
                panel[members] = best
                absorbed += 1
    return panel, cuts, absorbed


def corner_keys(faces: np.ndarray, panel: np.ndarray, seams: set[tuple[int, int]]) -> np.ndarray:
    """Per-corner keys (faces, 3, 2) for tshirt.assemble: a vertex is split wherever the faces around it are separated by
    a seam edge (or belong to different panels). Key = (panel, index of the corner's fan group around its vertex)."""
    edges, face_edges = _edges(faces)
    is_seam = np.array([(int(a), int(b)) in seams for a, b in edges])
    # union-find over the corners of each vertex: two corners join when their faces share a non-seam edge at that vertex
    corner_vertex = faces.ravel()
    parent = np.arange(len(corner_vertex))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    edge_corners: dict[int, list[tuple[int, int]]] = {}  # edge -> [(face, local corner index of edge start)]
    for f, row in enumerate(face_edges):
        for k, e in enumerate(row):
            edge_corners.setdefault(int(e), []).append((f, k))
    for e, items in edge_corners.items():
        if is_seam[e] or len(items) != 2:
            continue
        (f1, k1), (f2, k2) = items
        if panel[f1] != panel[f2]:
            continue
        for vertex in edges[e]:
            c1 = 3 * f1 + [k1, (k1 + 1) % 3][int(faces[f1, (k1 + 1) % 3] == vertex)]
            c2 = 3 * f2 + [k2, (k2 + 1) % 3][int(faces[f2, (k2 + 1) % 3] == vertex)]
            r1, r2 = find(c1), find(c2)
            if r1 != r2:
                parent[max(r1, r2)] = min(r1, r2)
    roots = np.array([find(i) for i in range(len(corner_vertex))])
    # group index per vertex: rank of the root among that vertex's roots
    order = np.lexsort((roots, corner_vertex))
    group = np.zeros(len(roots), dtype=int)
    last_vertex, last_root, rank = -1, -1, -1
    for i in order:
        if corner_vertex[i] != last_vertex:
            last_vertex, last_root, rank = corner_vertex[i], roots[i], 0
        elif roots[i] != last_root:
            last_root, rank = roots[i], rank + 1
        group[i] = rank
    return np.stack([np.repeat(panel, 3).astype(float), group.astype(float)], axis=1).reshape(-1, 3, 2)


def shirt_seams(vertices: np.ndarray, faces: np.ndarray, region: np.ndarray) -> tuple[np.ndarray, set[tuple[int, int]], dict[str, Any]]:
    """Panels (index into SHIRT_PANELS per face) and seam edges of a T-shirt (regions: 0 torso, 1 left, 2 right sleeve)."""
    V = np.asarray(vertices, dtype=np.float64)
    fr = face_regions(faces, region)
    torso_faces, report = faces[fr == 0], {}
    seams = _region_border(faces, fr, np.array([True, False, False, False, False, False, False, False]))
    cuts: set[tuple[int, int]] = set()
    loops = boundary_loops(faces, len(V))
    torso_vertices = set(np.unique(torso_faces).tolist())
    torso_loops = [loop for loop in loops if np.isin(loop, list(torso_vertices)).mean() > 0.5]
    neck = max(torso_loops, key=lambda loop: V[loop, 1].mean())
    hem = min(torso_loops, key=lambda loop: V[loop, 1].mean())
    torso_axis = axis_centre(V, np.isin(np.arange(len(V)), list(torso_vertices)))
    for side, sleeve_region, sign in (("left", 1, 1.0), ("right", 2, -1.0)):
        armhole = np.array(sorted({v for edge in seams for v in edge if sign * V[v, 0] > 0}))
        armpit, shoulder = int(armhole[np.argmin(V[armhole, 1])]), int(armhole[np.argmax(V[armhole, 1])])
        side_hem = hem[sign * V[hem, 0] > 0]
        side_target = side_hem[np.argsort(-sign * V[side_hem, 0])[: max(1, len(side_hem) // 20)]]  # the hem's side
        side_path = shortest_path(V, torso_faces, armpit, side_target, line_penalty(V, torso_axis, sign * np.pi / 2))
        neck_side = neck[sign * V[neck, 0] > 0]
        shoulder_path = shortest_path(V, torso_faces, shoulder, neck_side)
        sleeve_faces = faces[fr == sleeve_region]
        cuff = next(loop for loop in loops if np.isin(loop, np.unique(sleeve_faces)).mean() > 0.5 and sign * V[loop, 0].mean() > 0)
        underarm_path = shortest_path(V, sleeve_faces, armpit, cuff)
        cuts |= _path_edges(side_path) | _path_edges(shoulder_path) | _path_edges(underarm_path)
        report[side] = {"side_seam_m": _length(V, side_path), "shoulder_seam_m": _length(V, shoulder_path), "underarm_seam_m": _length(V, underarm_path)}
    label = panels_from_seams(faces, seams | cuts)
    panel = np.full(len(faces), -1)
    torso_labels = np.unique(label[fr == 0])
    sizes = {int(k): int((label == k).sum()) for k in torso_labels}
    main = sorted(sizes, key=lambda k: -sizes[k])[:2]
    if len(main) != 2:
        raise ValueError(f"the T-shirt torso did not split into front and back: {sizes}")
    front, back = sorted(main, key=lambda k: -float(V[faces[label == k]].reshape(-1, 3)[:, 2].mean()))
    panel[label == front], panel[label == back] = 0, 1
    for k in torso_labels:  # slivers cut off by crossing seams join the larger panel they touch most (front by default)
        if k not in main:
            panel[label == k] = 0 if V[faces[label == k]].reshape(-1, 3)[:, 2].mean() >= 0 else 1
    panel[fr == 1], panel[fr == 2] = 2, 3
    panel, cuts, report["absorbed_pieces"] = absorb_small_pieces(faces, panel, cuts)
    seams = cuts | panel_border(faces, panel)
    report["panels"] = {name: int((panel == i).sum()) for i, name in enumerate(SHIRT_PANELS)}
    return panel, seams, report


def pants_seams(vertices: np.ndarray, faces: np.ndarray, region: np.ndarray) -> tuple[np.ndarray, set[tuple[int, int]], dict[str, Any]]:
    """Panels (index into PANTS_PANELS per face) and seams of the pants (regions: 0 seat, 1 left leg, 2 right leg,
    3 waistband, 4 gusset)."""
    V = np.asarray(vertices, dtype=np.float64)
    fr = face_regions(faces, region)
    gusset_mask = np.zeros(8, dtype=bool)
    gusset_mask[4] = True
    seams = _region_border(faces, fr, gusset_mask)
    gusset_border = np.array(sorted({v for edge in seams for v in edge}))
    body = faces[fr != 4]
    loops = boundary_loops(faces, len(V))
    waist = max(loops, key=lambda loop: V[loop, 1].mean())
    hems = sorted([loop for loop in loops if loop is not waist], key=lambda loop: V[loop, 1].mean())[:2]
    report: dict[str, Any] = {}
    cuts: set[tuple[int, int]] = set()
    z_mid = float(V[waist, 2].mean())
    body_vertices = np.isin(np.arange(len(V)), np.unique(body))
    pelvis_axis = axis_centre(V, body_vertices)
    for name, sign in (("front", 1.0), ("back", -1.0)):
        half = waist[sign * (V[waist, 2] - z_mid) > 0]
        start = int(half[np.argmin(np.abs(V[half, 0]))])
        tip = gusset_border[np.argsort(-sign * V[gusset_border, 2])[:1]]
        path = shortest_path(V, body, start, tip, line_penalty(V, pelvis_axis, 0.0 if sign > 0 else np.pi))
        cuts |= _path_edges(path)
        report[f"centre_{name}_m"] = _length(V, path)
    for side, sign in (("left", 1.0), ("right", -1.0)):
        hem = next(loop for loop in hems if sign * V[loop, 0].mean() > 0)
        side_waist = waist[sign * V[waist, 0] > 0]
        out_start = int(side_waist[np.argmax(sign * V[side_waist, 0])])
        out_target = hem[np.argsort(-sign * V[hem, 0])[: max(1, len(hem) // 20)]]
        # each leg's own axis below the crotch, the pelvis axis above it (the side half of the garment at each height)
        side_axis = axis_centre(V, body_vertices & (sign * V[:, 0] > 0))
        outseam = shortest_path(V, body, out_start, out_target, line_penalty(V, side_axis, sign * np.pi / 2))
        gusset_side = gusset_border[sign * V[gusset_border, 0] > 0]
        in_start = int(gusset_side[np.argmax(sign * V[gusset_side, 0])])
        in_target = hem[np.argsort(sign * V[hem, 0])[: max(1, len(hem) // 20)]]
        inseam = shortest_path(V, body, in_start, in_target, line_penalty(V, side_axis, -sign * np.pi / 2))
        cuts |= _path_edges(outseam) | _path_edges(inseam)
        report[side] = {"outseam_m": _length(V, outseam), "inseam_m": _length(V, inseam)}
    label = panels_from_seams(faces, seams | cuts)
    panel = np.full(len(faces), -1)
    panel[fr == 4] = 4
    crease = gusset_crease_y(V, faces[fr == 4])
    report["gusset_crease_y"] = None if crease is None else round(crease, 4)
    pieces = {int(k): int((label == k).sum()) for k in np.unique(label[fr != 4])}
    main = sorted(pieces, key=lambda k: -pieces[k])[:4]
    if len(main) != 4:
        raise ValueError(f"the pants did not split into four panels: {pieces}")
    for k in main:
        centre = V[faces[label == k]].reshape(-1, 3).mean(axis=0)
        panel[label == k] = (0 if centre[0] > 0 else 2) + (0 if centre[2] > z_mid else 1)
    for k in pieces:
        if k not in main:
            centre = V[faces[label == k]].reshape(-1, 3).mean(axis=0)
            panel[label == k] = (0 if centre[0] > 0 else 2) + (0 if centre[2] > z_mid else 1)
    if crease is not None:  # the gusset's tips above its crease join the panels they are sewn to (crotch curve)
        tips = (fr == 4) & (V[faces].mean(axis=1)[:, 1] >= crease)
        panel[tips] = -1
        edges, face_edges = _edges(faces)
        edge_faces: dict[int, list[int]] = {}
        for f, row in enumerate(face_edges):
            for e in row:
                edge_faces.setdefault(int(e), []).append(f)
        for _ in range(len(faces)):
            pending = np.flatnonzero(panel < 0)
            if not len(pending):
                break
            changed = False
            for f in pending:
                votes: dict[int, int] = {}
                for e in face_edges[f]:
                    for g in edge_faces[int(e)]:
                        if panel[g] >= 0 and panel[g] != 4:
                            votes[int(panel[g])] = votes.get(int(panel[g]), 0) + 1
                if votes:
                    panel[f] = max(votes, key=votes.get)
                    changed = True
            if not changed:  # tip faces reachable only through the gusset base stay with it
                panel[panel < 0] = 4
                break
        report["gusset_tip_faces_moved"] = int(tips.sum())
    panel, cuts, report["absorbed_pieces"] = absorb_small_pieces(faces, panel, cuts)
    seams = cuts | panel_border(faces, panel)
    report["panels"] = {name: int((panel == i).sum()) for i, name in enumerate(PANTS_PANELS)}
    return panel, seams, report


GUSSET_CREASE_DEFECT_DEG = 15.0  # interior gusset vertices this far from flat mark the crease where it folds into the crotch


def vertex_angle_defect(vertices: np.ndarray, faces: np.ndarray) -> np.ndarray:
    """2*pi minus the sum of the corner angles at each vertex (Gaussian curvature; meaningful at interior vertices)."""
    total = np.zeros(len(vertices))
    for i in range(3):
        a, b, c = vertices[faces[:, i]], vertices[faces[:, (i + 1) % 3]], vertices[faces[:, (i + 2) % 3]]
        u, w = b - a, c - a
        cosine = np.einsum("ij,ij->i", u, w) / np.maximum(np.linalg.norm(u, axis=1) * np.linalg.norm(w, axis=1), 1e-16)
        np.add.at(total, faces[:, i], np.arccos(np.clip(cosine, -1.0, 1.0)))
    return 2 * np.pi - total


def gusset_crease_y(vertices: np.ndarray, gusset_faces: np.ndarray) -> float | None:
    """Height of the gusset's crease: the median height of its strongly curved interior vertices (None if it has none).
    The gusset's base (under the crotch) is nearly developable; above the crease its front and back tips turn up into
    the crotch curve, and flattening across the crease distorts the texture."""
    defect = vertex_angle_defect(vertices, gusset_faces)
    border = np.unique(np.concatenate(boundary_loops(gusset_faces, len(vertices)))) if len(gusset_faces) else np.zeros(0, int)
    interior = np.setdiff1d(np.unique(gusset_faces), border)
    creased = interior[np.abs(defect[interior]) > np.radians(GUSSET_CREASE_DEFECT_DEG)]
    return float(np.median(vertices[creased, 1])) if len(creased) else None


def _length(V: np.ndarray, path: list[int]) -> float:
    return round(float(np.linalg.norm(np.diff(V[path], axis=0), axis=1).sum()), 4)


def euler_characteristic(faces: np.ndarray) -> int:
    edges, _ = _edges(faces)
    return int(len(np.unique(faces)) - len(edges) + len(faces))


def cut(garment: Any, kind: str) -> tuple[Any, dict[str, Any]]:
    """A copy of the garment whose per-corner keys (corner_uv) split it along the pattern seams: tshirt.assemble then
    duplicates exactly the seam vertices, and the outer layer's UV holds (panel, fan group) until uv_layout.relayout_panels
    replaces it. Raises if a panel is not one disk-like piece (it could not be flattened)."""
    from dataclasses import replace

    seams_of = shirt_seams if kind == "tshirt" else pants_seams
    names = SHIRT_PANELS if kind == "tshirt" else PANTS_PANELS
    panel, seams, report = seams_of(garment.vertices, garment.faces, garment.region)
    keys = corner_keys(garment.faces, panel, seams)
    split = replace(garment, corner_uv=keys)
    # topology of every panel after the split (as assemble will build it)
    corners = garment.faces.reshape(-1)
    key = np.concatenate([corners[:, None].astype(np.float64), keys.reshape(-1, 2)], axis=1)
    _, inverse = np.unique(key, axis=0, return_inverse=True)
    split_faces = inverse.reshape(-1, 3)
    report["euler_characteristic"] = {}
    for i, name in enumerate(names):
        chi = euler_characteristic(split_faces[panel == i])
        report["euler_characteristic"][name] = chi
        if chi != 1:
            raise ValueError(f"{kind} panel {name} is not one disk-like piece after the seams (Euler characteristic {chi})")
    report["seam_edges"] = len(seams)
    return split, report
