"""Sprint 4A: write the capture outlines (the flat-lay layouts of the templates, front view) for the web app.

    external/mhr-venv/Scripts/python.exe services/texture/export_outlines.py

Writes apps/web/lib/garment/flatlay-outlines.json: per template, the outline's SVG path in guide units scaled by 100
(x 0..100, y 0..100 * aspect) and its aspect (height / width). The outline is the producer's own model (produce.py:
guide coordinates = layout metres / layout width), so a capture aligned to it places the model directly. Derived from the
neutral base garments only.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from flatlay import TEMPLATES, flat_lay, layout  # noqa: E402
from produce import guide_outline  # noqa: E402

OUT = HERE.parents[1] / "apps" / "web" / "lib" / "garment" / "flatlay-outlines.json"
OUTLINE_VERSION = 1


def simplify(points: np.ndarray, tolerance: float) -> np.ndarray:
    """Douglas-Peucker on a closed polyline."""
    def recurse(segment: np.ndarray) -> list[np.ndarray]:
        start, end = segment[0], segment[-1]
        direction = end - start
        length = np.linalg.norm(direction)
        offsets = segment - start
        distance = np.abs(direction[0] * offsets[:, 1] - direction[1] * offsets[:, 0]) / length if length > 0 else np.linalg.norm(offsets, axis=1)
        index = int(np.argmax(distance))
        if distance[index] <= tolerance or len(segment) < 3:
            return [start]
        return recurse(segment[: index + 1]) + recurse(segment[index:])

    split = int(np.argmax(np.linalg.norm(points - points[0], axis=1)))  # split the loop at its farthest point
    return np.array(recurse(points[: split + 1]) + recurse(np.vstack([points[split:], points[:1]])))


def main() -> int:
    outlines = {}
    for template in TEMPLATES:
        points, aspect = guide_outline(layout(flat_lay(template), "front"))
        reduced = simplify(points * 100, tolerance=0.25)  # 0.25 % of the garment's width
        path = "M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in reduced) + " Z"
        outlines[template] = {"aspect": round(float(aspect), 4), "path": path}
    document = {"version": OUTLINE_VERSION, "units": "guide x 100: x 0..100 across the layout's width, y 0..100 * aspect", "outlines": outlines}
    OUT.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    sizes = ", ".join(f"{name}: {len(outline['path'])} chars" for name, outline in outlines.items())
    print(f"Wrote {OUT} ({sizes})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
