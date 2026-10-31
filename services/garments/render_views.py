"""Offline orthographic front/side/back renders of body + garment meshes (CPU z-buffer, no GPU or browser).

These are evidence images for mesh-level checks, not browser/WebGL rendering verification.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

VIEWS = {"front": (np.array([1.0, 0, 0]), np.array([0, 0, 1.0])), "side (left)": (np.array([0, 0, -1.0]), np.array([1.0, 0, 0])), "back": (np.array([-1.0, 0, 0]), np.array([0, 0, -1.0]))}


def rasterize(meshes: list[tuple[np.ndarray, np.ndarray, tuple[int, int, int]]], right: np.ndarray, toward: np.ndarray, centre: np.ndarray, scale: float, size: int) -> np.ndarray:
    """Per-pixel depth test over all triangles of all meshes; Lambert shading from the view direction."""
    up = np.array([0.0, 1.0, 0.0])
    image = np.full((size, size, 3), 255, dtype=np.uint8)
    depth = np.full((size, size), -np.inf)
    for vertices, faces, colour in meshes:
        local = vertices - centre
        px = np.stack([size / 2 + (local @ right) * scale, size / 2 - (local @ up) * scale], axis=1)
        z = local @ toward
        tri = faces
        normals = np.cross(vertices[tri[:, 1]] - vertices[tri[:, 0]], vertices[tri[:, 2]] - vertices[tri[:, 0]])
        normals /= np.linalg.norm(normals, axis=1, keepdims=True) + 1e-12
        shade = np.clip(np.abs(normals @ toward) * 0.75 + 0.25, 0, 1)
        p = px[tri]
        lo = np.floor(p.min(axis=1)).astype(int).clip(0, size - 1)
        hi = np.ceil(p.max(axis=1)).astype(int).clip(0, size - 1)
        for t in range(len(tri)):
            x0, y0 = lo[t]
            x1, y1 = hi[t]
            if x1 < x0 or y1 < y0:
                continue
            xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            (ax, ay), (bx, by), (cx, cy) = p[t]
            denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            if abs(denominator) < 1e-12:
                continue
            w0 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / denominator
            w1 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / denominator
            w2 = 1 - w0 - w1
            inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
            if not inside.any():
                continue
            zt = w0 * z[tri[t, 0]] + w1 * z[tri[t, 1]] + w2 * z[tri[t, 2]]
            rows, cols = np.nonzero(inside)
            rows_img, cols_img = rows + y0, cols + x0
            closer = zt[rows, cols] > depth[rows_img, cols_img]
            depth[rows_img[closer], cols_img[closer]] = zt[rows, cols][closer]
            image[rows_img[closer], cols_img[closer]] = (np.array(colour) * shade[t]).astype(np.uint8)
    return image


def render_views(meshes: list[tuple[np.ndarray, np.ndarray, tuple[int, int, int]]], path: Path, title: str, size: int = 420) -> None:
    every = np.concatenate([vertices for vertices, _, _ in meshes])
    centre = (every.min(axis=0) + every.max(axis=0)) / 2
    scale = (size - 30) / float(np.ptp(every, axis=0)[:2].max())
    canvas = Image.new("RGB", (size * len(VIEWS), size + 24), "white")
    draw = ImageDraw.Draw(canvas)
    for column, (name, (right, toward)) in enumerate(VIEWS.items()):
        canvas.paste(Image.fromarray(rasterize(meshes, right, toward, centre, scale, size)), (column * size, 24))
        draw.text((column * size + 8, 6), f"{title} — {name}", fill=(20, 20, 20))
    canvas.save(path)
