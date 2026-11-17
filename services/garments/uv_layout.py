"""UV layout v2 (Sprint 3A follow-up), docs/contracts/garment-texture.md.

Replaces only TEXCOORD_0 values of an assembled garment; the vertex split pattern (UV seams), positions, normals,
indices, skin data and morphs are unchanged, so a GLB stays byte-identical outside its UV accessor.

Per island (the faces of one panel, over the GLB's already-split vertices):
1. As-rigid-as-possible (ARAP) parametrisation started from the existing cylindrical UVs (overlap-free; a free LSCM
   start folds the seat and sleeves over themselves): near-isometric, so texel density and aspect are uniform and
   stripes keep their spacing (no compressed hem band).
2. Oriented so the body's up (+y) runs along +v, never mirrored when the outer surface is seen from outside.
3. Scaled by the garment's fixed texel density and placed in the island's fixed, documented rectangle. An island split
   into several pieces by the existing UV seams has its pieces packed side by side, never overlapping; a piece that
   touches a larger one at a single (non-manifold) vertex is attached at that vertex, since the vertex has one UV.

Pants: the crotch gusset is its own piece inside the seat island (its borders are existing UV seams), flattened at the
same density as the seat, so it no longer lands on an empty area of the texture (the white patch). The inner layer
copies the outer layer's UVs; rims take the UV of their outer-edge vertex.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
from scipy import sparse
from scipy.sparse.linalg import splu


@dataclass(frozen=True)
class Island:
    name: str
    regions: tuple[int, ...]  # garment regions (_REGION) whose faces form the island
    rect: tuple[float, float, float, float]  # u0, v0, u1, v1 in the 0-1 layout


# Texel density (UV units per metre) and island rectangles, per garment type. Every size and body fits inside.
LAYOUTS: dict[str, dict[str, Any]] = {
    "tshirt": {"density": 0.45, "islands": (
        Island("torso", (0,), (0.0, 0.0, 1.0, 0.58)),
        Island("sleeve_left", (1,), (0.0, 0.60, 0.49, 1.0)),
        Island("sleeve_right", (2,), (0.51, 0.60, 1.0, 1.0)),
    )},
    "pants": {"density": 0.45, "islands": (
        Island("seat", (0, 3, 4), (0.0, 0.0, 1.0, 0.36)),  # seat + waistband + crotch gusset
        Island("leg_left", (1,), (0.0, 0.38, 0.49, 1.0)),
        Island("leg_right", (2,), (0.51, 0.38, 1.0, 1.0)),
    )},
}
PADDING = 0.005


def _local_frames(V: np.ndarray, F: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Per-triangle 2D coordinates of its corners (corner 0 at the origin, edge 0-1 on +x) and its area."""
    e1, e2 = V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]]
    l1 = np.linalg.norm(e1, axis=1)
    x = e1 / np.maximum(l1, 1e-12)[:, None]
    n = np.cross(e1, e2)
    area = 0.5 * np.linalg.norm(n, axis=1)
    y = np.cross(n, x)
    y /= np.maximum(np.linalg.norm(y, axis=1), 1e-12)[:, None]
    P = np.zeros((len(F), 3, 2))
    P[:, 1, 0] = l1
    P[:, 2, 0], P[:, 2, 1] = np.einsum("ij,ij->i", e2, x), np.einsum("ij,ij->i", e2, y)
    return P, area


def _lscm(V: np.ndarray, F: np.ndarray, P: np.ndarray, area: np.ndarray) -> np.ndarray:
    n = len(V)
    a, b = 0, int(np.argmax(np.linalg.norm(V - V[0], axis=1)))
    a = int(np.argmax(np.linalg.norm(V - V[b], axis=1)))  # two far-apart pins
    w = 1.0 / np.sqrt(np.maximum(area, 1e-16))
    rows, cols, vals = [], [], []
    for k in range(3):
        i, j = (k + 1) % 3, (k + 2) % 3
        wr, wi = (P[:, j, 0] - P[:, i, 0]) * w, (P[:, j, 1] - P[:, i, 1]) * w
        t = np.arange(len(F))
        # real row 2t: sum wr*s - wi*t ; imaginary row 2t+1: sum wi*s + wr*t (unknowns s = u, t = v interleaved)
        rows += [2 * t, 2 * t, 2 * t + 1, 2 * t + 1]
        cols += [2 * F[:, k], 2 * F[:, k] + 1, 2 * F[:, k], 2 * F[:, k] + 1]
        vals += [wr, -wi, wi, wr]
    A = sparse.coo_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(2 * len(F), 2 * n)).tocsc()
    pinned = np.array([2 * a, 2 * a + 1, 2 * b, 2 * b + 1])
    pinned_values = np.array([0.0, 0.0, float(np.linalg.norm(V[a] - V[b])), 0.0])
    free = np.setdiff1d(np.arange(2 * n), pinned)
    Af, Ap = A[:, free], A[:, pinned]
    rhs = -(Ap @ pinned_values)
    solution = splu((Af.T @ Af).tocsc()).solve(Af.T @ rhs)
    uv = np.zeros(2 * n)
    uv[free], uv[pinned] = solution, pinned_values
    return uv.reshape(n, 2)


