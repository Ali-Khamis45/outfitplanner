"""Sprint 4A: the flat-lay model of a garment template, read from its neutral UV layout v3 GLB.

A garment laid flat and photographed from above shows its pattern panels almost as their UV islands: layout v3 flattens
each panel isometrically at 0.45 UV/m (docs/contracts/garment-texture.md). For every panel this module gives
- the island's outline in UV (the boundary of the panel's outer-layer faces), and
- named landmarks on it (shoulder points, armpits, neck, hem corners; waist, crotch, hems), found from where the panels
  meet: the GLB splits vertices along the seams, so welding by position tells which panels share each boundary point.

Landmarks are in UV (glTF: origin top-left, v down; higher on the body = larger v) and in metres on the garment.
"""
from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
sys.path.insert(0, str(PROJECT / "services" / "garments"))

from garment_glb import read_glb, skinned_primitive  # noqa: E402
from uv_layout import glb_outer_faces  # noqa: E402

DENSITY_UV_PER_M = 0.45
TEMPLATES: dict[str, tuple[str, Path]] = {
    "tshirt-v5.3": ("tshirt", PROJECT / "outputs" / "garments" / "experiments" / "tshirt-v5.3-mhr-neutral.glb"),
    "pants-v3": ("pants", PROJECT / "outputs" / "garments" / "pants-basic-v3-mhr-neutral.glb"),
}
PANELS = {"tshirt": ("front", "back", "sleeve_left", "sleeve_right"), "pants": ("left_front", "left_back", "right_front", "right_back", "gusset")}


@dataclass
class Panel:
    name: str
    index: int
    faces: np.ndarray  # outer-layer faces of the panel (GLB vertex ids)
    outline: np.ndarray  # boundary loop, GLB vertex ids in order
    landmarks: dict[str, int] = field(default_factory=dict)  # name -> GLB vertex id on the outline


@dataclass
class FlatLay:
    template: str
    kind: str
    positions: np.ndarray  # (n, 3) rest positions, metres
    uv: np.ndarray  # (n, 2) TEXCOORD_0
    panels: dict[str, Panel]

    def landmark_uv(self, panel: str, name: str) -> np.ndarray:
        return self.uv[self.panels[panel].landmarks[name]]


def _boundary_loop(faces: np.ndarray) -> np.ndarray:
    """The longest boundary loop (vertex ids in order) of a set of faces: edges used by exactly one face."""
    edges = np.sort(np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]), axis=1)
    unique, counts = np.unique(edges, axis=0, return_counts=True)
    boundary = unique[counts == 1]
    neighbours: dict[int, list[int]] = {}
    for a, b in boundary:
        neighbours.setdefault(int(a), []).append(int(b))
        neighbours.setdefault(int(b), []).append(int(a))
    loops, seen = [], set()
    for start in neighbours:
        if start in seen:
            continue
        loop, previous, current = [start], None, start
        seen.add(start)
        while True:
            options = [n for n in neighbours[current] if n != previous and (n not in seen or (n == start and len(loop) > 2))]
            if not options or options[0] == start:
                break
            previous, current = current, options[0]
            loop.append(current)
            seen.add(current)
        loops.append(loop)
    return np.asarray(max(loops, key=len))


def _shared_panels(positions: np.ndarray, panel_of_vertex: np.ndarray, vertices: np.ndarray) -> list[frozenset[int]]:
    """For each vertex, the set of panels whose outer-layer vertices sit at the same position (welded by 0.01 mm)."""
    keys = np.round(positions / 1e-5).astype(np.int64)
    owners: dict[tuple[int, int, int], set[int]] = {}
    for v, panel in zip(vertices, panel_of_vertex[vertices]):
        owners.setdefault(tuple(keys[v]), set()).add(int(panel))
    return [frozenset(owners[tuple(keys[v])]) for v in vertices]


def _pick(candidates: list[int], score: np.ndarray) -> int:
    if not candidates:
        raise ValueError("landmark not found")
    return int(candidates[int(np.argmin(score))])


