"""Sprint 4A: synthetic flat-lay photos with a known texture, for the producer's round-trip test (no personal photos).

A reference texture is painted on the islands of a template's visible pieces (a 3 cm checker in a colour per piece, and a
logo square on the T-shirt's front chest). The pieces are laid out as flatlay.layout lays them, moved by a known
similarity transform plus a gentle smooth drape, and splatted into a photo on a plain, slightly noisy background. The
capture alignment (version 2) is the similarity without its rotation, with a scale error, as a user would roughly place
the outline.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image
from scipy import ndimage

from flatlay import FlatLay, layout
from produce import TEXTURE_SIZE, layout_frame, piece_texels

PIECE_COLOURS = [((182, 52, 41), (238, 219, 196)), ((38, 84, 140), (214, 226, 238)), ((46, 120, 74), (220, 236, 222)), ((132, 74, 150), (232, 220, 238))]
BACKGROUND = np.array([206, 201, 191])
CHECK_M = 0.03


def reference_texture(model: FlatLay, views: tuple[str, ...] = ("front", "back")) -> np.ndarray:
    """RGBA reference: every visible piece's texels painted (alpha 255), the rest transparent."""
    texture = np.zeros((TEXTURE_SIZE, TEXTURE_SIZE, 4), dtype=np.uint8)
    for view in views:
        for index, (name, piece) in enumerate(layout(model, view).items()):
            texels, points = piece_texels(model, piece)
            dark, light = PIECE_COLOURS[(index + (2 if view == "back" else 0)) % len(PIECE_COLOURS)]
            check = (np.floor(points[:, 0] / CHECK_M) + np.floor(points[:, 1] / CHECK_M)) % 2 == 0
            colours = np.where(check[:, None], dark, light)
            if name == "front":  # a logo square on the chest: 8 cm, centred between the armpits, 10 cm below them
                marks = model.panels["front"].landmarks
                from flatlay import to_model

                chest = (to_model(model.uv[marks["armpit_left"]]) + to_model(model.uv[marks["armpit_right"]])) / 2 + [0, 0.10]
                logo = (np.abs(points - chest) < 0.04).all(axis=1)
                colours[logo] = (250, 196, 30)
            texture[texels[:, 0], texels[:, 1], :3] = colours
            texture[texels[:, 0], texels[:, 1], 3] = 255
    return texture


def render_photo(model: FlatLay, view: str, reference: np.ndarray, size: tuple[int, int] = (1600, 1200), px_per_m: float = 1400.0,
                 rotation_deg: float = 4.0, drape_px: float = 10.0, seed: int = 7) -> tuple[np.ndarray, np.ndarray]:
    """A synthetic flat-lay photo of one view (H x W x 3 uint8) and the true similarity (3x3, model metres -> pixels)."""
    width_px, height_px = size
    pieces = layout(model, view)
    origin, width, height = layout_frame(pieces)
    centre = origin + [width / 2, height / 2]
    angle = np.radians(rotation_deg)
    R = px_per_m * np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
    S = np.eye(3)
    S[:2, :2] = R
    S[:2, 2] = np.array([width_px / 2, height_px / 2]) - R @ centre
    rng = np.random.default_rng(seed)
    photo = np.clip(BACKGROUND + rng.normal(0, 3, (height_px, width_px, 3)), 0, 255)
    painted = np.zeros((height_px, width_px), dtype=bool)
    for piece in pieces.values():
        texels, points = piece_texels(model, piece)
        px = points @ S[:2, :2].T + S[:2, 2]
        px = px + drape_px * np.stack([np.sin(px[:, 1] / height_px * np.pi), np.sin(px[:, 0] / width_px * 2 * np.pi)], axis=1)
        cols, rows = np.rint(px[:, 0]).astype(int), np.rint(px[:, 1]).astype(int)
        ok = (cols >= 0) & (cols < width_px) & (rows >= 0) & (rows < height_px)
        photo[rows[ok], cols[ok]] = reference[texels[ok, 0], texels[ok, 1], :3]
        painted[rows[ok], cols[ok]] = True
    # close the splatting gaps inside the garment with the nearest painted colour
    inside = ndimage.binary_fill_holes(ndimage.binary_closing(painted, iterations=2))
    gaps = inside & ~painted
    _, (r, c) = ndimage.distance_transform_edt(~painted, return_indices=True)
    photo[gaps] = photo[r[gaps], c[gaps]]
    return photo.astype(np.uint8), S


def alignment_for(model: FlatLay, view: str, S: np.ndarray, photo_width: int, scale_error: float = 1.04) -> dict[str, Any]:
    """The version 2 alignment a user would leave: the true placement without its rotation, with a scale error."""
    pieces = layout(model, view)
    origin, width, _ = layout_frame(pieces)
    scale = np.sqrt(abs(np.linalg.det(S[:2, :2]))) * scale_error
    centre = origin + np.ptp(np.concatenate([p["outline"] for p in pieces.values()]), axis=0) / 2
    true_centre = S[:2, :2] @ centre + S[:2, 2]
    s = scale * width / photo_width  # guide units (layout width) -> photo-width units
    e, f = true_centre / photo_width - s * np.array([0.5, (centre[1] - origin[1]) / width])
    return {"version": 2, "item": "synthetic", "view": view, "matrix": [s, 0, 0, s, float(e), float(f)],
            "convention": "guide (layout metres / layout width) to photo pixels / photo width; x'=a*x+c*y+e, y'=b*x+d*y+f"}


def write_capture(wardrobe: Path, item: str, view: str, photo: np.ndarray, alignment: dict[str, Any]) -> None:
    photos = wardrobe / "photos"
    photos.mkdir(parents=True, exist_ok=True)
    Image.fromarray(photo).save(photos / f"{item}-{view}.jpg", quality=92)
    alignment = {**alignment, "item": item, "photo_size": [int(photo.shape[1]), int(photo.shape[0])]}
    (photos / f"{item}-{view}.align.json").write_text(json.dumps(alignment, indent=2) + "\n", encoding="utf-8")