def _arap(V: np.ndarray, F: np.ndarray, P: np.ndarray, uv: np.ndarray, iterations: int) -> np.ndarray:
    n = len(V)
    cot = np.zeros((len(F), 3))  # cot of the angle opposite edge (k+1, k+2)
    for k in range(3):
        i, j = (k + 1) % 3, (k + 2) % 3
        u, v = P[:, i] - P[:, k], P[:, j] - P[:, k]
        cross = np.abs(u[:, 0] * v[:, 1] - u[:, 1] * v[:, 0])
        cot[:, k] = np.einsum("ij,ij->i", u, v) / np.maximum(cross, 1e-16)
    weight = np.clip(cot, 1e-3, 1e3) * 0.5
    rows, cols, vals = [], [], []
    for k in range(3):
        i, j = F[:, (k + 1) % 3], F[:, (k + 2) % 3]
        rows += [i, j, i, j]
        cols += [j, i, i, j]
        vals += [-weight[:, k], -weight[:, k], weight[:, k], weight[:, k]]
    L = sparse.coo_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(n, n)).tocsr()
    fixed = 0
    free = np.arange(1, n)
    solver = splu(L[free][:, free].tocsc())
    for _ in range(iterations):
        # local step: best rotation of each rest triangle onto its current image
        J = np.zeros((len(F), 2, 2))
        for k in range(3):
            i, j = (k + 1) % 3, (k + 2) % 3
            du = uv[F[:, i]] - uv[F[:, j]]
            dp = P[:, i] - P[:, j]
            J += weight[:, k, None, None] * np.einsum("ti,tj->tij", du, dp)
        U, _, Vt = np.linalg.svd(J)
        R = U @ Vt
        flip = np.linalg.det(R) < 0
        U[flip, :, 1] *= -1
        R = U @ Vt
        # global step
        rhs = np.zeros((n, 2))
        for k in range(3):
            i, j = F[:, (k + 1) % 3], F[:, (k + 2) % 3]
            r = weight[:, k, None] * np.einsum("tij,tj->ti", R, P[:, (k + 1) % 3] - P[:, (k + 2) % 3])
            np.add.at(rhs, i, r)
            np.add.at(rhs, j, -r)
        rhs_free = rhs[free] - L[free][:, [fixed]] @ uv[[fixed]]
        uv[free] = np.column_stack([solver.solve(rhs_free[:, c]) for c in range(2)])
    return uv


def parametrise(V: np.ndarray, F: np.ndarray, iterations: int = 150, init: np.ndarray | None = None) -> list[tuple[np.ndarray, np.ndarray, np.ndarray]]:
    """Near-isometric UVs (metres) per connected component: [(vertex ids, local faces, uv)], largest first. An island
    can be split into several pieces by the existing UV seams; each piece is flattened on its own."""
    import trimesh

    mesh = trimesh.Trimesh(V, F, process=False)
    pieces = []
    for component in trimesh.graph.connected_components(mesh.face_adjacency, nodes=np.arange(len(F)), min_len=1):
        faces = F[component]
        used = np.unique(faces)
        remap = np.full(len(V), -1)
        remap[used] = np.arange(len(used))
        local = remap[faces]
        P, area = _local_frames(V[used], local)
        if init is not None:  # start from the existing (cylindrical, overlap-free) UVs, rescaled to metres
            start = init[used].astype(np.float64).copy()
            t1, t2 = start[local[:, 1]] - start[local[:, 0]], start[local[:, 2]] - start[local[:, 0]]
            uv_area = 0.5 * np.abs(t1[:, 0] * t2[:, 1] - t1[:, 1] * t2[:, 0])
            scale = np.sqrt(area.sum() / max(uv_area.sum(), 1e-16))
            start = (start - start.mean(axis=0)) * scale
        else:
            start = _lscm(V[used], local, P, area)
        pieces.append((used, local, _arap(V[used], local, P, start, iterations)))
    return sorted(pieces, key=lambda piece: -len(piece[1]))


PIECE_GAP = 0.01  # UV gap between pieces of one island


