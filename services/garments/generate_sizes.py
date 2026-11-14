"""Generate graded sizes and fit maps (Sprint 3A, docs/contracts/fit-map.md).

    python generate_sizes.py [--bodies neutral personal-scaled] [--garments tshirt pants] [--sizes S M L XL]

For each body, garment and size: design the size on the body (girths solved to the size spec), clean degenerate
triangles (personal bodies), re-solve the corrective morphs for this size, and write
outputs/garments/sizes/<garment>-<size>-<bodyId>.glb (+ _EASE_MM), .correctives.json and .fit.json. Personal bodies
come from outputs/garments/personal/manifest.json. If outputs/avatars/measurements.json exists, the personal body is
calibrated to it first (calibrate.py); otherwise calibration is skipped and reported. Nothing is overwritten.
"""
from __future__ import annotations

import argparse
import ctypes
import faulthandler
import json
import sys
import time
from dataclasses import replace
from pathlib import Path
from typing import Any

import numpy as np

import correctives
from body import PROJECT, VIEWER, RestBody, evaluate_rest_body, load_model
from garment_glb import write_garment_glb
from generate_tshirt import AVATAR_DIR, MATERIAL as SHIRT_MATERIAL, NEUTRAL_AVATAR, metadata as shirt_metadata, new_file, verify_glb_matches_body
from measure import girth
from posing import load_asset

SIZES_DIR = PROJECT / "outputs" / "garments" / "sizes"
MANIFEST = PROJECT / "outputs" / "garments" / "personal" / "manifest.json"
MEASUREMENTS = AVATAR_DIR / "measurements.json"
RECONSTRUCTION = PROJECT / "outputs" / "sam3d-person-front-sprint03-run2" / "reconstruction.npz"
GARMENT_TAGS = {"tshirt": "tshirt-v5.2", "pants": "pants-v2"}
CRASH_LOG = PROJECT / "outputs" / "garment-tests" / "sizes-crash.log"  # faulthandler + per-stage peak memory


class _MemoryCounters(ctypes.Structure):
    _fields_ = [("cb", ctypes.c_uint32), ("PageFaultCount", ctypes.c_uint32), ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t), ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                ("QuotaNonPagedPoolUsage", ctypes.c_size_t), ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t)]


def memory_mb() -> dict[str, float]:
    """Current and peak working set of this process in MB (Windows; {} elsewhere)."""
    if sys.platform != "win32":
        return {}
    counters = _MemoryCounters()
    counters.cb = ctypes.sizeof(counters)
    query = ctypes.windll.kernel32.K32GetProcessMemoryInfo
    query.argtypes = [ctypes.c_void_p, ctypes.POINTER(_MemoryCounters), ctypes.c_uint32]
    query.restype = ctypes.c_int
    if not query(ctypes.c_void_p(-1), ctypes.byref(counters), counters.cb):  # -1 = the current process pseudo-handle
        return {}
    return {"working_set_mb": round(counters.WorkingSetSize / 2**20), "peak_working_set_mb": round(counters.PeakWorkingSetSize / 2**20), "peak_pagefile_mb": round(counters.PeakPagefileUsage / 2**20)}


def stage_log(handle: Any, stage: str) -> dict[str, float]:
    """Append a timestamped stage line with memory counters to the crash log and stdout (flushed: a kill leaves a trace)."""
    memory = memory_mb()
    line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} {stage} {json.dumps(memory)}"
    print(line, flush=True)
    handle.write(line + "\n")
    handle.flush()
    return memory
# Corrective collision settings for sizes. Tight sizes sit closer to the body than v5.2 / pants v2 do, so the limb
# correctives (shirt hip/arm-down, pants hip/knee) may need more clearance; v5.2 and pants v2 themselves are unchanged.
# Hip hem correctives; the arm-down correctives choose their clearance per size (ARM_DOWN_CLEARANCES_M below).
SHIRT_LIMB_RULES: dict[str, Any] = {"triangle_collision": True, "body_clearance_m": 0.003}
PANTS_RULES: dict[str, Any] = {}


