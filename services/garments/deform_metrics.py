"""Deformation metrics, a Python port of apps/web/lib/garment/diagnostics.ts with identical definitions (Sprint 1.4A).

stretch: max posed/rest edge ratio per triangle; percentiles use sorted[min(n-1, floor(p*n))] like the JS.
flipped: posed normal opposite the rest normal carried by the sum of the triangle's three blended skin matrices.
degenerate: posed area < 0.1% of rest area. Self-intersection: exact edge/triangle crossings, pairs sharing a
position-welded vertex skipped. Penetration: signed distance to the nearest posed body vertex along its normal
(approximate).
"""
from __future__ import annotations

from typing import Any

import numpy as np
from scipy.spatial import cKDTree

from posing import blend_matrices


def percentile(values: np.ndarray, p: float) -> float:
    ordered = np.sort(values)
    return float(ordered[min(len(ordered) - 1, int(np.floor(p * len(ordered))))])


def triangle_deformation(rest: np.ndarray, posed: np.ndarray, index: np.ndarray, joints: np.ndarray, weights: np.ndarray, matrices: np.ndarray) -> dict[str, np.ndarray]:
    a, b, c = (index[:, k] for k in range(3))
    ratios = []
    for p, q in ((a, b), (b, c), (c, a)):
        rest_length = np.linalg.norm(rest[p] - rest[q], axis=1)
        posed_length = np.linalg.norm(posed[p] - posed[q], axis=1)
        ratios.append(np.where(rest_length > 1e-9, posed_length / np.where(rest_length > 1e-9, rest_length, 1), 1.0))
    ratios = np.stack(ratios, axis=1)
    rest_normal = np.cross(rest[b] - rest[a], rest[c] - rest[a])
    posed_normal = np.cross(posed[b] - posed[a], posed[c] - posed[a])
    rest_area, posed_area = np.linalg.norm(rest_normal, axis=1) / 2, np.linalg.norm(posed_normal, axis=1) / 2
    linear = blend_matrices(joints, weights, matrices)[:, :3, :3]
    summed = linear[a] + linear[b] + linear[c]
    expected = np.einsum("tij,tj->ti", summed, rest_normal)
    denominator = np.linalg.norm(expected, axis=1) * np.linalg.norm(posed_normal, axis=1)
    cosine = np.where(denominator > 0, np.einsum("ti,ti->t", expected, posed_normal) / np.where(denominator > 0, denominator, 1), 1.0)
    return {
        "stretch": ratios.max(axis=1),
        "flipped": cosine < 0,
        "degenerate": (rest_area > 1e-14) & (posed_area < rest_area * 1e-3),
        "normal_deviation_deg": np.degrees(np.arccos(np.clip(cosine, -1, 1))),
    }


def weld_ids(positions: np.ndarray) -> np.ndarray:
    keys = np.round(positions * 1e6).astype(np.int64)
    _, first, inverse = np.unique(keys, axis=0, return_index=True, return_inverse=True)
    return first[inverse.ravel()]


def _segment_hits(o: np.ndarray, e: np.ndarray, t0: np.ndarray, t1: np.ndarray, t2: np.ndarray) -> np.ndarray:
    d = e - o
    e1, e2 = t1 - t0, t2 - t0
    h = np.cross(d, e2)
    det = np.einsum("ij,ij->i", e1, h)
    ok = np.abs(det) >= 1e-14
    inv = np.where(ok, 1.0 / np.where(ok, det, 1.0), 0.0)
    s = o - t0
    u = inv * np.einsum("ij,ij->i", s, h)
    q = np.cross(s, e1)
    w = inv * np.einsum("ij,ij->i", d, q)
    t = inv * np.einsum("ij,ij->i", e2, q)
    return ok & (u >= 0) & (u <= 1) & (w >= 0) & (u + w <= 1) & (t > 1e-6) & (t < 1 - 1e-6)


