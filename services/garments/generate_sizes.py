"""Generate graded sizes and fit maps (Sprint 3A, docs/contracts/fit-map.md).

    python generate_sizes.py [--bodies neutral personal-scaled] [--garments tshirt pants] [--sizes S M L XL]

For each body, garment and size: design the size on the body (girths solved to the size spec), clean degenerate
triangles (personal bodies), re-solve the corrective morphs for this size, and write
outputs/garments/sizes/<garment>-<size>-<bodyId>.glb (+ _EASE_MM), .correctives.json and .fit.json. --revision picks
the garment generation: 3.5 (default since Sprint 3.5 was accepted: tshirt-v5.3 / pants-v3, into outputs/garments/sizes/)
or 3a (tshirt-v5.2 / pants-v2, into outputs/garments/sizes-v5.2/, kept for one sprint as ?gen=v5.2). Personal bodies
come from outputs/garments/personal/manifest.json. If outputs/avatars/measurements.json exists, the personal body is
calibrated to it first (calibrate.py); otherwise calibration is skipped and reported. Nothing is overwritten.

Resumable: each size's GLB, sidecar and report entry (outputs/garment-tests/sizes/<name>.json) are written as soon as
the size is built. On a later run, a size whose three files exist and validate (GLB parses, carries _EASE_MM for every
vertex and the sidecar's targets, entry has the fit regions) is skipped and its entry reused; .fit.json (which needs
every size for the recommendation) is written once all four sizes exist, and verified if it already exists. Long runs
should be launched detached from the terminal session with tools/launch_detached.ps1 (README, "Long-running jobs")
and followed by their log.
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
GARMENT_TAGS = {"tshirt": "tshirt-v5.3", "pants": "pants-v3"}
# --revision: 3.5 = tshirt-v5.3 / pants-v3 (pattern panels, UV layout v3, smooth push falloff), the default generation;
# 3a = tshirt-v5.2 / pants-v2 (UV layout v2, linear push), the previous default, reachable for one sprint.
# "clean_all": Sprint 3.6 runs the degenerate clean-up (personal_fit.collapse_degenerate) on every body, not only on
# personal ones: neutral sizes kept sub-millimetre slivers (waistband rim, neckline) whose edges stretched 12-18x and
# flipped. "hip_keys_deg": the pants hip-flexion corrective keys (pants.leg_corrective_specs). With the single 90 deg key, l-hip-60 showed
# 56 % of the 90 deg shape and the groin crease folded (neutral L: 64 flips where the gate allows 24); Sprint 3.6 adds a 60 deg key.
# "shoulder_search_all": every body searches the shoulder corrective settings against its own gates (shoulder_morphs).
# 3a keeps its Sprint 3A behaviour, so the v5.2 / pants-v2 sizes still regenerate byte for byte.
REVISIONS = {"3a": {"tshirt": "v5.2", "pants": "v2", "dir": SIZES_DIR.parent / "sizes-v5.2", "clean_all": False, "hip_keys_deg": (90.0,), "shoulder_search_all": False},
             "3.5": {"tshirt": "v5.3", "pants": "v3", "dir": SIZES_DIR, "clean_all": True, "hip_keys_deg": (60.0, 90.0), "shoulder_search_all": True}}
CRASH_LOG = PROJECT / "outputs" / "garment-tests" / "sizes-crash.log"  # faulthandler + per-stage peak memory
ENTRIES_DIR = PROJECT / "outputs" / "garment-tests" / "sizes"  # per-size report entries (resume)


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
    # Which body is calibrated: the manifest entry whose avatar is a "-calibrated" GLB. Before the manifest names one
    # (first calibration), it is the primary body. Any other body (e.g. the photo estimate) is never calibrated.
    entries = [manifest["primary"], *manifest["secondary"]]
    named = [e["id"] for e in entries if Path(e["body"]).stem.endswith("-calibrated")]
    calibrate_this = body_id in named if named else entry is manifest["primary"]
    if MEASUREMENTS.is_file() and calibrate_this:
        import calibrate

        body, report["calibration"] = calibrate.calibrate_body(model, variant, RECONSTRUCTION, json.loads(MEASUREMENTS.read_text(encoding="utf-8")))
        avatar = avatar if avatar.stem.endswith("-calibrated") else AVATAR_DIR / f"{avatar.stem}-calibrated.glb"
        from generate_tshirt import rest_body_glb

        report["calibrated_avatar"] = rest_body_glb(body, avatar)
    elif MEASUREMENTS.is_file():
        report["calibration"] = {"skipped": True, "reason": "not the calibrated body of the manifest"}
    else:
        report["calibration"] = {"skipped": True, "reason": f"{MEASUREMENTS.relative_to(PROJECT).as_posix()} not found"}
    report["avatar_match"] = verify_glb_matches_body(avatar, body)
    return body, avatar, report


def outer_layer(arrays: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]:
    """Outer-layer triangles of an assembled garment (no inner layer, no rims)."""
    faces = np.asarray(arrays["faces"]).reshape(-1, 3)
    inner = np.asarray(arrays["_inner"], dtype=bool)
    return np.asarray(arrays["position"], dtype=np.float64), faces[~inner[faces].any(axis=1)]


def has_base_pants(body_id: str) -> bool:
    """False when the manifest's bottom for this body is one of its size files (a calibrated body has no pants v2 fit)."""
    if body_id == "neutral":
        return True
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    entry = next(e for e in [manifest["primary"], *manifest["secondary"]] if e["id"] == body_id)
    return (PROJECT / entry["bottom"]["glb"]).parent.resolve() not in {r["dir"].resolve() for r in REVISIONS.values()}


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