def personal_body(model: Any, body_id: str) -> tuple[RestBody, Path, dict[str, Any]]:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    entry = next(e for e in [manifest["primary"], *manifest["secondary"]] if e["id"] == body_id)
    avatar = PROJECT / entry["body"]
    variant = "personal-identity-scale" if "identity-scale" in avatar.name else "personal-identity"
    body = evaluate_rest_body(model, variant, RECONSTRUCTION, floor_align=True)
    report: dict[str, Any] = {"manifest_id": body_id, "variant": variant, "avatar": entry["body"]}
    if MEASUREMENTS.is_file():
        import calibrate

        body, report["calibration"] = calibrate.calibrate_body(model, variant, RECONSTRUCTION, json.loads(MEASUREMENTS.read_text(encoding="utf-8")))
        avatar = AVATAR_DIR / f"{avatar.stem}-calibrated.glb"
        from generate_tshirt import rest_body_glb

        report["calibrated_avatar"] = rest_body_glb(body, avatar)
    else:
        report["calibration"] = {"skipped": True, "reason": f"{MEASUREMENTS.relative_to(PROJECT).as_posix()} not found"}
    report["avatar_match"] = verify_glb_matches_body(avatar, body)
    return body, avatar, report


def outer_layer(arrays: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]:
    """Outer-layer triangles of an assembled garment (no inner layer, no rims)."""
    faces = np.asarray(arrays["faces"]).reshape(-1, 3)
    inner = np.asarray(arrays["_inner"], dtype=bool)
    return np.asarray(arrays["position"], dtype=np.float64), faces[~inner[faces].any(axis=1)]


def base_pants_outer(body_id: str) -> tuple[np.ndarray, np.ndarray]:
    """The body's pants v2 (neutral, or the personal fit from the manifest): its outer layer, by face orientation
    (outward from the body's vertical axis), since a GLB has no layer flags."""
    if body_id == "neutral":
        path = PROJECT / "outputs" / "garments" / "pants-basic-v2-mhr-neutral.glb"
    else:
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        path = PROJECT / next(e for e in [manifest["primary"], *manifest["secondary"]] if e["id"] == body_id)["bottom"]["glb"]
    asset = load_asset(path)
    return outward_faces(asset.positions, asset.indices)