def _tshirt_landmarks(name: str, loop: np.ndarray, shared: list[frozenset[int]], P: np.ndarray) -> dict[str, int]:
    """front / back: per side, the armpit and shoulder point (the lowest and highest points of the armhole, the run shared
    with that side's sleeve; the side seam may stop a few millimetres below the armhole, so they are not taken as triple
    points), the neck side and hem corner (the ends of the shoulder and side seams), and the neck and hem centres (on the
    raw edges, at x = 0)."""
    other = 1 if name == "front" else 0
    marks: dict[str, int] = {}
    for side, sleeve, sign in (("left", 2, 1.0), ("right", 3, -1.0)):
        armhole = [int(v) for v, s in zip(loop, shared) if sleeve in s]
        marks[f"armpit_{side}"] = _pick(armhole, P[armhole, 1])
        marks[f"shoulder_{side}"] = _pick(armhole, -P[armhole, 1])
        seam = [int(v) for v, s in zip(loop, shared) if other in s and sleeve not in s and sign * P[v, 0] > 0]
        upper = [v for v in seam if P[v, 1] > P[marks[f"armpit_{side}"], 1]]
        lower = [v for v in seam if P[v, 1] < P[marks[f"armpit_{side}"], 1]]
        marks[f"neck_{side}"] = _pick(upper, np.abs(P[upper, 0]))
        marks[f"hem_{side}"] = _pick(lower, P[lower, 1])
    armpit_y = min(P[marks["armpit_left"], 1], P[marks["armpit_right"], 1])
    raw = [int(v) for v, s in zip(loop, shared) if len(s) == 1]
    neck = [v for v in raw if P[v, 1] > armpit_y]
    hem = [v for v in raw if P[v, 1] < armpit_y]
    marks["neck_centre"] = _pick(neck, np.abs(P[neck, 0]))
    marks["hem_centre"] = _pick(hem, np.abs(P[hem, 0]))
    return marks


def _tshirt_sleeve_landmarks(name: str, loop: np.ndarray, shared: list[frozenset[int]], P: np.ndarray, copies: list[int]) -> dict[str, int]:
    """sleeve: the armpit and shoulder point (the lowest and highest points of its armhole, the run shared with the
    torso panels), and the cuff's top and underarm points: the raw-edge (cuff) vertices nearest the shoulder point and
    the armpit."""
    armhole = [int(v) for v, s in zip(loop, shared) if 0 in s or 1 in s]
    marks = {"armpit": _pick(armhole, P[armhole, 1]), "shoulder": _pick(armhole, -P[armhole, 1])}
    # the cuff: hem vertices with no second copy in the outer layer (the underarm seam is cut within the sleeve, so its
    # two sides are copies of each other), away from the armhole (a short raw gap also sits at the armpit)
    hem = [int(v) for v, s, n in zip(loop, shared, copies) if len(s) == 1 and n == 1]
    reach = np.linalg.norm(P[hem][:, None] - P[armhole][None], axis=2).min(axis=1)  # distance to the nearest armhole point
    cuff = [v for v, r in zip(hem, reach) if r > 0.5 * reach.max()]
    marks["cuff_top"] = _pick(cuff, np.linalg.norm(P[cuff] - P[marks["shoulder"]], axis=1))
    marks["cuff_under"] = _pick(cuff, np.linalg.norm(P[cuff] - P[marks["armpit"]], axis=1))
    return marks