def shoulder_morphs(arrays: dict[str, Any], outer: Any, avatar: Any, body_id: str, avatar_path: Path | None = None, search_all: bool = False) -> tuple[dict[str, np.ndarray], dict[str, Any]]:
    """Shoulder targets for a size. Sprint 3A: neutral sizes take the neutral settings; personal sizes search
    personal_fit.SHOULDER_CANDIDATES against the body's own gates. Sprint 3.6 (`search_all`): every body searches
    personal_fit.SHOULDER_CANDIDATES_3_6 against its gates (size_gates.shoulder_gates), the same gates the size gates check."""
    if search_all:
        import personal_fit
        import size_gates

        return personal_fit.fit_shoulders(arrays, outer, avatar, size_gates.shoulder_gates(Path(avatar_path)), personal_fit.SHOULDER_CANDIDATES_3_6)
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


def resume_entry(out_dir: Path, entries_dir: Path, name: str, regions: tuple[str, ...]) -> dict[str, Any] | None:
    """The report entry of a size already on disk, if its GLB, sidecar and entry exist and validate; else None.
    A partial set (a kill between two writes) raises, so nothing half-written is silently reused."""
    from garment_glb import read_glb

    glb, sidecar_path, entry_path = out_dir / f"{name}.glb", out_dir / f"{name}.correctives.json", entries_dir / f"{name}.json"
    present = [path.is_file() for path in (glb, sidecar_path, entry_path)]
    if not any(present):
        return None
    if not all(present):
        raise SystemExit(f"{name}: partial outputs ({glb.name}: {present[0]}, {sidecar_path.name}: {present[1]}, entry: {present[2]}); remove them to rebuild")
    document, blob = read_glb(glb)
    primitive = document["meshes"][0]["primitives"][0]
    if "_EASE_MM" not in primitive["attributes"]:
        raise SystemExit(f"{name}: GLB has no _EASE_MM; remove its outputs to rebuild")
    if document["accessors"][primitive["attributes"]["_EASE_MM"]]["count"] != document["accessors"][primitive["attributes"]["POSITION"]]["count"]:
        raise SystemExit(f"{name}: _EASE_MM count differs from POSITION; remove its outputs to rebuild")
    sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
    targets = primitive.get("extras", {}).get("targetNames", [])
    if sorted(sidecar.get("targets", {})) != sorted(targets):
        raise SystemExit(f"{name}: sidecar targets {sorted(sidecar.get('targets', {}))} differ from the GLB's {sorted(targets)}; remove its outputs to rebuild")
    entry = json.loads(entry_path.read_text(encoding="utf-8"))
    if set(entry.get("regions", {})) != set(regions) or "levels" not in entry:
        raise SystemExit(f"{name}: report entry is incomplete; remove its outputs to rebuild")
    entry["resumed"] = True
    return entry


COLLISION_PYTHON = PROJECT / "tools" / "collision" / ".venv" / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")


