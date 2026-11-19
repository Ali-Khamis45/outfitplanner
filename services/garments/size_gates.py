"""Sprint 3.6 deformation gates for a size file: stretch, flips and penetration at every supported pose.

    tools/collision/.venv/Scripts/python.exe services/garments/size_gates.py <garment.glb>=<avatar.glb> ... [--out report.json]

generate_sizes.py runs these gates on every size it writes (and refuses to keep a size that fails); evaluate_sizes.py runs
them on every size file on disk.

Pants (Sprint 2.1A / 2.2A rules), at every leg pose of docs/contracts/leg-poses.md:
- vertices more than 3 mm inside the posed body (exact) = 0;
- flipped triangles with a corner inside the body = 0;
- max edge stretch <= 4.0;
- flips <= 3 x the body skin's own flips at walk, wide and l-hip-60. At step and squat the knee and hip creases fold over
  themselves (the Sprint 2.1A known limitation, visual review only): their flips are reported, not gated.

T-shirt (Sprint 1.4A / 2.3A rules): the body's own shoulder gates, derived from its original (v1) shirt exactly as the
neutral gates were (both +90 max stretch <= half the original's; both +120 flips and self-intersections above rest <= the
original's), and 0 vertices more than 3 mm inside the body at every supported pose: arms raised 45 / 90 (left, right,
both), both +120, arms lowered 20 deg standing and walking (/try-on) and the leg poses.

Morph weights follow each garment's corrective sidecar (posing.posed_positions).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import trimesh

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
sys.path.insert(0, str(PROJECT / "tools" / "collision"))

from check import exact_collisions  # noqa: E402  (tools/collision, unmodified)
from deform_metrics import self_intersections, triangle_deformation, weld_ids  # noqa: E402
from evaluate_arm_down import down, walk  # noqa: E402
from evaluate_pants import pose_report  # noqa: E402
from leg_poses import LEG_POSES  # noqa: E402
from posing import SkinnedAsset, load_asset, posed_positions, raise_arm  # noqa: E402

PANTS_STRETCH_MAX = 4.0
FLIP_GATED_LEG_POSES = ("walk", "wide", "l-hip-60")
AVATARS = PROJECT / "outputs" / "avatars"
GARMENTS = PROJECT / "outputs" / "garments"
_PERSONAL_AVATAR = re.compile(r"^(?P<stem>.+)-(?P<base>rest-identity(?:-scale)?)(?:-floor)?(?:-calibrated)?\.glb$")


def shirt_poses() -> dict[str, list[Any]]:
    """Every pose a size shirt must hold (Sprint 3A supported poses, plus both +120 for the shoulder gates)."""
    poses: dict[str, list[Any]] = {}
    for degrees in (45, 90):
        poses[f"raise_l_{degrees}"] = [raise_arm("l", degrees)]
        poses[f"raise_r_{degrees}"] = [raise_arm("r", degrees)]
        poses[f"raise_both_{degrees}"] = [raise_arm("l", degrees), raise_arm("r", degrees)]
    poses["raise_both_120"] = [raise_arm("l", 120), raise_arm("r", 120)]
    poses["down_20"] = down(20)
    poses["walk_20"] = walk(20)
    poses.update({f"leg_{name}": rotations for name, rotations in LEG_POSES.items() if name != "rest"})
    return poses


def original_shirt(avatar: Path) -> tuple[Path, Path]:
    """The original (v1) shirt and the avatar it was fitted to, from which a body's shoulder gates derive. Personal
    avatars (any floor-aligned or calibrated variant) use the v1 fit of their identity (+ scale) body."""
    if avatar.name == "mhr-neutral.glb":
        return GARMENTS / "tshirt-mhr-neutral.glb", avatar
    match = _PERSONAL_AVATAR.match(avatar.name)
    if not match:
        raise ValueError(f"No original shirt is known for avatar {avatar.name}")
    return GARMENTS / f"tshirt-{match['stem']}-{match['base']}.glb", AVATARS / f"{match['stem']}-{match['base']}.glb"


@lru_cache(maxsize=None)
def shoulder_gates(avatar: Path) -> dict[str, Any]:
    from personal_fit import body_gates

    shirt, body = original_shirt(avatar)
    if not shirt.is_file() or not body.is_file():
        raise FileNotFoundError(f"Shoulder gates need the original shirt {shirt.name} and its avatar {body.name}")
    return body_gates(shirt, load_asset(body))


def pants_gates(pants: SkinnedAsset, body: SkinnedAsset) -> dict[str, Any]:
    welded = weld_ids(pants.positions)
    rest_pairs, _ = self_intersections(pants.positions, pants.indices, welded)
    poses: dict[str, Any] = {}
    for name in (n for n in LEG_POSES if n != "rest"):
        r = pose_report(pants, body, name, welded, rest_pairs)
        flips_gated = name in FLIP_GATED_LEG_POSES
        checks = {"penetration": r["beyond_3mm_exact"] == 0, "flipped_in_body": r["flipped_and_penetrating"] == 0, "stretch": r["stretch_max"] <= PANTS_STRETCH_MAX,
                  "flips": r["flipped"] <= r["flip_limit_3x_body"] if flips_gated else None}
        poses[name] = {**r, "checks": checks, "pass": all(v is not False for v in checks.values())}
    return {"poses": poses, "pass": all(p["pass"] for p in poses.values())}


def shirt_gates(shirt: SkinnedAsset, body: SkinnedAsset, avatar: Path) -> dict[str, Any]:
    gates = shoulder_gates(avatar)
    welded = weld_ids(shirt.positions)
    rest_pairs, _ = self_intersections(shirt.positions, shirt.indices, welded)
    poses: dict[str, Any] = {}
    for name, rotations in shirt_poses().items():
        posed, matrices, _ = posed_positions(shirt, rotations)
        body_posed, body_matrices, _ = posed_positions(body, rotations)
        _, depth, _ = exact_collisions(trimesh.Trimesh(body_posed, body.indices, process=False), posed)
        deformation = triangle_deformation(shirt.positions, posed, shirt.indices, shirt.joints, shirt.weights, matrices)
        body_flips = triangle_deformation(body.positions, body_posed, body.indices, body.joints, body.weights, body_matrices)["flipped"]
        pairs, _ = self_intersections(posed, shirt.indices, welded)
        stretch = deformation["stretch"]
        worst = int(np.argmax(stretch))
        poses[name] = {"beyond_3mm_exact": int((depth > 0.003).sum()), "max_depth_mm_exact": round(float(depth.max(initial=0.0)) * 1000, 2),
                       "stretch_max": round(float(stretch.max()), 4), "stretch_p99": round(float(np.sort(stretch)[int(0.99 * (len(stretch) - 1))]), 4),
                       "worst_stretch_rest_centroid": shirt.positions[shirt.indices[worst]].mean(axis=0).round(3).tolist(),
                       "flipped": int(deformation["flipped"].sum()), "self_pairs_above_rest": max(0, pairs - rest_pairs), "body_skin_flipped": int(body_flips.sum())}
    checks = {
        "penetration_all_poses": all(p["beyond_3mm_exact"] == 0 for p in poses.values()),
        "both_90_stretch_max": poses["raise_both_90"]["stretch_max"] <= gates["both_90_stretch_max"],
        "both_120_flipped": poses["raise_both_120"]["flipped"] <= gates["both_120_flipped"],
        "both_120_self_above_rest": poses["raise_both_120"]["self_pairs_above_rest"] <= gates["both_120_self_above_rest"],
    }
    limits = {k: gates[k] for k in ("both_90_stretch_max", "both_120_flipped", "both_120_self_above_rest")}
    return {"poses": poses, "shoulder_gates": {"source": Path(gates["source"]).name, **limits}, "checks": checks, "pass": all(checks.values())}


def evaluate(garment: Path, avatar: Path) -> dict[str, Any]:
    """The gates of one garment against its avatar. `sha256` binds the report to the exact GLB bytes it checked."""
    import hashlib

    asset, body = load_asset(garment), load_asset(avatar)
    result = shirt_gates(asset, body, avatar) if garment.name.startswith("tshirt") else pants_gates(asset, body)
    return {"garment": garment.name, "sha256": hashlib.sha256(garment.read_bytes()).hexdigest(), "avatar": avatar.name, **result}


def failed_checks(report: dict[str, Any]) -> str:
    """The failed checks of a report, e.g. 'l-hip-60:flips; walk:flips' ('' when it passes)."""
    failed = [f"{pose}:{','.join(k for k, v in p['checks'].items() if v is False)}" for pose, p in report["poses"].items() if "checks" in p and not p["pass"]]
    return "; ".join(failed + [k for k, v in report.get("checks", {}).items() if v is False])


def summary_line(report: dict[str, Any]) -> str:
    return f"{report['garment']} {'PASS' if report['pass'] else 'FAIL ' + failed_checks(report)}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("pairs", nargs="+", metavar="GARMENT=AVATAR")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    reports = {}
    for pair in args.pairs:
        garment, avatar = (Path(p) for p in pair.split("=", 1))
        reports[garment.name] = evaluate(garment, avatar)
        print(summary_line(reports[garment.name]), flush=True)
        if args.out:
            args.out.parent.mkdir(parents=True, exist_ok=True)
            args.out.write_text(json.dumps(reports, indent=1), encoding="utf-8")
    return 0 if all(r["pass"] for r in reports.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
