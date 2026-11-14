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
    """Outer-layer faces of a v2-layout GLB: the inner layer reuses the outer UVs with reversed winding (negative UV
    area) and rims are flat in UV, so the outer layer is exactly the faces with positive signed UV area."""
    t1, t2 = uv[faces[:, 1]] - uv[faces[:, 0]], uv[faces[:, 2]] - uv[faces[:, 0]]
    return faces[(t1[:, 0] * t2[:, 1] - t1[:, 1] * t2[:, 0]) > 1e-14]


MIN_WITHIN_TOLERANCE = 0.99  # share of each island's triangles within +/-15% of its median density (see contract)


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
    area_uv = 0.5 * np.abs(t1[:, 0] * t2[:, 1] - t1[:, 1] * t2[:, 0])
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
        report[island.name] = {
            "uv_overlap_pct": round(_overlap_pct(uv, faces[m]), 3),
            "triangles": int(m.sum()), "median_density_uv_per_m": round(median, 4),
            "outside_tolerance": int((np.abs(ratio - 1) > tolerance).sum()),
            "outside_tolerance_pct": round(float(np.mean(np.abs(ratio - 1) > tolerance)) * 100, 2),
            "ratio_min_max": [round(float(ratio.min()), 3), round(float(ratio.max()), 3)],
            "anisotropy_p99": round(float(np.percentile(anisotropy[m], 99)), 3),
            "uv_corners_outside_island": int(outside),
        }
    return report