def pack(pieces: list[np.ndarray]) -> list[np.ndarray]:
    """Place oriented pieces (UV units) without overlap: the largest at the origin, the rest on a shelf to its right,
    wrapping upwards when the shelf is as wide as the largest piece."""
    placed = [pieces[0] - pieces[0].min(axis=0)]
    width = float(np.ptp(pieces[0][:, 0])) if len(pieces) else 0.0
    x, y, shelf = width + PIECE_GAP, 0.0, 0.0
    for piece in pieces[1:]:
        size = np.ptp(piece, axis=0)
        if x > width + PIECE_GAP and x + size[0] > 2 * width:
            x, y, shelf = width + PIECE_GAP, y + shelf + PIECE_GAP, 0.0
        placed.append(piece - piece.min(axis=0) + np.array([x, y]))
        x += size[0] + PIECE_GAP
        shelf = max(shelf, float(size[1]))
    return placed


def _orient(uv: np.ndarray, V: np.ndarray, F: np.ndarray) -> np.ndarray:
    """Rotate so world +y runs along +v; mirror first if the outer surface would be seen mirrored."""
    e1, e2 = uv[F[:, 1]] - uv[F[:, 0]], uv[F[:, 2]] - uv[F[:, 0]]
    if (e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0]).sum() < 0:  # faces wind outward: their UV area must be positive
        uv = uv * np.array([-1.0, 1.0])
    A = np.column_stack([uv, np.ones(len(uv))])
    a, b, _ = np.linalg.lstsq(A, V[:, 1], rcond=None)[0]  # y ~ a u + b v + c: up direction in UV is (a, b)
    angle = np.arctan2(a, b)  # rotate (a, b) onto (0, 1)
    c, s = np.cos(angle), np.sin(angle)
    return uv @ np.array([[c, -s], [s, c]]).T


def relayout(arrays: dict[str, Any], kind: str) -> tuple[np.ndarray, dict[str, Any]]:
    """New TEXCOORD_0 for an assembled garment (assemble() arrays with _inner/_source/region)."""
    layout = LAYOUTS[kind]
    positions = np.asarray(arrays["position"], dtype=np.float64)
    faces = np.asarray(arrays["faces"]).reshape(-1, 3)
    inner = np.asarray(arrays["_inner"], dtype=bool)
    source = np.asarray(arrays["_source"])
    region = np.asarray(arrays["region"]).astype(int)
    n = int(np.argmax(inner))  # outer layer = [0, n), inner layer = [n, 2n), rims after 2n
    outer_faces = faces[(faces < n).all(axis=1)]
    face_region = np.array([np.bincount(row, minlength=8).argmax() for row in region[outer_faces]])
    uv = np.array(arrays["uv"], dtype=np.float64)
    report: dict[str, Any] = {"kind": kind, "density_uv_per_m": layout["density"], "islands": {}}
    for island in layout["islands"]:
        F = outer_faces[np.isin(face_region, island.regions)]
        if not len(F):
            continue
        used = np.unique(F)
        keys = used  # the gusset stays its own piece: joining it to the seat closes a loop around the hips that folds
        index = {int(k): i for i, k in enumerate(keys)}
        local = np.vectorize(lambda v: index[int(v)])(F)
        pieces = parametrise(positions[keys], local, init=np.asarray(arrays["uv"], dtype=np.float64)[keys])
        oriented = [_orient(piece_uv, positions[keys[piece_ids]], piece_faces) * layout["density"] for piece_ids, piece_faces, piece_uv in pieces]
        # pieces that touch an earlier (larger) piece at a vertex (non-manifold corners: a vertex has one UV, so such a
        # piece cannot be moved away) are attached there by translation; only the free pieces are packed
        flat = np.zeros((len(keys), 2))
        placed_at = np.zeros(len(keys), dtype=bool)
        free = []
        for i, (piece_ids, _, _) in enumerate(pieces):
            if not any(set(piece_ids.tolist()) & set(pieces[j][0].tolist()) for j in range(i)):
                free.append(i)
        for i, placed in zip(free, pack([oriented[i] for i in free])):
            flat[pieces[i][0]] = placed
            placed_at[pieces[i][0]] = True
        for i, (piece_ids, _, _) in enumerate(pieces):
            if i in free:
                continue
            anchor = piece_ids[placed_at[piece_ids]]
            first = int(np.flatnonzero(np.isin(piece_ids, anchor))[0])
            moved = oriented[i] - oriented[i][first] + flat[piece_ids[first]]
            fresh = ~placed_at[piece_ids]
            flat[piece_ids[fresh]] = moved[fresh]
            placed_at[piece_ids] = True
        lo, hi = flat.min(axis=0), flat.max(axis=0)
        u0, v0, u1, v1 = island.rect
        size = hi - lo
        room = np.array([u1 - u0, v1 - v0]) - 2 * PADDING
        if (size > room + 1e-9).any():
            raise ValueError(f"{kind} island {island.name} ({size.round(3)}) does not fit its rectangle ({room.round(3)})")
        offset = np.array([u0, v0]) + PADDING + (room - size) / 2 - lo  # centred in its rectangle
        values = flat + offset
        for v in used:
            uv[v] = values[index[int(v)]]
        report["islands"][island.name] = {"rect": list(island.rect), "used_uv": [*(lo + offset).round(4).tolist(), *(hi + offset).round(4).tolist()], "vertices": int(len(used)), "faces": int(len(F)), "pieces": [int(len(piece[1])) for piece in pieces], "method": "arap-from-previous-uv"}
    uv[n:2 * n] = uv[:n]  # inner layer
    # rims: each rim vertex takes the UV of an outer-layer vertex of the same garment vertex
    first_outer: dict[int, int] = {}
    for v in range(n):
        first_outer.setdefault(int(source[v]), v)
    for v in range(2 * n, len(uv)):
        uv[v] = uv[first_outer[int(source[v])]]
    return uv, report