def self_intersections(positions: np.ndarray, index: np.ndarray, welded: np.ndarray, cell: float = 0.01, batch: int = 2_000_000) -> tuple[int, np.ndarray]:
    """Pairs of triangles that intersect (exact), found through a uniform grid like the JS implementation."""
    tri = positions[index]
    lo, hi = np.floor(tri.min(axis=1) / cell).astype(np.int64), np.floor(tri.max(axis=1) / cell).astype(np.int64)
    span = hi - lo + 1
    counts = span.prod(axis=1)
    owner = np.repeat(np.arange(len(index)), counts)
    offset = np.arange(counts.sum()) - np.repeat(np.cumsum(counts) - counts, counts)
    sy, sz = np.repeat(span[:, 1], counts), np.repeat(span[:, 2], counts)
    cx = np.repeat(lo[:, 0], counts) + offset // (sy * sz)
    cy = np.repeat(lo[:, 1], counts) + (offset // sz) % sy
    cz = np.repeat(lo[:, 2], counts) + offset % sz
    key = (cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791)
    order = np.argsort(key, kind="stable")
    key, owner = key[order], owner[order]
    starts = np.flatnonzero(np.r_[True, key[1:] != key[:-1]])
    sizes = np.diff(np.r_[starts, len(key)])
    pairs = []
    for size in np.unique(sizes[sizes > 1]):
        groups = starts[sizes == size]
        i, j = np.triu_indices(size, 1)
        members = owner[groups[:, None] + np.arange(size)]
        pairs.append(np.stack([members[:, i].ravel(), members[:, j].ravel()], axis=1))
    if not pairs:
        return 0, np.zeros(len(index), dtype=bool)
    pairs = np.concatenate(pairs)
    pairs = np.unique(np.sort(pairs, axis=1), axis=0)
    wa, wb = welded[index[pairs[:, 0]]], welded[index[pairs[:, 1]]]
    shared = (wa[:, :, None] == wb[:, None, :]).any(axis=(1, 2))
    pairs = pairs[~shared]
    hit = np.zeros(len(pairs), dtype=bool)
    for start in range(0, len(pairs), batch):
        p = pairs[start:start + batch]
        ta, tb = tri[p[:, 0]], tri[p[:, 1]]
        found = np.zeros(len(p), dtype=bool)
        for k in range(3):
            found |= _segment_hits(ta[:, k], ta[:, (k + 1) % 3], tb[:, 0], tb[:, 1], tb[:, 2])
            found |= _segment_hits(tb[:, k], tb[:, (k + 1) % 3], ta[:, 0], ta[:, 1], ta[:, 2])
        hit[start:start + batch] = found
    triangles = np.zeros(len(index), dtype=bool)
    triangles[pairs[hit].ravel()] = True
    return int(hit.sum()), triangles


def vertex_normals(positions: np.ndarray, index: np.ndarray) -> np.ndarray:
    face = np.cross(positions[index[:, 1]] - positions[index[:, 0]], positions[index[:, 2]] - positions[index[:, 0]])
    normals = np.zeros_like(positions)
    for k in range(3):
        np.add.at(normals, index[:, k], face)
    return normals / np.clip(np.linalg.norm(normals, axis=1, keepdims=True), 1e-30, None)


def body_penetration(body: np.ndarray, body_index: np.ndarray, garment: np.ndarray) -> np.ndarray:
    normals = vertex_normals(body, body_index)
    _, nearest = cKDTree(body).query(garment, workers=-1)
    return np.einsum("ij,ij->i", garment - body[nearest], normals[nearest])


def summarize(deformation: dict[str, np.ndarray], self_pairs: int, rest_self_pairs: int, signed: np.ndarray) -> dict[str, Any]:
    s = deformation["stretch"]
    return {
        "stretch_p95": round(percentile(s, 0.95), 4), "stretch_p99": round(percentile(s, 0.99), 4), "stretch_max": round(float(s.max()), 4),
        "flipped": int(deformation["flipped"].sum()), "degenerate": int(deformation["degenerate"].sum()),
        "self_pairs": self_pairs, "self_pairs_above_rest": max(0, self_pairs - rest_self_pairs),
        "penetrating_beyond_3mm": int((signed < -0.003).sum()), "deepest_m": round(float(min(0.0, signed.min())), 4),
    }
