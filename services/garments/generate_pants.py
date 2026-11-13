"""Generate the basic straight-leg pants for the neutral MHR body (Sprint 2.0A).

    python generate_pants.py [--version v1|v2] [--out-dir outputs/garments] [--reconstruction outputs/<run>/reconstruction.npz]

With --reconstruction (v2), the neutral pants are also retargeted to the personal rest bodies (identity, and identity +
scales, ground-aligned as the T-shirt's), pushed clear of each body, and get correctives re-solved for that body.

Writes pants-basic-<version>-mhr-neutral.glb, its corrective sidecar (.correctives.json, docs/contracts/corrective-morphs.md)
and its .json report. Nothing is overwritten.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
import trimesh

import correctives
from body import PROJECT, VIEWER, RestBody, evaluate_rest_body, load_model
from garment_glb import write_garment_glb
from generate_tshirt import NEUTRAL_AVATAR, new_file, topology_report, verify_glb_matches_body
from pants import OPENINGS, PANTS_2_1_FIELDS, PANTS_V2_CORRECTIVE_RULES, PANTS_V2_RULES, PANTS_V2_SPECS, REGION_NAMES, REGION_NAMES_V2, PantsRules, design_pants, leg_corrective_specs
from posing import load_asset
from tshirt import assemble, rules_record

MATERIAL = {"name": "Pants_Twill_PBR", "baseColor": [0.22, 0.27, 0.38, 1.0], "metalness": 0.0, "roughness": 0.9}
GARMENT_ID = "pants-basic-v1"
STRATEGY_V1 = "eased seat/thigh body offset, straight-leg tubes below the knee, midline crotch seam slab, surface nets extraction, smoothed clearance pass, v2 projection skin weights with a symmetric crotch blend, hip and knee flexion corrective morph targets"
VERSIONS: dict[str, dict[str, Any]] = {
    "v1": {"rules": PantsRules(), "specs": {}, "corrective_rules": {}, "regions": REGION_NAMES, "strategy": STRATEGY_V1},
    "v2": {"rules": PANTS_V2_RULES, "specs": PANTS_V2_SPECS, "corrective_rules": PANTS_V2_CORRECTIVE_RULES, "regions": REGION_NAMES_V2,
           "strategy": STRATEGY_V1 + "; Sprint 2.1A: twist-folded crotch weights, diamond crotch gusset panel (relaxed rest triangles, harmonic weights), turned-in cuffs, membrane-energy correctives with triangle collision"},
}


def metadata(body: RestBody, rules: PantsRules, version: str = "v1", personal: bool = False) -> dict[str, Any]:
    exporters = sys.modules["exporters"]
    inverse = np.linalg.inv(exporters._skeleton_state_to_matrices(body.skeleton_state)).astype("<f4")
    defaults = PantsRules()  # Sprint 2.1A fields are recorded only when set, so v1 metadata stays byte-identical
    pants_rules = {k: v for k, v in rules.__dict__.items() if k != "fit" and (k not in PANTS_2_1_FIELDS or v != getattr(defaults, k))}
    return {
        "schemaVersion": 1,
        "garmentId": f"pants-basic-{version}",
        "category": "pants",
        "displayName": "Basic straight-leg pants (procedural)",
        "units": "meters",
        "upAxis": "+Y",
        "forwardAxis": "+Z",
        "bodyVariant": body.variant,
        "retargetedFrom": "neutral" if personal else None,
        "skeleton": {"standard": "MHR", "jointCount": len(body.joint_names), "rootJoint": body.joint_names[0], "inverseBindSha256": hashlib.sha256(inverse.tobytes()).hexdigest()},
        "regions": list(VERSIONS[version]["regions"]),
        "openings": list(OPENINGS),
        "thicknessM": rules.fit.thickness_m,
        "material": {"model": "pbr-metallic-roughness", "baseColor": "#384561", "metalness": MATERIAL["metalness"], "roughness": MATERIAL["roughness"], "colorAdjustable": True},
        "fit": {"strategy": VERSIONS[version]["strategy"], "rules": {**pants_rules, "fit": rules_record(rules.fit)}},
        "provenance": {"generator": "services/garments/generate_pants.py", "sourceBody": "Official MHR model evaluated in its rest pose (Apache-2.0)", "personalData": personal},
        "revision": version,
    }


def write(directory: Path, body: RestBody, garment: Any, rules: PantsRules, version: str, name: str, avatar_path: Path, personal: bool, extra: dict[str, Any]) -> dict[str, Any]:
    """Assemble, solve the leg correctives against `avatar_path`, and write the GLB, sidecar and report."""
    arrays = assemble(garment, rules.fit.thickness_m)
    glb = new_file(directory / f"{name}.glb")
    info = metadata(body, rules, version, personal)
    avatar = load_asset(avatar_path)
    specs = leg_corrective_specs(**VERSIONS[version]["specs"])
    morphs, corrective_report = correctives.solve_specs(arrays, garment.vertices, garment.faces, avatar.skeleton, avatar, specs, correctives.CorrectiveRules(**VERSIONS[version]["corrective_rules"]))
    new_file(glb.with_name(glb.stem + ".correctives.json")).write_text(json.dumps(correctives.spec_sidecar(specs, avatar.skeleton), indent=2) + "\n", encoding="utf-8")
    write_garment_glb(glb, arrays, body, info, MATERIAL, morphs)
    report = {"garment": info, "topology": topology_report(arrays), "fit_report": garment.report, "correctives": corrective_report, **extra}
    new_file(glb.with_suffix(".json")).write_text(json.dumps(report, indent=2, default=float), encoding="utf-8")
    print(f"Wrote {glb}")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--version", choices=sorted(VERSIONS), default="v1")
    parser.add_argument("--reconstruction", type=Path, help="SAM reconstruction.npz whose identity (and scales) to fit (v2 only)")
    parser.add_argument("--out-dir", type=Path, default=PROJECT / "outputs" / "garments")
    parser.add_argument("--personal-only", action="store_true", help="with --reconstruction, skip the neutral pants (Sprint 2.3A personal folder)")
    args = parser.parse_args()
    started = time.perf_counter()
    version = VERSIONS[args.version]
    rules = version["rules"]
    neutral = evaluate_rest_body(load_model(), "neutral")
    sys.path.insert(0, str(VIEWER))
    import exporters  # noqa: F401  (registers the official exporter module)

    match = verify_glb_matches_body(NEUTRAL_AVATAR, neutral)
    garment, _ = design_pants(neutral, rules)
    name = f"pants-basic-{args.version}-mhr-neutral"
    if not args.personal_only and not (args.out_dir / f"{name}.glb").exists():  # as generate_tshirt: never overwritten
        report = write(args.out_dir, neutral, garment, rules, args.version, name, NEUTRAL_AVATAR, False, {"neutral_avatar_match": match})
        print(json.dumps({"topology": report["topology"], "clearance": garment.report["clearance"], "landmarks": garment.report["landmarks"]}, indent=2, default=float))
    if args.reconstruction:
        if args.version == "v1":
            parser.error("personal pants are generated from v2 on (Sprint 2.3A)")
        from generate_tshirt import AVATAR_DIR, rest_body_glb
        from tshirt import BodySurface, enforce_clearance, retarget

        stem = args.reconstruction.resolve().parent.name
        for variant in ("personal-identity", "personal-identity-scale"):
            body = evaluate_rest_body(load_model(), variant, args.reconstruction, floor_align=True)  # as the v2+ T-shirt
            suffix = "rest-identity" if variant == "personal-identity" else "rest-identity-scale"
            if body.floor_offset_m:
                suffix += "-floor"
            avatar_path = AVATAR_DIR / f"{stem}-{suffix}.glb"
            body_report = rest_body_glb(body, avatar_path)  # reuses the existing personal avatar only if identical
            moved = retarget(garment, neutral, body, rules.fit)
            surface = BodySurface(body, rules.fit.body_samples, rules.fit.seed)
            mesh = trimesh.Trimesh(moved.vertices, moved.faces, process=False)
            clearance = enforce_clearance(mesh, surface, rules.fit, np.zeros(len(moved.vertices), dtype=bool))
            moved.vertices = np.array(mesh.vertices)
            moved.report.update({"clearance": clearance, "body_floor_offset_m": body.floor_offset_m})
            from personal_fit import collapse_degenerate  # Sprint 2.3A: degenerate clean-up before skinning

            moved, moved.report["degenerate_cleanup"] = collapse_degenerate(moved, len(body.joint_names))
            personal = write(args.out_dir, body, moved, rules, args.version, f"pants-basic-{args.version}-{stem}-{suffix}", avatar_path, True, {"body_glb_validation": body_report})
            print(variant, json.dumps({"topology": personal["topology"], "clearance": clearance}, default=float))
    print(f"Total {time.perf_counter() - started:.1f} s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
