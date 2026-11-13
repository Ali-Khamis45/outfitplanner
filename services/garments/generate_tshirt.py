"""Generate the procedural T-shirt for the neutral MHR body and, optionally, retarget it to a personal body shape.

Sprint 1.0 garment:  python generate_tshirt.py [--reconstruction outputs/<run>/reconstruction.npz]
Sprint 1.1 garment:  python generate_tshirt.py --rules v2 [--lod] [--reconstruction ...]
Personal outputs (rest-pose body GLBs and fitted garments) are private and written under outputs/. Nothing is overwritten.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from dataclasses import replace
from pathlib import Path
from typing import Any

import numpy as np
import trimesh

from body import PROJECT, VIEWER, RestBody, evaluate_rest_body, load_model
from garment_glb import read_glb, skinned_primitive, write_garment_glb
from tshirt import BOUNDARY_KINDS, REGION_NAMES, V2_RULES, V4_RULES, V5_1_RULES, V5_2_RULES, V5_RULES, BodySurface, FitRules, OuterGarment, assemble, design_tshirt, enforce_clearance, retarget, rules_record

MATERIAL = {"name": "TShirt_Cotton_PBR", "baseColor": [0.85, 0.85, 0.88, 1.0], "metalness": 0.0, "roughness": 0.85}
NEUTRAL_AVATAR = PROJECT / "outputs" / "avatars" / "mhr-neutral.glb"
AVATAR_DIR = PROJECT / "outputs" / "avatars"
LOD_VOXEL_M = 0.010
RULESETS = {
    "v1": FitRules(),
    "v2": V2_RULES,
    "v4": V4_RULES,  # Sprint 1.3 experiment: explicit underarm gusset panels
    "v5": V5_RULES,  # Sprint 1.4A: v2 + shoulder corrective morph targets (promotion candidate, not the default)
    "v5.1": V5_1_RULES,  # Sprint 2.1A: v5 + hip-flexion hem correctives
    "v5.2": V5_2_RULES,  # Sprint 2.2A: v5.1 + arm-down correctives (signed sidecar, contract v2)
    # Ablations for the Sprint 1.1 deformation analysis: each change on its own.
    "v2-separation-only": FitRules(underarm_separation_m=0.007),
    "v2-weights-only": FitRules(weight_mode="region", weight_smoothing_iterations=4),
}


def new_file(path: Path) -> Path:
    if path.exists():
        raise SystemExit(f"Refusing to overwrite existing artifact: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def verify_glb_matches_body(path: Path, body: RestBody) -> dict[str, float]:
    """Prove an existing avatar GLB is exactly the evaluated body and skeleton (positions and inverse binds)."""
    document, blob = read_glb(path)
    avatar = skinned_primitive(document, blob)
    position_error = float(np.abs(avatar["POSITION"] - body.vertices).max())
    exporters = sys.modules["exporters"]
    inverse = np.linalg.inv(exporters._skeleton_state_to_matrices(body.skeleton_state))
    bind_error = float(np.abs(avatar["inverse_bind"] - inverse).max())
    if list(avatar["joint_names"]) != list(body.joint_names) or position_error > 1e-5 or bind_error > 1e-4:
        raise SystemExit(f"Evaluated body does not match {path} (positions {position_error}, inverse binds {bind_error}).")
    return {"max_vertex_error_m": position_error, "max_inverse_bind_error": bind_error}


def metadata(body: RestBody, rules: FitRules, garment_id: str, revision: str, personal: bool, source_variant: str | None) -> dict[str, Any]:
    exporters = sys.modules["exporters"]
    inverse = np.linalg.inv(exporters._skeleton_state_to_matrices(body.skeleton_state)).astype("<f4")
    strategy = "landmark-driven eased volume with hang fill, surface nets extraction, clearance pass"
    if revision != "v1":
        if rules.underarm_panel_radius_m > 0:  # Sprint 1.3+: accurate description
            strategy += "; projection skin weights with discontinuity-aware smoothing, smoothed clearance and retarget fields; explicit stitched underarm gusset panel per side (cuff-based kite, harmonic weights)"
        else:  # kept verbatim so Sprint 1.1 v2 assets regenerate byte-identically (wording predates the final v2 rules)
            strategy += "; underarm separation below the axilla, region-aware armhole weight blend, smoothed clearance and retarget fields"
        if rules.hip_correctives:  # Sprint 2.1A only
            strategy += "; hip-flexion hem corrective morph targets (corr_L_hip90 / corr_R_hip90)"
        if rules.adduction_correctives:  # Sprint 2.2A only
            strategy += "; arm-down corrective morph targets (corr_L_add20 / corr_R_add20, signed measure)"
        if rules.shoulder_correctives:  # Sprint 1.4A only, so earlier revisions keep their bytes
            strategy += "; pose-driven shoulder corrective morph targets (DQS start, regional ARAP relaxation, body collision), see docs/contracts/corrective-morphs.md"
    info: dict[str, Any] = {
        "schemaVersion": 1,
        "garmentId": garment_id,
        "category": "tshirt",
        "displayName": "Basic T-shirt (procedural)",
        "units": "meters",
        "upAxis": "+Y",
        "forwardAxis": "+Z",
        "bodyVariant": body.variant,
        "retargetedFrom": source_variant,
        "skeleton": {"standard": "MHR", "jointCount": len(body.joint_names), "rootJoint": body.joint_names[0], "inverseBindSha256": hashlib.sha256(inverse.tobytes()).hexdigest()},
        "regions": list(REGION_NAMES) + (["left_gusset", "right_gusset"] if rules.underarm_panel_radius_m > 0 else []),
        "openings": list(BOUNDARY_KINDS),
        "thicknessM": rules.thickness_m,
        "material": {"model": "pbr-metallic-roughness", "baseColor": "#d9d9e0", "metalness": MATERIAL["metalness"], "roughness": MATERIAL["roughness"], "colorAdjustable": True},
        "fit": {"strategy": strategy, "rules": rules_record(rules)},
        "provenance": {"generator": "services/garments/generate_tshirt.py", "sourceBody": "Official MHR model evaluated in its rest pose (Apache-2.0)", "personalData": personal},
    }
    if revision != "v1":  # added only for new revisions so Sprint 1.0 assets regenerate byte-identically
        info["revision"] = revision
    if body.floor_offset_m:
        info["bodyFloorOffsetM"] = body.floor_offset_m
    return info


def topology_report(arrays: dict[str, Any]) -> dict[str, Any]:
    welded = trimesh.Trimesh(arrays["position"], arrays["faces"], process=False)
    welded.merge_vertices(merge_tex=True, merge_norm=True)
    euler = len(welded.vertices) - len(welded.edges_unique) + len(welded.faces)
    return {"vertices": int(len(arrays["position"])), "triangles": int(len(arrays["faces"])), "welded_vertices": int(len(welded.vertices)), "watertight": bool(welded.is_watertight), "winding_consistent": bool(welded.is_winding_consistent), "volume_m3": float(welded.volume), "euler_characteristic": int(euler), "genus": int((2 - euler) // 2)}


def write(directory: Path, body: RestBody, outer: OuterGarment, rules: FitRules, name: str, garment_id: str, revision: str, personal: bool, source_variant: str | None, extra: dict[str, Any]) -> dict[str, Any]:
    arrays = assemble(outer, rules.thickness_m)
    glb = new_file(directory / f"{name}.glb")
    info = metadata(body, rules, garment_id, revision, personal, source_variant)
    morphs = None
    if rules.shoulder_correctives:  # Sprint 1.4A: solved against the neutral avatar GLB's skeleton and body
        import correctives
        from posing import load_asset

        avatar = load_asset(NEUTRAL_AVATAR)
        morphs, extra["correctives"] = correctives.solve_targets(arrays, outer.vertices, outer.faces, avatar.skeleton, avatar)
        document = correctives.sidecar()
        if rules.hip_correctives:  # Sprint 2.1A: appended after the four shoulder targets
            specs = correctives.shirt_hip_specs()
            hip_morphs, extra["hip_correctives"] = correctives.solve_specs(arrays, outer.vertices, outer.faces, avatar.skeleton, avatar, specs, correctives.SHIRT_HIP_RULES)
            morphs.update(hip_morphs)
            if rules.adduction_correctives:  # Sprint 2.2A: appended after the hip targets
                add_morphs, extra["adduction_correctives"] = correctives.solve_specs(arrays, outer.vertices, outer.faces, avatar.skeleton, avatar, correctives.shirt_add_specs(), correctives.SHIRT_HIP_RULES)
                morphs.update(add_morphs)
            document = correctives.signed_shirt_sidecar(avatar.skeleton, rules.adduction_correctives)  # contract v2
        new_file(glb.with_name(glb.stem + ".correctives.json")).write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    write_garment_glb(glb, arrays, body, info, MATERIAL, morphs)
    report = {"garment": info, "topology": topology_report(arrays), "fit_report": {k: v for k, v in outer.report.items() if k != "rules"}, **extra}
    new_file(glb.with_suffix(".json")).write_text(json.dumps(report, indent=2, default=float), encoding="utf-8")
    print(f"Wrote {glb}")
    return report


def rest_body_glb(body: RestBody, path: Path) -> dict[str, Any]:
    """Export the rest-pose body with the official exporter, or reuse an existing file only if it is identical."""
    if path.exists():
        return {"reused_existing": True, **verify_glb_matches_body(path, body)}
    exporters = sys.modules["exporters"]
    rig = exporters.RigData(joint_names=body.joint_names, joint_parents=body.joint_parents, skeleton_state=body.skeleton_state, joint_indices=body.skin_joints, joint_weights=body.skin_weights)
    new_file(path).write_bytes(exporters.export_mesh(body.vertices.astype(np.float32), body.faces, "glb", rig).data)
    sys.path.insert(0, str(PROJECT / "services" / "reconstruction"))
    from validate_glb import validate

    return validate(path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--rules", choices=sorted(RULESETS), default="v1", help="v1 reproduces the Sprint 1.0 garment")
    parser.add_argument("--lod", action="store_true", help=f"coarser extraction grid ({LOD_VOXEL_M * 1000:.0f} mm) for a lower-detail variant")
    parser.add_argument("--reconstruction", type=Path, help="SAM reconstruction.npz whose identity (and scales) to fit")
    parser.add_argument("--out-dir", type=Path, default=PROJECT / "outputs" / "garments")
    parser.add_argument("--override", action="append", default=[], metavar="KEY=VALUE", help="experiment-only FitRules override (requires --name)")
    parser.add_argument("--name", help="revision name for an experiment (outputs tshirt-<name>-...)")
    args = parser.parse_args()
    started = time.perf_counter()
    rules = replace(RULESETS[args.rules], voxel_m=LOD_VOXEL_M) if args.lod else RULESETS[args.rules]
    if args.override:
        if not args.name:
            parser.error("--override requires --name so experiments never reuse a release asset name")
        values = {}
        for item in args.override:
            key, _, raw = item.partition("=")
            default = getattr(rules, key)
            values[key] = raw if isinstance(default, str) else type(default)(float(raw)) if isinstance(default, int) else float(raw)
        rules = replace(rules, **values)
    if rules.shoulder_correctives and args.reconstruction:
        parser.error("shoulder correctives are solved for the neutral body only (Sprint 1.4A)")
    revision = args.name or args.rules + ("-lod" if args.lod else "")
    prefix = "tshirt" if revision == "v1" else f"tshirt-{revision}"
    garment_id = "tshirt-basic-v1" if revision == "v1" else f"tshirt-basic-{revision}"
    model = load_model()
    neutral = evaluate_rest_body(model, "neutral")
    sys.path.insert(0, str(VIEWER))
    import exporters  # noqa: F401  (registers the official exporter module)

    match = verify_glb_matches_body(NEUTRAL_AVATAR, neutral)
    outer, _ = design_tshirt(neutral, rules)
    reports: dict[str, Any] = {}
    if not (args.out_dir / f"{prefix}-mhr-neutral.glb").exists():
        reports["neutral"] = write(args.out_dir, neutral, outer, rules, f"{prefix}-mhr-neutral", garment_id, revision, False, None, {"neutral_avatar_match": match})
    if args.reconstruction:
        stem = args.reconstruction.resolve().parent.name
        for variant in ("personal-identity", "personal-identity-scale"):
            # Sprint 1.1+ ground-aligns bodies that float (identity-only bodies are within tolerance and unchanged).
            body = evaluate_rest_body(model, variant, args.reconstruction, floor_align=revision != "v1")
            suffix = "rest-identity" if variant == "personal-identity" else "rest-identity-scale"
            if body.floor_offset_m:
                suffix += "-floor"
            body_report = rest_body_glb(body, AVATAR_DIR / f"{stem}-{suffix}.glb")
            moved = retarget(outer, neutral, body, rules)
            surface = BodySurface(body, rules.body_samples, rules.seed)
            signed, _, _ = surface.query(moved.vertices)
            before = {"min_outer_clearance_m": float(signed.min()), "outer_vertices_below_required": int((signed < rules.min_clearance_m + rules.thickness_m).sum())}
            mesh = trimesh.Trimesh(moved.vertices, moved.faces, process=False)
            after = enforce_clearance(mesh, surface, rules, np.zeros(len(moved.vertices), dtype=bool))
            moved.vertices = np.array(mesh.vertices)
            moved.report.update({"clearance_before_push": before, "clearance": after, "body_floor_offset_m": body.floor_offset_m})
            reports[variant] = write(args.out_dir, body, moved, rules, f"{prefix}-{stem}-{suffix}", garment_id, revision, True, "neutral", {"body_glb_validation": body_report})
    print(json.dumps({variant: {"topology": r["topology"], "fit": r["fit_report"]} for variant, r in reports.items()}, indent=2, default=float))
    print(f"Total {time.perf_counter() - started:.1f} s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
