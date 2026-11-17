"""Sprint 3A gates for every size: penetration > 3 mm = 0 at rest and at every supported pose.

Run with the collision tool's environment, from the repository root:

    tools/collision/.venv/Scripts/python.exe services/garments/evaluate_sizes.py [--dir outputs/garments/sizes]

Supported poses: arms raised up to 90 deg (left, right, both at 45 and 90), arms lowered 20 deg standing and with the
walk swing (/try-on), and the leg poses of docs/contracts/leg-poses.md. Shirts are checked at all of them, pants at
rest and the leg poses. Exact check: tools/collision exact_collisions on the size's own body; morph weights follow
the size's sidecar.

Layering (rest): every shirt size over the body's pants v2 and over every pants size of the same body must not
interpenetrate (evaluate_pants.shirt_layering: no containment either way, no shirt/pants triangle intersections, every
shirt vertex of the overlap band within 3 cm of the pants on the outer side of the nearest pants outer-surface triangle)
and the hem must overlap the waistband by >= 3 cm.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import trimesh

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
sys.path.insert(0, str(PROJECT / "tools" / "collision"))

from check import exact_collisions  # noqa: E402
from evaluate_arm_down import down, walk  # noqa: E402
from leg_poses import LEG_POSES  # noqa: E402
from posing import load_asset, posed_positions, raise_arm  # noqa: E402

SIZES_DIR = PROJECT / "outputs" / "garments" / "sizes"
MANIFEST = PROJECT / "outputs" / "garments" / "personal" / "manifest.json"


def arm_poses() -> dict[str, list[Any]]:
    poses: dict[str, list[Any]] = {}
    for degrees in (45, 90):
        poses[f"raise_l_{degrees}"] = [raise_arm("l", degrees)]
        poses[f"raise_r_{degrees}"] = [raise_arm("r", degrees)]
        poses[f"raise_both_{degrees}"] = [raise_arm("l", degrees), raise_arm("r", degrees)]
    poses["down_20"] = down(20)
    poses["walk_20"] = walk(20)
    return poses


MEASUREMENTS = PROJECT / "outputs" / "avatars" / "measurements.json"


def calibrated_avatar(body_id: str) -> Path | None:
    """The calibrated avatar generate_sizes.py wrote for a personal body (measurements.json present), else None. The
    sizes of that body are then bound to it, not to the manifest's avatar."""
    if body_id == "neutral" or not MEASUREMENTS.is_file():
        return None
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    entries = [manifest["primary"], *manifest["secondary"]]
    if any(Path(e["body"]).stem.endswith("-calibrated") for e in entries) or body_id != manifest["primary"]["id"]:
        return None  # the manifest already names the calibrated body: it is authoritative
    body = PROJECT / manifest["primary"]["body"]
    path = body.with_name(body.stem + "-calibrated.glb")
    return path if path.is_file() else None


def avatar_for(body_id: str) -> Path:
    if body_id == "neutral":
        return PROJECT / "outputs" / "avatars" / "mhr-neutral.glb"
    calibrated = calibrated_avatar(body_id)
    if calibrated is not None:
        return calibrated
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    return PROJECT / next(e for e in [manifest["primary"], *manifest["secondary"]] if e["id"] == body_id)["body"]


def evaluate(glb: Path, body_id: str) -> dict[str, Any]:
    garment, body = load_asset(glb), load_asset(avatar_for(body_id))
    poses = {"rest": []}
    if glb.name.startswith("tshirt"):
        poses.update(arm_poses())
    poses.update({f"leg_{name}": rotations for name, rotations in LEG_POSES.items() if name != "rest"})
    results = {}
    for name, rotations in poses.items():
        posed, _, _ = posed_positions(garment, rotations)
        body_posed, _, _ = posed_positions(body, rotations)
        inside, depth, _ = exact_collisions(trimesh.Trimesh(body_posed, body.indices, process=False), posed)
        results[name] = {"beyond_3mm": int((depth > 0.003).sum()), "max_depth_mm": round(float(depth.max(initial=0.0)) * 1000, 2), "inside": int(inside.sum())}
    worst = max(results.values(), key=lambda r: r["max_depth_mm"])
    return {"poses": results, "beyond_3mm_total": int(sum(r["beyond_3mm"] for r in results.values())), "worst_max_depth_mm": worst["max_depth_mm"], "pass": all(r["beyond_3mm"] == 0 for r in results.values())}