def glb_outer_faces(faces: np.ndarray, uv: np.ndarray) -> np.ndarray:
    """Outer-layer faces of a v2-layout GLB. The vertex buffer is [outer n | inner n (a copy of the outer UVs) | rims],
    so n is the first split where the second block's UVs repeat the first's; the outer layer is the faces whose three
    vertices are below n. (Selecting faces by positive UV area instead would swap a folded outer face for its inner
    twin and hide the fold.)"""
    candidates = np.flatnonzero((uv == uv[0]).all(axis=1))
    for n in candidates[candidates > 0]:
        if 2 * n <= len(uv) and np.array_equal(uv[n:2 * n], uv[:n]):
            return faces[(faces < n).all(axis=1)]
    raise ValueError("not a UV layout v2 GLB: no inner layer repeating the outer UVs")


# Quality bounds (docs/contracts/garment-texture.md). STRICT: the neutral base garments (tshirt-v5.2, pants-v2), which
# the layout was tuned on. FIT_3A: every fit on another body or size (personal fits, Sprint 3A sizes), measured worst
# cases with margin; Sprint 3.5 (per-panel seams) restores STRICT for all.
STRICT = {"min_within_tolerance": 0.99, "anisotropy_p99": 1.35, "overlap_excluding_folded_pct": 0.5, "folded_pct": 0.02, "folded_area_cm2": 20.0}
FIT_3A = {"min_within_tolerance": 0.985, "anisotropy_p99": 1.45, "overlap_excluding_folded_pct": 0.5, "folded_pct": 0.02, "folded_area_cm2": 20.0}
MIN_WITHIN_TOLERANCE = STRICT["min_within_tolerance"]  # share of each island's triangles within +/-15% of its median density


def _overlap_pct(uv: np.ndarray, faces: np.ndarray, resolution: int = 2048) -> float:
    """Share of an island's UV area covered more than once: rasterise every triangle (pixel centres) and compare the
    summed coverage with the covered pixels."""
    count = np.zeros((resolution, resolution), dtype=np.uint8)
    tri = uv[faces] * resolution
    lo = np.floor(tri.min(axis=1)).astype(int).clip(0, resolution - 1)
    hi = np.ceil(tri.max(axis=1)).astype(int).clip(0, resolution - 1)
    for t, (a, b) in enumerate(zip(lo, hi)):
        xs, ys = np.meshgrid(np.arange(a[0], b[0] + 1) + 0.5, np.arange(a[1], b[1] + 1) + 0.5)
        p = np.stack([xs.ravel(), ys.ravel()], axis=1)
        v0, v1, v2 = tri[t]
        d = (v1[0] - v0[0]) * (v2[1] - v0[1]) - (v1[1] - v0[1]) * (v2[0] - v0[0])
        if abs(d) < 1e-12:
            continue
        w1 = ((p[:, 0] - v0[0]) * (v2[1] - v0[1]) - (p[:, 1] - v0[1]) * (v2[0] - v0[0])) / d
        w2 = ((v1[0] - v0[0]) * (p[:, 1] - v0[1]) - (v1[1] - v0[1]) * (p[:, 0] - v0[0])) / d
        inside = (w1 >= 0) & (w2 >= 0) & (w1 + w2 <= 1)
        q = p[inside].astype(int)
        np.add.at(count, (q[:, 1], q[:, 0]), 1)
    covered = int((count > 0).sum())
    return 100.0 * int((count > 1).sum()) / covered if covered else 0.0