def _pants_landmarks(name: str, loop: np.ndarray, shared: list[frozenset[int]], P: np.ndarray) -> dict[str, int]:
    """front / back leg panels: the waist centre and crotch (ends of the centre seam with the other side's matching panel),
    the waist side and outer hem (ends of the outseam), and the inseam top and inner hem (ends of the inseam). The outseam
    and inseam are both shared with this side's other panel; the outseam is the chain that reaches the waist."""
    index = PANELS["pants"].index(name)
    same_side_other = {0: 1, 1: 0, 2: 3, 3: 2}[index]
    centre_partner = {0: 2, 2: 0, 1: 3, 3: 1}[index]
    centre = [int(v) for v, s in zip(loop, shared) if centre_partner in s]
    marks = {"waist_centre": _pick(centre, -P[centre, 1]), "crotch": _pick(centre, P[centre, 1])}
    # the loop positions shared with this side's other panel, split into runs of consecutive positions (cyclic)
    index_on_seam = np.flatnonzero([same_side_other in s for s in shared])
    runs = np.split(index_on_seam, np.flatnonzero(np.diff(index_on_seam) != 1) + 1)
    if len(runs) > 1 and runs[0][0] == 0 and runs[-1][-1] == len(loop) - 1:
        runs = [np.concatenate([runs[-1], runs[0]])] + runs[1:-1]
    chains_v = sorted(([int(loop[i]) for i in run] for run in runs), key=len, reverse=True)[:2]
    if len(chains_v) < 2:
        raise ValueError(f"{name}: outseam and inseam not found")
    outseam = max(chains_v, key=lambda c: P[c, 1].max())
    inseam = min(chains_v, key=lambda c: P[c, 1].max())
    marks["waist_side"], marks["hem_outer"] = _pick(outseam, -P[outseam, 1]), _pick(outseam, P[outseam, 1])
    marks["inseam_top"], marks["hem_inner"] = _pick(inseam, -P[inseam, 1]), _pick(inseam, P[inseam, 1])
    return marks


def to_model(uv: np.ndarray) -> np.ndarray:
    """UV -> flat-lay model coordinates in metres, as a photo of the garment from outside shows them: x along +u (the
    viewer's right), y down the photo along -v (higher on the body = larger v). The photo is then a similarity
    transform of the model (no reflection)."""
    return np.stack([uv[..., 0], -uv[..., 1]], axis=-1) / DENSITY_UV_PER_M


SLEEVE_DROP_DEG = 30.0  # a flat-laid T-shirt's sleeve fold (shoulder point to cuff) runs this far below horizontal