def base_pants(body_id: str) -> Path | None:
    """The body's pants v2; None for a calibrated body (its manifest pants were fitted to the uncalibrated body)."""
    if calibrated_avatar(body_id) is not None:
        return None
    if body_id != "neutral":
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        bottom = PROJECT / next(e for e in [manifest["primary"], *manifest["secondary"]] if e["id"] == body_id)["bottom"]["glb"]
        if bottom.parent.resolve() == SIZES_DIR.resolve():
            return None  # the manifest's bottom is one of the body's own size files, already in the size list
    if body_id == "neutral":
        return PROJECT / "outputs" / "garments" / "pants-basic-v2-mhr-neutral.glb"
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    return PROJECT / next(e for e in [manifest["primary"], *manifest["secondary"]] if e["id"] == body_id)["bottom"]["glb"]


def layering(directory: Path) -> dict[str, Any]:
    from evaluate_pants import MIN_OVERLAP_M, shirt_layering

    results: dict[str, Any] = {}
    for shirt_path in sorted(directory.glob("tshirt-*.glb")):
        body_id = shirt_path.name[: -len(".glb")].split("-", 3)[3]
        body, shirt = load_asset(avatar_for(body_id)), load_asset(shirt_path)
        for pants_path in [*([base_pants(body_id)] if base_pants(body_id) else []), *sorted(directory.glob(f"pants-v*-*-{body_id}.glb"))]:
            r = shirt_layering(load_asset(pants_path), shirt, body)
            ok = (r["pants_vertices_inside_shirt_shell"] == 0 and r["shirt_vertices_inside_pants_shell"] == 0 and r["shirt_pants_triangles_intersecting"] == 0
                  and r["shirt_vertices_under_pants"] == 0 and r["overlap_m"] >= MIN_OVERLAP_M)
            results[f"{shirt_path.name} over {pants_path.name}"] = {**r, "pass": ok}
            print("layering", shirt_path.name, "over", pants_path.name, "PASS" if ok else "FAIL", r["overlap_m"], r["pants_vertices_inside_shirt_shell"], r["shirt_pants_triangles_intersecting"], r["shirt_vertices_under_pants"], r["min_shirt_to_pants_signed_mm"], flush=True)
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dir", type=Path, default=SIZES_DIR)
    parser.add_argument("--skip-layering", action="store_true")
    parser.add_argument("--skip-poses", action="store_true", help="layering only")
    parser.add_argument("--out", type=Path, default=PROJECT / "outputs" / "garment-tests" / "sizes-gates-sprint-3a.json")
    args = parser.parse_args()
    report = {}
    for glb in [] if args.skip_poses else sorted(args.dir.glob("*.glb")):
        body_id = glb.name[: -len(".glb")].split("-", 3)[3]  # <garment>-<version>-<size>-<bodyId>
        report[glb.name] = evaluate(glb, body_id)
        print(glb.name, "PASS" if report[glb.name]["pass"] else "FAIL", report[glb.name]["beyond_3mm_total"], report[glb.name]["worst_max_depth_mm"], flush=True)
    layered = layering(args.dir) if not args.skip_layering else {}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({"penetration": report, "layering": layered}, indent=2), encoding="utf-8")
    print(f"Wrote {args.out}")
    return 0 if all(r["pass"] for r in report.values()) and all(r["pass"] for r in layered.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