def density_check(positions: np.ndarray, faces: np.ndarray, uv: np.ndarray, region: np.ndarray, kind: str, tolerance: float = 0.15) -> dict[str, Any]:
    """Per island: texel density sqrt(UV area / 3D area) of each outer-layer triangle relative to the island median,
    its anisotropy (ratio of the UV map's singular values), and UVs outside the island rectangles."""
    layout = LAYOUTS[kind]
    region = np.asarray(region).astype(int)
    e1, e2 = positions[faces[:, 1]] - positions[faces[:, 0]], positions[faces[:, 2]] - positions[faces[:, 0]]
    area3 = 0.5 * np.linalg.norm(np.cross(e1, e2), axis=1)
    t1, t2 = uv[faces[:, 1]] - uv[faces[:, 0]], uv[faces[:, 2]] - uv[faces[:, 0]]
    signed_uv = 0.5 * (t1[:, 0] * t2[:, 1] - t1[:, 1] * t2[:, 0])
    area_uv = np.abs(signed_uv)
    folded = signed_uv < 0  # outer faces wind outward: a negative UV area is a triangle flipped (folded) by the flattening
    P, _ = _local_frames(positions, faces)
    D = np.stack([P[:, 1], P[:, 2]], axis=2)  # 2x2 local edge matrix
    T = np.stack([t1, t2], axis=2)
    with np.errstate(all="ignore"):
        J = T @ np.linalg.pinv(D)
        sv = np.linalg.svd(J, compute_uv=False)
        anisotropy = sv[:, 0] / np.maximum(sv[:, 1], 1e-12)
    face_region = np.array([np.bincount(row, minlength=8).argmax() for row in region[faces]])
    report: dict[str, Any] = {}
    for island in layout["islands"]:
        m = np.isin(face_region, island.regions) & (area3 > 1e-8)
        if not m.any():
            continue
        density = np.sqrt(area_uv[m] / area3[m])
        median = float(np.median(density))
        ratio = density / median
        u0, v0, u1, v1 = island.rect
        corners = uv[faces[m]].reshape(-1, 2)
        outside = ((corners[:, 0] < u0 - 1e-6) | (corners[:, 0] > u1 + 1e-6) | (corners[:, 1] < v0 - 1e-6) | (corners[:, 1] > v1 + 1e-6)).sum()
        island_folded = folded & np.isin(face_region, island.regions)
        report[island.name] = {
            "uv_overlap_pct": round(_overlap_pct(uv, faces[m]), 3),
            "uv_overlap_excluding_folded_pct": round(_overlap_pct(uv, faces[m & ~folded]), 3),
            "folded_triangles": int(island_folded.sum()),
            "folded_pct": round(100 * float(island_folded.sum()) / max(int(m.sum()), 1), 4),
            "folded_area_cm2": round(float(area3[island_folded].sum()) * 1e4, 2),
            "triangles": int(m.sum()), "median_density_uv_per_m": round(median, 4),
            "outside_tolerance": int((np.abs(ratio - 1) > tolerance).sum()),
            "outside_tolerance_pct": round(float(np.mean(np.abs(ratio - 1) > tolerance)) * 100, 2),
            "ratio_min_max": [round(float(ratio.min()), 3), round(float(ratio.max()), 3)],
            "anisotropy_p99": round(float(np.percentile(anisotropy[m], 99)), 3),
            "uv_corners_outside_island": int(outside),
        }
    return report


# ---------------------------------------------------------------------------------------------------------------------
# UV layout v3 (Sprint 3.5): one island per pattern panel, for tshirt-v5.3 and pants-v3 (docs/contracts/garment-texture.md)
# ---------------------------------------------------------------------------------------------------------------------

PANEL_LAYOUTS: dict[str, dict[str, Any]] = {
    "tshirt": {"density": 0.45, "islands": (  # Island.regions = (panel index in panels.SHIRT_PANELS,)
        Island("front", (0,), (0.0, 0.0, 0.49, 0.49)),
        Island("back", (1,), (0.51, 0.0, 1.0, 0.49)),
        Island("sleeve_left", (2,), (0.0, 0.51, 0.49, 1.0)),
        Island("sleeve_right", (3,), (0.51, 0.51, 1.0, 1.0)),
    )},
    "pants": {"density": 0.45, "islands": (  # panels.PANTS_PANELS
        Island("left_front", (0,), (0.0, 0.0, 0.245, 0.48)),
        Island("left_back", (1,), (0.255, 0.0, 0.5, 0.48)),
        Island("right_front", (2,), (0.5, 0.0, 0.745, 0.48)),
        Island("right_back", (3,), (0.755, 0.0, 1.0, 0.48)),
        Island("gusset", (4,), (0.0, 0.5, 0.2, 0.7)),
    )},
}
UP_DEFINED = 0.5  # garment up within 60 deg of the cloth's plane: the up angle is measured there (and only there)
SNAP_EDGE_M = 0.0005  # vertices closer than this along an edge (degenerate slivers) share one UV
# A triangle is folded when its UV area is negative by more than this share of the area its 3D size implies at the
# layout's density. A real fold flips its whole area; a long sliver squashed to ~zero UV area (|area| ~ 1e-13, sign
# from float32 rounding) covers nothing twice and is counted as a density outlier instead.
FOLD_AREA_SHARE = 1e-3