def size_gates_entry(glb: Path, avatar_path: Path, entries_dir: Path, name: str) -> dict[str, Any]:
    """Sprint 3.6: the deformation gates of a written size (size_gates.py: stretch, flips and penetration at every
    supported pose, against the size's own avatar). They always run, in the collision tool's environment (the exact
    checks need its trimesh + Embree + rtree); the result is kept next to the size's report entry (<name>.gates.json), so
    a resumed run reuses it."""
    import subprocess

    path = entries_dir / f"{name}.gates.json"
    if not path.is_file():
        if not COLLISION_PYTHON.is_file():
            raise SystemExit(f"The size gates need the collision tool's environment ({COLLISION_PYTHON}); see tools/collision/README.md")
        entries_dir.mkdir(parents=True, exist_ok=True)
        run = subprocess.run([str(COLLISION_PYTHON), str(Path(__file__).with_name("size_gates.py")), f"{glb}={avatar_path}", "--out", str(path)], capture_output=True, text=True)
        if run.returncode not in (0, 1) or not path.is_file():  # 1: the size failed a gate (reported, not an error)
            raise SystemExit(f"size_gates.py failed on {glb.name} (exit {run.returncode}):\n{run.stderr[-2000:]}")
    return json.loads(path.read_text(encoding="utf-8"))[glb.name]


def withhold(out_dir: Path, withheld_dir: Path, name: str, why: str, entries_dir: Path) -> None:
    """Move a size that failed its gates out of the shipped folder (GLB, sidecar, fit.json) into the withheld folder, with
    a note the web reads to show the size as not ready. Its report entry and gate report stay in the entries folder."""
    withheld_dir.mkdir(parents=True, exist_ok=True)
    for suffix in (".glb", ".correctives.json", ".fit.json"):
        source = out_dir / f"{name}{suffix}"
        if source.is_file():
            source.rename(new_file(withheld_dir / f"{name}{suffix}"))
    note = {"version": 1, "size": name, "reason": "failed its deformation gates", "failed_gates": why, "gates": (entries_dir / f"{name}.gates.json").name}
    new_file(withheld_dir / f"{name}.withheld.json").write_text(json.dumps(note, indent=2) + "\n", encoding="utf-8")


def pants_envelope_from_disk(out_dir: Path, body_id: str) -> list[tuple[np.ndarray, np.ndarray]]:
    """Outer layers of the pants sizes already written for this body (when the shirts are regenerated alone)."""
    meshes = []
    for path in sorted(out_dir.glob(GARMENT_TAGS["pants"] + f"-*-{body_id}.glb")):
        asset = load_asset(path)
        meshes.append(outward_faces(asset.positions, asset.indices))
    return meshes


def build_shirt(body: RestBody, body_id: str, avatar_path: Path, spec: Any, surface: Any, envelope: Any = None, envelope_top_y: float = 0.0, revision: str = "v5.2", clean_all: bool = False, shoulder_search_all: bool = False) -> dict[str, Any]:
    from fit_sizes import LAYER_FALLOFF_M, fit_shirt
    from sizes import ease_map_mm, shirt_regions, shirt_target_m
    from tshirt import V5_2_RULES, V5_3_RULES, assemble

    started = time.perf_counter()
    base_rules = V5_3_RULES if revision == "v5.3" else V5_2_RULES
    falloff = LAYER_FALLOFF_M if base_rules.panel_seams else None  # Sprint 3.5: smooth push falloff (no hem ledge)
    garment, rules, fit = fit_shirt(body, spec, base_rules, envelope=envelope, envelope_top_y=envelope_top_y, falloff_m=falloff)
    if body_id != "neutral" or clean_all:
        from personal_fit import collapse_degenerate

        garment, fit["degenerate_cleanup"] = collapse_degenerate(garment, len(body.joint_names))
    extra_attributes = {}
    if rules.panel_seams:  # Sprint 3.5: pattern panels and UV layout v3
        import panels
        from uv_layout import relayout_panels

        garment, fit["panels"] = panels.cut(garment, "tshirt")
        arrays = assemble(garment, rules.thickness_m)
        arrays["uv"], fit["uv_layout"], extra_attributes["_PANEL"] = relayout_panels(arrays, "tshirt")
    else:
        arrays = assemble(garment, rules.thickness_m)
        from uv_layout import relayout

        arrays["uv"], fit["uv_layout"] = relayout(arrays, "tshirt")
    avatar = load_asset(avatar_path)
    morphs, fit["shoulder_correctives"] = shoulder_morphs(arrays, garment, avatar, body_id, avatar_path, shoulder_search_all)
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
    info = shirt_metadata(body, rules, f"tshirt-basic-{revision}-{spec.size}", revision, body_id != "neutral", None if body_id == "neutral" else "neutral")
    info["size"] = {"label": spec.size, "spec": {"chest_m": spec.chest_m, "length_m": spec.length_m}, "fitMap": "docs/contracts/fit-map.md"}
    return {"arrays": arrays, "morphs": morphs, "sidecar": sidecar, "ease": ease, "regions": regions, "info": info, "material": SHIRT_MATERIAL, "fit": fit, "seconds": round(time.perf_counter() - started, 1), "extra_attributes": extra_attributes}