def _turn(direction: np.ndarray, target: np.ndarray, pivot: np.ndarray, to: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Rotation R and translation t (2D, no scale or reflection) turning `direction` onto `target` and moving `pivot` to
    `to`: x -> R x + t."""
    angle = np.arctan2(target[1], target[0]) - np.arctan2(direction[1], direction[0])
    R = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
    return R, to - R @ pivot


def _half_sleeve(model: FlatLay, sleeve: str, torso: int) -> tuple[np.ndarray, int]:
    """The half of a sleeve island that lies against the given torso panel (0 front, 1 back) when the garment is laid
    flat: walk the island outline from the shoulder point into the armhole run shared with that panel, on through the
    armpit and the underarm seam edge, along the cuff to the cuff's top point; the fold from there back to the shoulder
    point closes it. Returns the outline as GLB vertex ids, and this half's armpit: the lowest point of its armhole run
    (the island has two copies of the armpit, one on each edge of the underarm cut)."""
    panel = model.panels[sleeve]
    loop, marks = list(map(int, panel.outline)), panel.landmarks
    keys = np.round(model.positions / 1e-5).astype(np.int64)
    torso_keys = {tuple(k) for k in keys[np.unique(model.panels[PANELS["tshirt"][torso]].outline)]}
    start = loop.index(marks["shoulder"])
    n = len(loop)
    for step in (1, -1):  # the direction whose next vertex is on this torso panel's armhole
        if tuple(keys[loop[(start + step) % n]]) in torso_keys:
            break
    path, i = [loop[start]], start
    for _ in range(n):
        i = (i + step) % n
        path.append(loop[i])
        if loop[i] == marks["cuff_top"]:
            armhole = [v for v in path if tuple(keys[v]) in torso_keys]
            return np.asarray(path), int(armhole[int(np.argmin(model.positions[armhole, 1]))])
    raise ValueError(f"{sleeve}: the cuff's top point was not reached from the shoulder")


def layout(model: FlatLay, view: str) -> dict[str, dict[str, np.ndarray]]:
    """The garment laid flat in its natural pose, seen from the front ("front") or the back ("back"), in model metres
    (see to_model; y runs down). For each visible piece: its outline (model coordinates), the GLB vertex ids of that
    outline, and the 2x2 rotation and translation placing the island's model coordinates into the layout.
    - T-shirt: the torso panel of that view, and each sleeve's half that lies against it, hanging from the torso's
      shoulder point with its fold (shoulder point to cuff top) SLEEVE_DROP_DEG below horizontal, pointing outwards.
    - Pants: the left and right panels of that view, each turned so its centre seam (waist centre to crotch) runs
      straight down, meeting along it.
    A photo differs from this pose by a similarity transform plus the garment's own drape, which the producer's
    thin-plate spline absorbs."""
    pieces: dict[str, dict[str, np.ndarray]] = {}
    identity = (np.eye(2), np.zeros(2))
    if model.kind == "tshirt":
        torso_name = "front" if view == "front" else "back"
        torso = model.panels[torso_name]
        pieces[torso_name] = {"vertices": torso.outline, "rotation": identity[0], "translation": identity[1]}
        for side in ("left", "right"):
            sleeve = f"sleeve_{side}"
            ids, _ = _half_sleeve(model, sleeve, 0 if view == "front" else 1)
            marks = model.panels[sleeve].landmarks
            shoulder, cuff = to_model(model.uv[[marks["shoulder"], marks["cuff_top"]]])
            # the garment's left is the viewer's right on both views (each photo shows the outside)
            outwards = (1.0 if (side == "left") == (view == "front") else -1.0) * np.cos(np.radians(SLEEVE_DROP_DEG))
            R, t = _turn(cuff - shoulder, np.array([outwards, np.sin(np.radians(SLEEVE_DROP_DEG))]), shoulder, to_model(model.uv[torso.landmarks[f"shoulder_{side}"]]))
            pieces[sleeve] = {"vertices": ids, "rotation": R, "translation": t}
    else:
        for name in (("left_front", "right_front") if view == "front" else ("left_back", "right_back")):
            panel = model.panels[name]
            m = {k: to_model(model.uv[v]) for k, v in panel.landmarks.items()}
            # the centre seam (waist centre to crotch) runs straight down, so the two halves meet along it without
            # overlapping (turning the leg axes upright instead crossed the inner legs over each other)
            R, t = _turn(m["crotch"] - m["waist_centre"], np.array([0.0, 1.0]), m["waist_centre"], np.zeros(2))
            pieces[name] = {"vertices": panel.outline, "rotation": R, "translation": t}
    for piece in pieces.values():
        piece["outline"] = to_model(model.uv[piece["vertices"]]) @ piece["rotation"].T + piece["translation"]
    return pieces


def flat_lay(template: str, glb: Path | None = None) -> FlatLay:
    kind, default = TEMPLATES[template]
    document, blob = read_glb(glb or default)
    data = skinned_primitive(document, blob)
    P, uv = data["POSITION"].astype(np.float64), data["TEXCOORD_0"].astype(np.float64)
    panel_of_vertex = np.rint(data["_PANEL"]).astype(int)
    outer = glb_outer_faces(data["indices"], uv)
    outer_vertices = np.unique(outer)
    # which panels meet at each outer-layer vertex (every outer vertex takes part in the welding, not one panel's)
    shared_by_vertex = dict(zip(map(int, outer_vertices), _shared_panels(P, panel_of_vertex, outer_vertices)))
    keys = np.round(P[outer_vertices] / 1e-5).astype(np.int64)
    _, inverse, counts = np.unique(keys, axis=0, return_inverse=True, return_counts=True)
    copies_by_vertex = dict(zip(map(int, outer_vertices), counts[inverse.ravel()].tolist()))  # outer copies at that position
    panels: dict[str, Panel] = {}
    for index, name in enumerate(PANELS[kind]):
        faces = outer[panel_of_vertex[outer[:, 0]] == index]
        loop = _boundary_loop(faces)
        shared = [shared_by_vertex[int(v)] for v in loop]
        panel = Panel(name, index, faces, loop)
        if kind == "tshirt":
            panel.landmarks = _tshirt_landmarks(name, loop, shared, P) if index < 2 else _tshirt_sleeve_landmarks(name, loop, shared, P, [copies_by_vertex[int(v)] for v in loop])
        elif name != "gusset":
            panel.landmarks = _pants_landmarks(name, loop, shared, P)
        panels[name] = panel
    return FlatLay(template, kind, P, uv, panels)