def folded_mask(signed_uv: np.ndarray, area3: np.ndarray, density: float) -> np.ndarray:
    return signed_uv < -FOLD_AREA_SHARE * area3 * density**2
GUSSET_PANEL = "gusset"


def panel_up(kind: str, name: str, V: np.ndarray) -> np.ndarray:
    """Garment up of a panel (unit, world): +Y, except sleeves (the sleeve axis towards the shoulder) and the gusset (its
    length, front to back: it runs under the crotch, where +Y has no direction on the cloth)."""
    if name == GUSSET_PANEL:
        axis = np.linalg.svd(V - V.mean(axis=0), full_matrices=False)[2][0]
        return axis * (1.0 if axis[2] >= 0 else -1.0)
    if kind == "tshirt" and name.startswith("sleeve"):
        # from the cuff end (the outermost fifth of the sleeve) to the armhole end (the innermost fifth): along the arm
        # however wide the sleeve is (a principal axis turns round the arm on wide, short sleeves)
        reach = np.abs(V[:, 0])
        inner, outer = V[reach <= np.quantile(reach, 0.2)].mean(axis=0), V[reach >= np.quantile(reach, 0.8)].mean(axis=0)
        axis = inner - outer
        return axis / np.linalg.norm(axis)
    return np.array([0.0, 1.0, 0.0])