def build_pants(body: RestBody, body_id: str, avatar_path: Path, spec: Any, surface: Any, revision: str = "v2", clean_all: bool = False, hip_keys_deg: tuple[float, ...] = (90.0,)) -> dict[str, Any]:
    from fit_sizes import fit_pants
    from generate_pants import MATERIAL as PANTS_MATERIAL, metadata as pants_metadata
    from pants import PANTS_V2_CORRECTIVE_RULES, PANTS_V2_RULES, PANTS_V2_SPECS, PANTS_V3_RULES, leg_corrective_specs
    from sizes import ease_map_mm, pants_regions, pants_target_m
    from tshirt import assemble

    started = time.perf_counter()
    garment, rules, fit = fit_pants(body, spec, PANTS_V3_RULES if revision == "v3" else PANTS_V2_RULES)
    if body_id != "neutral" or clean_all:
        from personal_fit import collapse_degenerate

        garment, fit["degenerate_cleanup"] = collapse_degenerate(garment, len(body.joint_names))
    extra_attributes = {}
    if rules.panel_seams:  # Sprint 3.5: pattern panels and UV layout v3
        import panels
        from uv_layout import relayout_panels

        garment, fit["panels"] = panels.cut(garment, "pants")
        arrays = assemble(garment, rules.fit.thickness_m)
        arrays["uv"], fit["uv_layout"], extra_attributes["_PANEL"] = relayout_panels(arrays, "pants")
    else:
        arrays = assemble(garment, rules.fit.thickness_m)
        from uv_layout import relayout

        arrays["uv"], fit["uv_layout"] = relayout(arrays, "pants")
    avatar = load_asset(avatar_path)
    specs = leg_corrective_specs(**{**PANTS_V2_SPECS, "hip_keys_deg": hip_keys_deg})
    morphs, fit["correctives"] = correctives.solve_specs(arrays, garment.vertices, garment.faces, avatar.skeleton, avatar, specs, correctives.CorrectiveRules(**{**PANTS_V2_CORRECTIVE_RULES, **PANTS_RULES}))
    sidecar = correctives.spec_sidecar(specs, avatar.skeleton)
    waist_y, hips_y = fit["marks"]["waist_y"], fit["body"]["hips_y"]
    positions = np.asarray(arrays["position"], dtype=np.float64)
    target, _ = pants_target_m(positions, body, spec, waist_y, hips_y, fit["marks"]["seam_y"])
    ease = ease_map_mm(arrays, surface, rules.fit.thickness_m, target)
    fit["levels"] = {"waist_y": fit["measurements"]["waist_y"], "hips_y": hips_y}
    regions = pants_regions(spec, fit["measurements"], fit["body"], fit["spec_hem_y"])
    info = pants_metadata(body, rules, revision, body_id != "neutral")
    info["garmentId"] = f"pants-basic-{revision}-{spec.size}"
    info["size"] = {"label": spec.size, "spec": {"waist_m": spec.waist_m, "hips_m": spec.hips_m, "inseam_m": spec.inseam_m}, "fitMap": "docs/contracts/fit-map.md"}
    return {"arrays": arrays, "morphs": morphs, "sidecar": sidecar, "ease": ease, "regions": regions, "info": info, "material": PANTS_MATERIAL, "fit": fit, "seconds": round(time.perf_counter() - started, 1), "extra_attributes": extra_attributes}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--bodies", nargs="+", default=["neutral", "personal-scaled"])
    parser.add_argument("--garments", nargs="+", default=["tshirt", "pants"], choices=["tshirt", "pants"])
    parser.add_argument("--sizes", nargs="+", default=["S", "M", "L", "XL"], choices=["S", "M", "L", "XL"])
    parser.add_argument("--out-dir", type=Path, default=None, help="default: the revision's sizes folder")
    parser.add_argument("--entries-dir", type=Path, default=ENTRIES_DIR, help="per-size report entries, written as each size finishes (resume)")
    parser.add_argument("--report", type=Path, default=None, help="default: outputs/garment-tests/sizes-sprint-<revision>.json")
    parser.add_argument("--revision", choices=sorted(REVISIONS), default="3.5", help="3.5: tshirt-v5.3 / pants-v3 (default); 3a: tshirt-v5.2 / pants-v2")
    args = parser.parse_args()
    args.out_dir = args.out_dir or REVISIONS[args.revision]["dir"]
    withheld_dir = args.out_dir.with_name(args.out_dir.name + "-withheld")  # Sprint 3.6: sizes that fail their gates
    args.report = args.report or PROJECT / "outputs" / "garment-tests" / f"sizes-sprint-{args.revision}.json"
    GARMENT_TAGS.update({"tshirt": "tshirt-" + REVISIONS[args.revision]["tshirt"], "pants": "pants-" + REVISIONS[args.revision]["pants"]})
    CRASH_LOG.parent.mkdir(parents=True, exist_ok=True)
    crash_log = open(CRASH_LOG, "a", encoding="utf-8")  # stays open for the process lifetime: faulthandler writes to it on a fatal signal
    faulthandler.enable(file=crash_log, all_threads=True)
    stage_log(crash_log, f"start bodies={args.bodies} garments={args.garments} sizes={args.sizes} pid={__import__('os').getpid()}")
    import size_gates
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
    failed: dict[str, str | None] = {}  # size name -> failed gates (None: passed)
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
        # a calibrated body has no pants v2 fit of its own (the manifest's was fitted to the uncalibrated body)
        calibrated = "calibrated_avatar" in body_report
        envelope_meshes: list[tuple[np.ndarray, np.ndarray]] = [base_pants_outer(body_id)] if has_base_pants(body_id) and not calibrated else []
        if "pants" not in args.garments:  # shirts regenerated alone: layer them over the pants sizes already written
            envelope_meshes += pants_envelope_from_disk(args.out_dir, body_id) + pants_envelope_from_disk(withheld_dir, body_id)
        for garment in sorted(args.garments, key=lambda g: g != "pants"):  # pants first: the shirts clear them
            region_names = ("chest", "waist", "hips", "shoulders", "length") if garment == "tshirt" else ("waist", "hips", "length")
            entries: dict[str, dict[str, Any]] = {}
            size_dirs: dict[str, Path] = {}  # where each size lives: the out dir, or the withheld dir after a failed gate
            for size in args.sizes:
                name = f"{GARMENT_TAGS[garment]}-{size}-{body_id}"  # strings: "v5.2" would confuse Path.with_suffix
                size_dirs[size] = withheld_dir if (withheld_dir / f"{name}.glb").is_file() else args.out_dir
                entry = resume_entry(size_dirs[size], args.entries_dir, name, region_names)
                if entry is not None:
                    stage_log(crash_log, f"resume {body_id} {garment} {size} (outputs validated, build skipped)")
                else:
                    stage_log(crash_log, f"begin {body_id} {garment} {size}")
                    if garment == "pants":
                        item = build_pants(body, body_id, avatar_path, pants[size], surface, REVISIONS[args.revision]["pants"], REVISIONS[args.revision]["clean_all"], REVISIONS[args.revision]["hip_keys_deg"])
                    else:
                        from sizes import GarmentEnvelope

                        envelope = GarmentEnvelope(envelope_meshes)
                        top = float(max(vertices[:, 1].max() for vertices, _ in envelope_meshes))
                        item = build_shirt(body, body_id, avatar_path, shirt[size], surface, envelope, top, REVISIONS[args.revision]["tshirt"], REVISIONS[args.revision]["clean_all"], REVISIONS[args.revision]["shoulder_search_all"])
                    print(f"{body_id} {garment} {size}: {item['seconds']} s {json.dumps(item['regions'])}", flush=True)
                    memory = stage_log(crash_log, f"done {body_id} {garment} {size} ({item['seconds']} s)")
                    # written at once, so a killed run keeps every finished size (fit.json follows, once all sizes exist)
                    glb = new_file(args.out_dir / f"{name}.glb")
                    write_garment_glb(glb, item["arrays"], body, item["info"], item["material"], item["morphs"], {"_EASE_MM": item["ease"], **item.get("extra_attributes", {})})
                    new_file(args.out_dir / f"{name}.correctives.json").write_text(json.dumps(item["sidecar"], indent=2) + "\n", encoding="utf-8")
                    entry = {"regions": item["regions"], "levels": item["fit"]["levels"], "fit": item["fit"], "ease_mm_range": [float(item["ease"].min()), float(item["ease"].max())], "seconds": item["seconds"], "memory": memory}
                    args.entries_dir.mkdir(parents=True, exist_ok=True)
                    new_file(args.entries_dir / f"{name}.json").write_text(json.dumps(entry, indent=2, default=lambda o: o.tolist() if hasattr(o, "tolist") else float(o)), encoding="utf-8")
                    del item  # the arrays and morphs of a written size are not kept in memory
                entries[size] = entry
                gates = size_gates_entry(size_dirs[size] / f"{name}.glb", avatar_path, args.entries_dir, name)
                failed[name] = None if gates["pass"] else size_gates.failed_checks(gates)
                stage_log(crash_log, f"gates {body_id} {garment} {size}: {'PASS' if gates['pass'] else 'FAIL ' + failed[name]}")
                if garment == "pants":
                    asset = load_asset(size_dirs[size] / f"{name}.glb")
                    envelope_meshes.append(outward_faces(asset.positions, asset.indices))
            girth_regions = ("chest", "waist", "hips") if garment == "tshirt" else ("waist", "hips")
            chosen = recommend({s: entries[s]["regions"] for s in entries}, girth_regions) if set(entries) == set(SIZES) else None
            for size, entry in entries.items():
                name = f"{GARMENT_TAGS[garment]}-{size}-{body_id}"
                fit_json = {"version": 1, "garment": GARMENT_TAGS[garment], "size": size, "body": body_id, "regions": entry["regions"], "recommended": size == chosen}
                fit_path = size_dirs[size] / f"{name}.fit.json"
                if fit_path.is_file():
                    if json.loads(fit_path.read_text(encoding="utf-8")) != fit_json:
                        raise SystemExit(f"{fit_path} exists and differs from this run's fit data; remove it to rewrite")
                else:
                    fit_path.write_text(json.dumps(fit_json, indent=2) + "\n", encoding="utf-8")
                body_report["garments"].setdefault(garment, {})[size] = {**entry, "recommended": size == chosen}
            body_report["garments"][garment]["recommended"] = chosen
            for size in entries:  # Sprint 3.6: a size that fails its gates is withheld (not shipped); the recommended one must pass
                name = f"{GARMENT_TAGS[garment]}-{size}-{body_id}"
                if failed[name] and size == chosen:
                    raise SystemExit(f"{name} is the recommended size and fails its gates ({failed[name]}); it cannot be withheld")
                if failed[name] and size_dirs[size] == args.out_dir:
                    withhold(args.out_dir, withheld_dir, name, failed[name], args.entries_dir)
                    stage_log(crash_log, f"withheld {name}: {failed[name]}")
        report["bodies"][body_id] = body_report
    report["gates"] = {"rules": "services/garments/size_gates.py", "withheld_dir": withheld_dir.name,
                       "withheld": {name: why for name, why in failed.items() if why}, "passed": sorted(name for name, why in failed.items() if not why)}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, default=lambda o: o.tolist() if hasattr(o, "tolist") else float(o)), encoding="utf-8")
    print(f"Wrote {args.report}")
    stage_log(crash_log, f"finished report={args.report}")
    if report["gates"]["withheld"]:
        print("Withheld (failed their gates): " + "; ".join(f"{name}: {why}" for name, why in report["gates"]["withheld"].items()), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