def outward_faces(vertices: np.ndarray, faces: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """A GLB has no layer flags: keep the faces whose normal points away from the garment's vertical axis."""
    import trimesh

    mesh = trimesh.Trimesh(vertices, faces, process=False)
    radial = mesh.triangles_center - vertices.mean(axis=0)
    radial[:, 1] = 0.0
    outward = np.einsum("ij,ij->i", mesh.face_normals, radial) > 0
    return vertices, faces[outward]


def shoulder_morphs(arrays: dict[str, Any], outer: Any, avatar: Any, body_id: str) -> tuple[dict[str, np.ndarray], dict[str, Any]]:
    if body_id == "neutral":
        return correctives.solve_targets(arrays, outer.vertices, outer.faces, avatar.skeleton, avatar)
    import personal_fit

    stem = "sam3d-person-front-sprint03-run2"
    base = "rest-identity-scale" if body_id == "personal-scaled" else "rest-identity"
    gates = personal_fit.body_gates(PROJECT / "outputs" / "garments" / f"tshirt-{stem}-{base}.glb", load_asset(AVATAR_DIR / f"{stem}-{base}.glb"))
    return personal_fit.fit_shoulders(arrays, outer, avatar, gates)


# Arm-down corrective clearances tried in order (Sprint 3A): the tightest squeeze of the T-shirt is the side panel at
# 20 deg arm-down, where the arm skin comes within ~4 mm of the torso skin; the best clearance differs by size and body.
ARM_DOWN_CLEARANCES_M = (0.003, 0.004, 0.002, 0.005, 0.006)
ARM_DOWN_LIMIT_M = 0.0025  # screening limit (the gate's 3 mm, with a margin for the approximate signed distance)


def arm_down_depth(arrays: dict[str, Any], avatar: Any, morphs: dict[str, np.ndarray], sidecar: dict[str, Any]) -> dict[str, float]:
    """Deepest penetration (m) of the shirt into the posed body at arm-down 15/20 deg, standing and walking, by the
    signed distance to the closest body triangle (the corrective solver's own measure)."""
    from scipy.spatial import cKDTree

    import trimesh
    from evaluate_arm_down import down, walk
    from posing import SkinnedAsset, posed_positions

    asset = SkinnedAsset(avatar.skeleton, np.asarray(arrays["position"], dtype=np.float32).astype(np.float64), np.asarray(arrays["faces"]).reshape(-1, 3),
                         np.asarray(arrays["joints"], dtype=np.int64), np.asarray(arrays["weights"], dtype=np.float32).astype(np.float64), None,
                         {k: v.astype(np.float32).astype(np.float64) for k, v in morphs.items()}, sidecar)
    depths = {}
    for name, rotations in (("down_15", down(15)), ("walk_15", walk(15)), ("down_20", down(20)), ("walk_20", walk(20))):
        posed, _, _ = posed_positions(asset, rotations)
        body_posed, _, _ = posed_positions(avatar, rotations)
        mesh = trimesh.Trimesh(body_posed, avatar.indices, process=False)
        signed, _ = correctives._triangle_signed_distance(posed, body_posed, avatar.indices, cKDTree(body_posed), mesh.vertex_faces)
        depths[name] = float(max(0.0, -signed.min()))
    return depths


def solve_arm_down(arrays: dict[str, Any], garment: Any, avatar: Any, morphs: dict[str, np.ndarray], sidecar: dict[str, Any]) -> tuple[dict[str, np.ndarray], dict[str, Any]]:
    """Solve the arm-down correctives with each clearance in turn; keep the first whose screened depth stays within the
    limit (else the shallowest)."""
    tried, best = [], None
    for clearance in ARM_DOWN_CLEARANCES_M:
        rules = correctives.CorrectiveRules(**{**SHIRT_LIMB_RULES, "body_clearance_m": clearance})
        add, _ = correctives.solve_specs(arrays, garment.vertices, garment.faces, avatar.skeleton, avatar, correctives.shirt_add_specs(), rules)
        depths = arm_down_depth(arrays, avatar, {**morphs, **add}, sidecar)
        worst = max(depths.values())
        tried.append({"body_clearance_m": clearance, "depth_m": depths})
        if best is None or worst < best[0]:
            best = (worst, clearance, add)
        if worst <= ARM_DOWN_LIMIT_M:
            break
    return best[2], {"chosen_body_clearance_m": best[1], "worst_depth_m": best[0], "tried": tried}


def pants_envelope_from_disk(out_dir: Path, body_id: str) -> list[tuple[np.ndarray, np.ndarray]]:
    """Outer layers of the pants sizes already written for this body (when the shirts are regenerated alone)."""
    meshes = []
    for path in sorted(out_dir.glob(f"pants-v2-*-{body_id}.glb")):
        asset = load_asset(path)
        meshes.append(outward_faces(asset.positions, asset.indices))
    return meshes


def build_shirt(body: RestBody, body_id: str, avatar_path: Path, spec: Any, surface: Any, envelope: Any = None, envelope_top_y: float = 0.0) -> dict[str, Any]:
    from fit_sizes import fit_shirt
    from sizes import ease_map_mm, shirt_regions, shirt_target_m
    from tshirt import V5_2_RULES, assemble

    started = time.perf_counter()
    garment, rules, fit = fit_shirt(body, spec, V5_2_RULES, envelope=envelope, envelope_top_y=envelope_top_y)
    if body_id != "neutral":
        from personal_fit import collapse_degenerate

        garment, fit["degenerate_cleanup"] = collapse_degenerate(garment, len(body.joint_names))
    arrays = assemble(garment, rules.thickness_m)
    from uv_layout import relayout

    arrays["uv"], fit["uv_layout"] = relayout(arrays, "tshirt")
    avatar = load_asset(avatar_path)
    morphs, fit["shoulder_correctives"] = shoulder_morphs(arrays, garment, avatar, body_id)
    extra, _ = correctives.solve_specs(arrays, garment.vertices, garment.faces, avatar.skeleton, avatar, correctives.shirt_hip_specs(), correctives.CorrectiveRules(**SHIRT_LIMB_RULES))
    morphs.update(extra)
    sidecar = correctives.signed_shirt_sidecar(avatar.skeleton, True)
    add_morphs, fit["arm_down_correctives"] = solve_arm_down(arrays, garment, avatar, morphs, sidecar)
    morphs.update(add_morphs)
    regions = shirt_regions(spec, fit["measurements"], fit["body"], fit["hem_y"], fit["holds"])
    sleeve_spec = rules.ease_sleeve_m - fit["holds"]["sleeve_m"]
    target = shirt_target_m(np.asarray(arrays["position"], dtype=np.float64), np.asarray(arrays["region"]), body, fit["body"], spec, regions["shoulders"]["ease_mm"] / 2000.0, sleeve_spec)
    ease = ease_map_mm(arrays, surface, rules.thickness_m, target)
    fit["levels"] = {"chest_y": fit["body"]["chest_y"], "waist_y": fit["body"]["waist_y"], "hips_y": fit["measurements"]["hips_y"], "shoulder_y": fit["body"]["shoulder_y"], "shoulder_half_width_m": fit["body"]["shoulder_width_m"] / 2}
    info = shirt_metadata(body, rules, f"tshirt-basic-v5.2-{spec.size}", "v5.2", body_id != "neutral", None if body_id == "neutral" else "neutral")
    info["size"] = {"label": spec.size, "spec": {"chest_m": spec.chest_m, "length_m": spec.length_m}, "fitMap": "docs/contracts/fit-map.md"}
    return {"arrays": arrays, "morphs": morphs, "sidecar": sidecar, "ease": ease, "regions": regions, "info": info, "material": SHIRT_MATERIAL, "fit": fit, "seconds": round(time.perf_counter() - started, 1)}


def build_pants(body: RestBody, body_id: str, avatar_path: Path, spec: Any, surface: Any) -> dict[str, Any]:
    from fit_sizes import fit_pants
    from generate_pants import MATERIAL as PANTS_MATERIAL, metadata as pants_metadata
    from pants import PANTS_V2_CORRECTIVE_RULES, PANTS_V2_RULES, PANTS_V2_SPECS, leg_corrective_specs
    from sizes import ease_map_mm, pants_regions, pants_target_m
    from tshirt import assemble

    started = time.perf_counter()
    garment, rules, fit = fit_pants(body, spec, PANTS_V2_RULES)
    if body_id != "neutral":
        from personal_fit import collapse_degenerate

        garment, fit["degenerate_cleanup"] = collapse_degenerate(garment, len(body.joint_names))
    arrays = assemble(garment, rules.fit.thickness_m)
    from uv_layout import relayout

    arrays["uv"], fit["uv_layout"] = relayout(arrays, "pants")
    avatar = load_asset(avatar_path)
    specs = leg_corrective_specs(**PANTS_V2_SPECS)
    morphs, fit["correctives"] = correctives.solve_specs(arrays, garment.vertices, garment.faces, avatar.skeleton, avatar, specs, correctives.CorrectiveRules(**{**PANTS_V2_CORRECTIVE_RULES, **PANTS_RULES}))
    sidecar = correctives.spec_sidecar(specs, avatar.skeleton)
    waist_y, hips_y = fit["marks"]["waist_y"], fit["body"]["hips_y"]
    positions = np.asarray(arrays["position"], dtype=np.float64)
    target, _ = pants_target_m(positions, body, spec, waist_y, hips_y, fit["marks"]["seam_y"])
    ease = ease_map_mm(arrays, surface, rules.fit.thickness_m, target)
    fit["levels"] = {"waist_y": fit["measurements"]["waist_y"], "hips_y": hips_y}
    regions = pants_regions(spec, fit["measurements"], fit["body"], fit["spec_hem_y"])
    info = pants_metadata(body, rules, "v2", body_id != "neutral")
    info["garmentId"] = f"pants-basic-v2-{spec.size}"
    info["size"] = {"label": spec.size, "spec": {"waist_m": spec.waist_m, "hips_m": spec.hips_m, "inseam_m": spec.inseam_m}, "fitMap": "docs/contracts/fit-map.md"}
    return {"arrays": arrays, "morphs": morphs, "sidecar": sidecar, "ease": ease, "regions": regions, "info": info, "material": PANTS_MATERIAL, "fit": fit, "seconds": round(time.perf_counter() - started, 1)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--bodies", nargs="+", default=["neutral", "personal-scaled"])
    parser.add_argument("--garments", nargs="+", default=["tshirt", "pants"], choices=["tshirt", "pants"])
    parser.add_argument("--sizes", nargs="+", default=["S", "M", "L", "XL"], choices=["S", "M", "L", "XL"])
    parser.add_argument("--out-dir", type=Path, default=SIZES_DIR)
    parser.add_argument("--report", type=Path, default=PROJECT / "outputs" / "garment-tests" / "sizes-sprint-3a.json")
    args = parser.parse_args()
    CRASH_LOG.parent.mkdir(parents=True, exist_ok=True)
    crash_log = open(CRASH_LOG, "a", encoding="utf-8")  # stays open for the process lifetime: faulthandler writes to it on a fatal signal
    faulthandler.enable(file=crash_log, all_threads=True)
    stage_log(crash_log, f"start bodies={args.bodies} garments={args.garments} sizes={args.sizes} pid={__import__('os').getpid()}")
    from pants import PantsRules, pants_landmarks
    from sizes import SIZES, pants_specs, recommend, shirt_specs
    from tshirt import V2_RULES, BodySurface

    model = load_model()
    neutral = evaluate_rest_body(model, "neutral")
    sys.path.insert(0, str(VIEWER))
    import exporters  # noqa: F401  (official exporter, used by the GLB writer)

    base_pants = pants_landmarks(neutral, PantsRules())
    base_hem_y = float(np.mean([leg["hem_centre"][1] for leg in base_pants["legs"].values()]))
    shirt = shirt_specs(neutral, V2_RULES.hem_below_hip_m)
    pants, pants_ratio = pants_specs(neutral, base_pants["waist_y"], base_pants["seam_y"] - base_hem_y)
    report: dict[str, Any] = {"specs": {"tshirt": {k: v.__dict__ for k, v in shirt.items()}, "pants": {k: v.__dict__ for k, v in pants.items()}, "pants_ratio": pants_ratio}, "bodies": {}}
    args.out_dir.mkdir(parents=True, exist_ok=True)
    for body_id in args.bodies:
        if body_id == "neutral":
            body, avatar_path, body_report = neutral, NEUTRAL_AVATAR, {"avatar_match": verify_glb_matches_body(NEUTRAL_AVATAR, neutral)}
        else:
            body, avatar_path, body_report = personal_body(model, body_id)
        surface = BodySurface(body, V2_RULES.body_samples, V2_RULES.seed)
        from measure import body_measurements

        body_report["measurements"] = body_measurements(body)
        body_report["garments"] = {}
        envelope_meshes: list[tuple[np.ndarray, np.ndarray]] = [base_pants_outer(body_id)]
        if "pants" not in args.garments:  # shirts regenerated alone: layer them over the pants sizes already written
            envelope_meshes += pants_envelope_from_disk(args.out_dir, body_id)
        for garment in sorted(args.garments, key=lambda g: g != "pants"):  # pants first: the shirts clear them
            built = {}
            for size in args.sizes:
                stage_log(crash_log, f"begin {body_id} {garment} {size}")
                if garment == "pants":
                    built[size] = build_pants(body, body_id, avatar_path, pants[size], surface)
                else:
                    from sizes import GarmentEnvelope

                    envelope = GarmentEnvelope(envelope_meshes)
                    top = float(max(vertices[:, 1].max() for vertices, _ in envelope_meshes))
                    built[size] = build_shirt(body, body_id, avatar_path, shirt[size], surface, envelope, top)
                print(f"{body_id} {garment} {size}: {built[size]['seconds']} s {json.dumps(built[size]['regions'])}", flush=True)
                built[size]["memory"] = stage_log(crash_log, f"done {body_id} {garment} {size} ({built[size]['seconds']} s)")
            girth_regions = ("chest", "waist", "hips") if garment == "tshirt" else ("waist", "hips")
            chosen = recommend({s: built[s]["regions"] for s in built}, girth_regions) if set(built) == set(SIZES) else None
            for size, item in built.items():
                name = f"{GARMENT_TAGS[garment]}-{size}-{body_id}"  # strings: "v5.2" would confuse Path.with_suffix
                glb = new_file(args.out_dir / f"{name}.glb")
                write_garment_glb(glb, item["arrays"], body, item["info"], item["material"], item["morphs"], {"_EASE_MM": item["ease"]})
                new_file(args.out_dir / f"{name}.correctives.json").write_text(json.dumps(item["sidecar"], indent=2) + "\n", encoding="utf-8")
                fit_json = {"version": 1, "garment": GARMENT_TAGS[garment], "size": size, "body": body_id, "regions": item["regions"], "recommended": size == chosen}
                new_file(args.out_dir / f"{name}.fit.json").write_text(json.dumps(fit_json, indent=2) + "\n", encoding="utf-8")
                body_report["garments"].setdefault(garment, {})[size] = {"regions": item["regions"], "recommended": size == chosen, "levels": item["fit"]["levels"], "fit": item["fit"], "ease_mm_range": [float(item["ease"].min()), float(item["ease"].max())], "seconds": item["seconds"], "memory": item["memory"]}
                if garment == "pants":
                    envelope_meshes.append(outer_layer(item["arrays"]))
            body_report["garments"][garment]["recommended"] = chosen
        report["bodies"][body_id] = body_report
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, default=lambda o: o.tolist() if hasattr(o, "tolist") else float(o)), encoding="utf-8")
    print(f"Wrote {args.report}")
    stage_log(crash_log, f"finished report={args.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