def mapped_up(V: np.ndarray, F: np.ndarray, uv: np.ndarray, up: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Per triangle: the signed angle (rad) of garment up mapped into UV, from +v; whether up is defined there; 3D area."""
    e1, e2 = V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]]
    area = 0.5 * np.linalg.norm(np.cross(e1, e2), axis=1)
    x = e1 / np.maximum(np.linalg.norm(e1, axis=1), 1e-12)[:, None]
    y = np.cross(np.cross(e1, e2), x)
    y /= np.maximum(np.linalg.norm(y, axis=1), 1e-12)[:, None]
    local = np.column_stack([x @ up, y @ up])
    length = np.linalg.norm(local, axis=1)
    local /= np.maximum(length, 1e-12)[:, None]
    P, _ = _local_frames(V, F)
    T = np.stack([uv[F[:, 1]] - uv[F[:, 0]], uv[F[:, 2]] - uv[F[:, 0]]], axis=2)
    D = np.stack([P[:, 1], P[:, 2]], axis=2)
    with np.errstate(all="ignore"):
        mapped = np.einsum("tij,tj->ti", T @ np.linalg.pinv(D), local)
    return np.arctan2(mapped[:, 0], mapped[:, 1]), (length >= UP_DEFINED) & (area > 1e-12), area


def _snap_degenerate(uv: np.ndarray, V: np.ndarray, F: np.ndarray) -> int:
    """Vertices joined by an edge shorter than SNAP_EDGE_M take their mean UV (a sliver of ~zero area cannot fold)."""
    edges = np.unique(np.sort(np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]), axis=1), axis=0)
    short = edges[np.linalg.norm(V[edges[:, 0]] - V[edges[:, 1]], axis=1) < SNAP_EDGE_M]
    if not len(short):
        return 0
    parent = np.arange(len(V))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for a, b in short:
        ra, rb = find(int(a)), find(int(b))
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)
    roots = np.array([find(i) for i in range(len(V))])
    for root in np.unique(roots[np.unique(short)]):
        members = np.flatnonzero(roots == root)
        uv[members] = uv[members].mean(axis=0)
    return int(len(short))


def _signed_uv_area(uv: np.ndarray, F: np.ndarray) -> np.ndarray:
    t1, t2 = uv[F[:, 1]] - uv[F[:, 0]], uv[F[:, 2]] - uv[F[:, 0]]
    return 0.5 * (t1[:, 0] * t2[:, 1] - t1[:, 1] * t2[:, 0])


def _unfold(uv: np.ndarray, V: np.ndarray, F: np.ndarray, rings: int = 2, rounds: int = 4, density: float = 0.45) -> int:
    """Re-place the vertices around folded (negative-area, non-degenerate) triangles: the patch of `rings` rings around
    them is solved as a uniform (Tutte) Laplacian with its boundary held, which removes local folds. Returns folds left."""
    area3 = 0.5 * np.linalg.norm(np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]]), axis=1)
    edges = np.unique(np.sort(np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]), axis=1), axis=0)
    neighbours: list[list[int]] = [[] for _ in range(len(V))]
    for a, b in edges:
        neighbours[int(a)].append(int(b))
        neighbours[int(b)].append(int(a))
    for _ in range(rounds):
        folded = folded_mask(_signed_uv_area(uv, F), area3, density) & (area3 > 1e-10)
        if not folded.any():
            return 0
        patch = set(np.unique(F[folded]).tolist())
        for _ in range(rings):
            patch |= {n for v in list(patch) for n in neighbours[v]}
        inside = np.array(sorted(patch))
        if not any(n not in patch for v in inside for n in neighbours[v]):
            break  # the patch has no held boundary (it covers the whole panel)
        index = {int(v): i for i, v in enumerate(inside)}
        rows, cols, vals, rhs = [], [], [], np.zeros((len(inside), 2))
        for v in inside:
            i = index[int(v)]
            rows.append(i)
            cols.append(i)
            vals.append(float(len(neighbours[v])))
            for nb in neighbours[v]:
                if nb in index:
                    rows.append(i)
                    cols.append(index[nb])
                    vals.append(-1.0)
                else:
                    rhs[i] += uv[nb]
        solver = splu(sparse.coo_matrix((vals, (rows, cols)), shape=(len(inside), len(inside))).tocsc())
        uv[inside] = np.column_stack([solver.solve(rhs[:, c]) for c in range(2)])
    return int((folded_mask(_signed_uv_area(uv, F), area3, density) & (area3 > 1e-10)).sum())


def relayout_panels(arrays: dict[str, Any], kind: str) -> tuple[np.ndarray, dict[str, Any], np.ndarray]:
    """UV layout v3 for an assembled panel garment (panels.cut then tshirt.assemble): the outer layer's UV holds
    (panel, fan group). Returns (TEXCOORD_0, report, panel index per vertex for the _PANEL attribute)."""
    layout = PANEL_LAYOUTS[kind]
    positions = np.asarray(arrays["position"], dtype=np.float64)
    faces = np.asarray(arrays["faces"]).reshape(-1, 3)
    inner = np.asarray(arrays["_inner"], dtype=bool)
    source = np.asarray(arrays["_source"])
    n = int(np.argmax(inner))
    keys = np.asarray(arrays["uv"], dtype=np.float64)
    vertex_panel = np.rint(keys[:n, 0]).astype(int)
    outer_faces = faces[(faces < n).all(axis=1)]
    face_panel = vertex_panel[outer_faces[:, 0]]
    if not (vertex_panel[outer_faces] == face_panel[:, None]).all():
        raise ValueError("a face spans two panels: the garment was not split by panels.cut")
    uv = np.zeros((len(positions), 2))
    report: dict[str, Any] = {"kind": kind, "layout": "v3 (one island per panel)", "density_uv_per_m": layout["density"], "islands": {}}
    for island in layout["islands"]:
        F = outer_faces[face_panel == island.regions[0]]
        if not len(F):
            raise ValueError(f"{kind}: panel {island.name} has no faces")
        used = np.unique(F)
        remap = np.full(len(positions), -1)
        remap[used] = np.arange(len(used))
        local = remap[F]
        V = positions[used]
        P, area = _local_frames(V, local)
        flat = _arap(V, local, P, _lscm(V, local, P, area), 150)
        if _signed_uv_area(flat, local).sum() < 0:  # faces wind outward: the outside must not be mirrored
            flat = flat * np.array([-1.0, 1.0])
        up = panel_up(kind, island.name, V)
        theta, defined, area3 = mapped_up(V, local, flat, up)
        # axial mean of the mapped up lines: rotating the UVs by it (counter-clockwise turns angle theta into
        # theta - rotation) is the best upright rotation in the area-weighted sense
        rotation = 0.5 * np.angle(((area3 * defined) * np.exp(2j * theta)).sum())
        c, s = np.cos(rotation), np.sin(rotation)
        flat = flat @ np.array([[c, -s], [s, c]]).T
        theta, _, _ = mapped_up(V, local, flat, up)
        if np.average(np.cos(theta), weights=area3 * defined + 1e-30) < 0:  # up must run to +v, not -v
            flat = -flat
        flat = flat * layout["density"]
        snapped = _snap_degenerate(flat, V, local)
        folds_left = _unfold(flat, V, local, density=layout["density"])
        lo, hi = flat.min(axis=0), flat.max(axis=0)
        u0, v0, u1, v1 = island.rect
        size, room = hi - lo, np.array([u1 - u0, v1 - v0]) - 2 * PADDING
        if (size > room + 1e-9).any():
            raise ValueError(f"{kind} island {island.name} ({size.round(3)}) does not fit its rectangle ({room.round(3)})")
        offset = np.array([u0, v0]) + PADDING + (room - size) / 2 - lo
        uv[used] = flat + offset
        report["islands"][island.name] = {"rect": list(island.rect), "used_uv": [*(lo + offset).round(4).tolist(), *(hi + offset).round(4).tolist()],
                                          "faces": int(len(F)), "vertices": int(len(used)), "up": up.round(4).tolist(),
                                          "degenerate_edges_snapped": snapped, "folds_after_repair": folds_left}
    uv[n:2 * n] = uv[:n]
    panel = np.zeros(len(positions), dtype=np.float32)
    panel[:n] = vertex_panel
    panel[n:2 * n] = vertex_panel
    first_outer: dict[int, int] = {}
    for v in range(n):
        first_outer.setdefault(int(source[v]), v)
    for v in range(2 * n, len(uv)):
        uv[v] = uv[first_outer[int(source[v])]]
        panel[v] = vertex_panel[first_outer[int(source[v])]]
    return uv, report, panel


def panel_check(positions: np.ndarray, faces: np.ndarray, uv: np.ndarray, panel: np.ndarray, kind: str, tolerance: float = 0.15) -> dict[str, Any]:
    """Per panel island of a v3 GLB (outer-layer faces, _PANEL per vertex): density, anisotropy, folds, overlap,
    rectangle and the area-weighted up angle (lines, 0-90 deg) over the triangles where garment up is defined."""
    layout = PANEL_LAYOUTS[kind]
    face_panel = np.rint(np.asarray(panel)[faces[:, 0]]).astype(int)
    report: dict[str, Any] = {}
    for island in layout["islands"]:
        F = faces[face_panel == island.regions[0]]
        V = positions
        area3 = 0.5 * np.linalg.norm(np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]]), axis=1)
        signed = _signed_uv_area(uv, F)
        ok = area3 > 1e-10
        density = np.sqrt(np.abs(signed[ok]) / area3[ok])
        ratio = density / np.median(density)
        P, _ = _local_frames(V, F)
        T = np.stack([uv[F[:, 1]] - uv[F[:, 0]], uv[F[:, 2]] - uv[F[:, 0]]], axis=2)
        D = np.stack([P[:, 1], P[:, 2]], axis=2)
        with np.errstate(all="ignore"):
            sv = np.linalg.svd(T @ np.linalg.pinv(D), compute_uv=False)
        anisotropy = sv[ok, 0] / np.maximum(sv[ok, 1], 1e-12)
        up = panel_up(kind, island.name, V[np.unique(F)])
        theta, defined, _ = mapped_up(V, F, uv, up)
        line = np.degrees(np.arctan2(np.abs(np.sin(theta)), np.abs(np.cos(theta))))
        weight = area3 * defined
        u0, v0, u1, v1 = island.rect
        corners = uv[F].reshape(-1, 2)
        outside = ((corners[:, 0] < u0 - 1e-6) | (corners[:, 0] > u1 + 1e-6) | (corners[:, 1] < v0 - 1e-6) | (corners[:, 1] > v1 + 1e-6)).sum()
        report[island.name] = {
            "triangles": int(len(F)), "median_density_uv_per_m": round(float(np.median(density)), 4),
            "outside_tolerance_pct": round(100 * float(np.mean(np.abs(ratio - 1) > tolerance)), 2),
            "anisotropy_p99": round(float(np.percentile(anisotropy, 99)), 3),
            "folded_triangles": int((folded_mask(signed, area3, layout["density"]) & ok).sum()),
            "squashed_triangles": int(((np.abs(signed) < FOLD_AREA_SHARE * area3 * layout["density"] ** 2) & ok).sum()),
            "uv_overlap_pct": round(_overlap_pct(uv, F[ok]), 3),
            "up_angle_mean_deg": round(float((line * weight).sum() / max(weight.sum(), 1e-16)), 2),
            "up_angle_p95_deg": round(float(np.percentile(line[defined], 95)), 2) if defined.any() else None,
            "up_undefined_area_pct": round(100 * float(1 - weight.sum() / max(area3.sum(), 1e-16)), 1),
            "uv_corners_outside_island": int(outside),
        }
    return report
