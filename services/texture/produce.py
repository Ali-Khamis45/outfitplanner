"""Sprint 4A: the photo-to-texture producer. A wardrobe item's front photo (and optional back photo) becomes a texture in
UV layout v3 (docs/contracts/garment-texture.md) that the web app displays.

    external/mhr-venv/Scripts/python.exe services/texture/produce.py <item> --template tshirt-v5.3 [--wardrobe outputs/wardrobe]

Inputs (Sprint 4B capture): <wardrobe>/photos/<item>-<view>.jpg and <item>-<view>.align.json for view front / back.
Outputs: <wardrobe>/textures/<item>.png (2048 x 2048 RGBA; alpha 0 where nothing was photographed, which the web fills
with fallback_hex) and <item>.texture.json {version, item, template, views, coverage, fallback_hex, created_at}.

Per view:
1. Placement. The capture outline is the template's flat-lay layout (flatlay.layout) in guide coordinates; the
   alignment's matrix places it in the photo (version 2: guide = layout metres / layout width, photo = pixels / photo
   width, so a uniform scale keeps the aspect; version 1 captures, from before the outline had the garment's aspect, place
   the layout's bounding box in the old guide box and are refined from the silhouette like any other).
2. Silhouette. The garment is told from its plain background by colour: a robust colour model of the photo's border
   (outside the placed outline), then morphology and the largest component (decision of 2026-11-19: no learned matting).
3. Correspondence. The layout's outline is fitted to the silhouette's contour by a similarity transform (iterative closest
   points, both directions); the capture's placement is only its start. A contour spline was measured and is off (see
   fit_warp).
4. Resampling. Every texel of a visible piece (the front or back torso panel and the halves of the sleeves that lie on
   it; the front or back leg panels) is filled from the photo through the spline, where it lands on the garment.
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.interpolate import RBFInterpolator
from scipy.spatial import cKDTree

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from flatlay import FlatLay, flat_lay, layout  # noqa: E402

TEXTURE_SIZE = 2048
MODEL_PX_PER_M = 400  # resolution of the rasterised layout (2.5 mm)
SEAM_DILATION_TEXELS = 4  # colour spread into transparent texels next to filled ones (mipmapping never reads alpha 0)


# --- placement --------------------------------------------------------------------------------------------------------

def layout_frame(pieces: dict[str, dict[str, np.ndarray]]) -> tuple[np.ndarray, float, float]:
    """Origin (top-left of the layout's bounding box), width and height of a layout, in model metres."""
    points = np.concatenate([p["outline"] for p in pieces.values()])
    origin = points.min(axis=0)
    width, height = points.max(axis=0) - origin
    return origin, float(width), float(height)


def guide_outline(pieces: dict[str, dict[str, np.ndarray]]) -> tuple[np.ndarray, float]:
    """The capture outline in guide coordinates (version 2): the layout's outer contour scaled by the layout's width, so
    x runs 0..1 and y 0..height/width. Returns (points, aspect = height / width)."""
    origin, width, height = layout_frame(pieces)
    contour = trace_contour(layout_mask(pieces, origin, width, height))
    points = (contour / MODEL_PX_PER_M) / width
    return points, height / width


def placement(alignment: dict[str, Any], pieces: dict[str, dict[str, np.ndarray]], photo_size: tuple[int, int]) -> np.ndarray:
    """3x3 matrix from layout model metres to photo pixels, from the capture's alignment."""
    origin, width, height = layout_frame(pieces)
    a, b, c, d, e, f = alignment["matrix"]
    photo_w, photo_h = photo_size
    to_guide = np.array([[1 / width, 0, -origin[0] / width], [0, 1 / width, -origin[1] / width], [0, 0, 1]])
    if alignment.get("version", 1) >= 2:  # guide -> photo pixels / photo width
        guide_to_photo = np.array([[a * photo_w, c * photo_w, e * photo_w], [b * photo_w, d * photo_w, f * photo_w], [0, 0, 1]])
        return guide_to_photo @ to_guide
    # version 1: the old outline filled the unit guide box, stretched to the photo's aspect; place the layout's bounding
    # box there (rough: the silhouette fit corrects it)
    to_unit = np.array([[1 / width, 0, -origin[0] / width], [0, 1 / height, -origin[1] / height], [0, 0, 1]])
    guide_to_photo = np.array([[a * photo_w, c * photo_w, e * photo_w], [b * photo_h, d * photo_h, f * photo_h], [0, 0, 1]])
    return guide_to_photo @ to_unit


def apply(matrix: np.ndarray, points: np.ndarray) -> np.ndarray:
    return points @ matrix[:2, :2].T + matrix[:2, 2]


# --- rasters and contours ---------------------------------------------------------------------------------------------

def layout_mask(pieces: dict[str, dict[str, np.ndarray]], origin: np.ndarray, width: float, height: float) -> np.ndarray:
    size = (int(np.ceil(width * MODEL_PX_PER_M)) + 3, int(np.ceil(height * MODEL_PX_PER_M)) + 3)
    image = Image.new("1", size, 0)
    draw = ImageDraw.Draw(image)
    for piece in pieces.values():
        draw.polygon([tuple(p) for p in (piece["outline"] - origin) * MODEL_PX_PER_M + 1], fill=1)
    return np.asarray(image, dtype=bool)


def trace_contour(mask: np.ndarray) -> np.ndarray:
    """The outer boundary of the largest component of a mask, as ordered (x, y) pixel coordinates (Moore tracing)."""
    labels, count = ndimage.label(mask)
    if count == 0:
        raise ValueError("empty mask")
    largest = labels == (1 + int(np.argmax(ndimage.sum(mask, labels, range(1, count + 1)))))
    padded = np.pad(largest, 1)
    ys, xs = np.nonzero(padded)
    start = (int(ys[0]), int(xs[0]))  # top-most, then left-most: its west neighbour is background
    # Moore neighbourhood, clockwise from west
    offsets = [(0, -1), (-1, -1), (-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1)]
    contour, current, backtrack = [start], start, 0
    for _ in range(4 * padded.size):
        for k in range(8):
            direction = (backtrack + k) % 8
            candidate = (current[0] + offsets[direction][0], current[1] + offsets[direction][1])
            if padded[candidate]:
                backtrack = (direction + 5) % 8  # resume clockwise just after the pixel we came from (at direction + 4)
                current = candidate
                break
        else:
            break  # an isolated pixel
        if current == start:
            break
        contour.append(current)
    points = np.array(contour, dtype=np.float64)[:, ::-1] - 1  # (x, y), undo the padding
    return points


def resample_polyline(points: np.ndarray, count: int) -> np.ndarray:
    closed = np.vstack([points, points[:1]])
    lengths = np.r_[0, np.cumsum(np.linalg.norm(np.diff(closed, axis=0), axis=1))]
    targets = np.linspace(0, lengths[-1], count, endpoint=False)
    return np.stack([np.interp(targets, lengths, closed[:, i]) for i in range(2)], axis=1)


# --- silhouette ---------------------------------------------------------------------------------------------------------

def silhouette(photo: np.ndarray, placed_outline: np.ndarray) -> np.ndarray:
    """Garment mask of a photo on a plain background. The background colour is the median of the photo outside the placed
    outline (grown by 15 % of its size); a pixel is garment if its colour is far from it, relative to the background's own
    spread. Then closing, opening, the component overlapping the placed outline, and filled holes."""
    h, w = photo.shape[:2]
    image = Image.new("1", (w, h), 0)
    ImageDraw.Draw(image).polygon([tuple(p) for p in placed_outline], fill=1)
    placed = np.asarray(image, dtype=bool)
    grow = int(0.15 * max(np.ptp(placed_outline[:, 0]), np.ptp(placed_outline[:, 1])))
    near = ndimage.binary_dilation(placed, iterations=max(grow, 1))
    background = photo[~near].reshape(-1, 3).astype(np.float64)
    if len(background) < 1000:  # the outline fills the photo: sample the border instead
        border = np.zeros((h, w), dtype=bool)
        border[:max(h // 20, 2)] = border[-max(h // 20, 2):] = True
        border[:, :max(w // 20, 2)] = border[:, -max(w // 20, 2):] = True
        background = photo[border].reshape(-1, 3).astype(np.float64)
    centre = np.median(background, axis=0)
    spread = np.median(np.linalg.norm(background - centre, axis=1)) + 2.0
    distance = np.linalg.norm(photo.astype(np.float64) - centre, axis=2)
    garment = distance > max(6.0 * spread, 24.0)
    garment = ndimage.binary_closing(garment, iterations=3)
    garment = ndimage.binary_opening(garment, iterations=2)
    labels, count = ndimage.label(garment)
    if count == 0:
        raise ValueError("no garment found: photograph it on a plain surface that contrasts with it")
    overlap = ndimage.sum(placed, labels, range(1, count + 1))
    keep = labels == (1 + int(np.argmax(overlap)))
    return ndimage.binary_fill_holes(keep)


# --- correspondence -----------------------------------------------------------------------------------------------------

def similarity_icp(source: np.ndarray, target: np.ndarray, matrix: np.ndarray, iterations: int = 40) -> np.ndarray:
    """Refine a 3x3 similarity (source -> target pixels) by iterative closest points, both directions."""
    tree = cKDTree(target)
    for _ in range(iterations):
        moved = apply(matrix, source)
        _, forward = tree.query(moved)
        back_tree = cKDTree(moved)
        _, backward = back_tree.query(target)
        src = np.vstack([source, source[backward]])
        dst = np.vstack([target[forward], target])
        mu_s, mu_d = src.mean(axis=0), dst.mean(axis=0)
        s, d = src - mu_s, dst - mu_d
        u, sigma, vt = np.linalg.svd(d.T @ s)
        rotation = u @ np.diag([1, np.sign(np.linalg.det(u @ vt))]) @ vt
        scale = (sigma * [1, np.sign(np.linalg.det(u @ vt))]).sum() / (s ** 2).sum()
        updated = np.eye(3)
        updated[:2, :2] = scale * rotation
        updated[:2, 2] = mu_d - scale * rotation @ mu_s
        if np.abs(updated - matrix).max() < 1e-6:
            return updated
        matrix = updated
    return matrix


@dataclass
class Warp:
    """Model metres -> photo pixels: a similarity followed by a thin-plate spline correction."""
    matrix: np.ndarray
    spline: RBFInterpolator | None

    def __call__(self, points: np.ndarray) -> np.ndarray:
        moved = apply(self.matrix, points)
        return moved if self.spline is None else moved + self.spline(moved)


SPLINE_ROUNDS = 0  # see fit_warp


def fit_warp(model_contour: np.ndarray, photo_contour: np.ndarray, matrix: np.ndarray, rounds: int = SPLINE_ROUNDS) -> Warp:
    """Similarity by ICP, then optionally (`rounds` > 0) a thin-plate spline (on similarity-mapped points) from the model
    contour to the closest photo contour points, refined `rounds` times.

    The spline is off: on the synthetic round trip (synthetic.py), closest-point pairs slide along the outline and bend
    the interior, so one round left 10.6 % (no drape) and 11 % (10 px drape) of texels more than 40 levels from the
    reference within 4.3 mm, against 8.8 % and 3.8 % for the similarity alone. A landmark-based spline is the next step."""
    matrix = similarity_icp(model_contour, photo_contour, matrix)
    model = resample_polyline(model_contour, 400)
    tree = cKDTree(photo_contour)
    warp = Warp(matrix, None)
    scale = np.sqrt(abs(np.linalg.det(matrix[:2, :2])))  # photo pixels per metre
    for _ in range(rounds):
        mapped = warp(model)
        _, nearest = tree.query(mapped)
        base = apply(matrix, model)
        warp = Warp(matrix, RBFInterpolator(base, photo_contour[nearest] - base, kernel="thin_plate_spline", smoothing=1e-4 * scale ** 2))
    return warp


# --- texture ------------------------------------------------------------------------------------------------------------

def piece_texels(model: FlatLay, piece: dict[str, np.ndarray]) -> tuple[np.ndarray, np.ndarray]:
    """Texel indices (row, col) inside a piece's UV outline, and their model coordinates in the layout."""
    image = Image.new("1", (TEXTURE_SIZE, TEXTURE_SIZE), 0)
    ImageDraw.Draw(image).polygon([tuple(p) for p in model.uv[piece["vertices"]] * TEXTURE_SIZE], fill=1)
    rows, cols = np.nonzero(np.asarray(image, dtype=bool))
    uv = np.stack([(cols + 0.5) / TEXTURE_SIZE, (rows + 0.5) / TEXTURE_SIZE], axis=1)
    from flatlay import to_model

    return np.stack([rows, cols], axis=1), to_model(uv) @ piece["rotation"].T + piece["translation"]


def bilinear(photo: np.ndarray, points: np.ndarray) -> np.ndarray:
    return np.stack([ndimage.map_coordinates(photo[..., c].astype(np.float64), [points[:, 1], points[:, 0]], order=1, mode="nearest") for c in range(3)], axis=1)


def view_texture(model: FlatLay, view: str, photo: np.ndarray, alignment: dict[str, Any], texture: np.ndarray) -> dict[str, Any]:
    """Fill `texture` (RGBA, in place) with one view's pieces. Returns the view's report."""
    pieces = layout(model, view)
    h, w = photo.shape[:2]
    origin, width, height = layout_frame(pieces)
    model_contour = trace_contour(layout_mask(pieces, origin, width, height)) / MODEL_PX_PER_M + origin
    start = placement(alignment, pieces, (w, h))
    mask = silhouette(photo, apply(start, model_contour))
    photo_contour = trace_contour(mask)
    warp = fit_warp(model_contour, photo_contour, start)
    report: dict[str, Any] = {"pieces": {}, "photo_px_per_m": round(float(np.sqrt(abs(np.linalg.det(warp.matrix[:2, :2])))), 1)}
    for name, piece in pieces.items():
        texels, points = piece_texels(model, piece)
        mapped = warp(points)
        inside = (mapped[:, 0] >= 0) & (mapped[:, 0] <= w - 1) & (mapped[:, 1] >= 0) & (mapped[:, 1] <= h - 1)
        inside[inside] = mask[np.rint(mapped[inside, 1]).astype(int), np.rint(mapped[inside, 0]).astype(int)]
        colours = bilinear(photo, mapped[inside])
        rows, cols = texels[inside, 0], texels[inside, 1]
        texture[rows, cols, :3] = np.clip(np.rint(colours), 0, 255).astype(np.uint8)
        texture[rows, cols, 3] = 255
        report["pieces"][name] = {"texels": int(len(texels)), "filled": int(inside.sum())}
    report["garment_colour"] = np.median(photo[mask].reshape(-1, 3), axis=0)
    return report


def dilate_seams(texture: np.ndarray, texels: int = SEAM_DILATION_TEXELS) -> None:
    """Spread the colour of filled texels into the transparent texels next to them (alpha stays 0)."""
    filled = texture[..., 3] > 0
    if not filled.any():
        return
    _, (rows, cols) = ndimage.distance_transform_edt(~filled, return_indices=True)
    near = ~filled & (ndimage.distance_transform_edt(~filled) <= texels)
    texture[near, :3] = texture[rows[near], cols[near], :3]


def produce(item: str, template: str, wardrobe: Path, glb: Path | None = None) -> dict[str, Any]:
    model = flat_lay(template, glb)
    photos = wardrobe / "photos"
    texture = np.zeros((TEXTURE_SIZE, TEXTURE_SIZE, 4), dtype=np.uint8)
    reports, colours = {}, []
    for view in ("front", "back"):
        photo_path, align_path = photos / f"{item}-{view}.jpg", photos / f"{item}-{view}.align.json"
        if not photo_path.is_file():
            if view == "front":
                raise FileNotFoundError(f"{photo_path} is required")
            continue
        alignment = json.loads(align_path.read_text(encoding="utf-8"))
        photo = np.asarray(Image.open(photo_path).convert("RGB"))
        reports[view] = view_texture(model, view, photo, alignment, texture)
        colours.append(reports[view].pop("garment_colour"))
    dilate_seams(texture)
    fallback = np.clip(np.rint(np.mean(colours, axis=0)), 0, 255).astype(int)
    islands = sum(len(piece_texels(model, piece)[0]) for view in ("front", "back") for piece in layout(model, view).values())
    filled = int((texture[..., 3] > 0).sum())
    metadata = {"version": 1, "item": item, "template": template, "views": list(reports), "coverage": round(filled / islands, 4),
                "fallback_hex": "#%02x%02x%02x" % tuple(fallback), "created_at": date.today().isoformat()}
    out = wardrobe / "textures"
    out.mkdir(parents=True, exist_ok=True)
    Image.fromarray(texture, "RGBA").save(out / f"{item}.png")
    (out / f"{item}.texture.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    return {**metadata, "views_report": reports}


def link_texture(item: str, wardrobe: Path) -> bool:
    """Point the wardrobe item at its texture: set `texture` to the one value the web's schema accepts
    (outputs/wardrobe/textures/<item>.png) in <wardrobe>/wardrobe.json, written like the web's writeWardrobe (a temporary
    file renamed over it), every other field unchanged. False if there is no wardrobe file or no such item."""
    path = wardrobe / "wardrobe.json"
    if not path.is_file():
        return False
    data = json.loads(path.read_text(encoding="utf-8"))
    entry = next((i for i in data.get("items", []) if i.get("id") == item), None)
    if entry is None:
        return False
    entry["texture"] = f"outputs/wardrobe/textures/{item}.png"
    temporary = path.with_name(f".{item}.texture-link.tmp")
    temporary.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("item")
    parser.add_argument("--template", required=True, choices=["tshirt-v5.3", "pants-v3"])
    parser.add_argument("--wardrobe", type=Path, default=HERE.parents[1] / "outputs" / "wardrobe")
    parser.add_argument("--link", action="store_true", help="also set the item's texture in <wardrobe>/wardrobe.json")
    args = parser.parse_args()
    result = produce(args.item, args.template, args.wardrobe)
    print(json.dumps({k: v for k, v in result.items() if k != "views_report"}, indent=2))
    if args.link:
        print("linked in wardrobe.json" if link_texture(args.item, args.wardrobe) else "not linked: no wardrobe.json or no such item")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
