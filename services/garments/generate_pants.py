"""Generate the basic straight-leg pants for the neutral MHR body (Sprint 2.0A).

    python generate_pants.py [--out-dir outputs/garments]

Writes pants-basic-v1-mhr-neutral.glb, its corrective sidecar (.correctives.json, docs/contracts/corrective-morphs.md)
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

import correctives
from body import PROJECT, VIEWER, RestBody, evaluate_rest_body, load_model
from garment_glb import write_garment_glb
from generate_tshirt import NEUTRAL_AVATAR, new_file, topology_report, verify_glb_matches_body
from pants import OPENINGS, REGION_NAMES, PantsRules, design_pants, leg_corrective_specs
from posing import load_asset
from tshirt import assemble, rules_record

MATERIAL = {"name": "Pants_Twill_PBR", "baseColor": [0.22, 0.27, 0.38, 1.0], "metalness": 0.0, "roughness": 0.9}
GARMENT_ID = "pants-basic-v1"


def metadata(body: RestBody, rules: PantsRules) -> dict[str, Any]:
    exporters = sys.modules["exporters"]
    inverse = np.linalg.inv(exporters._skeleton_state_to_matrices(body.skeleton_state)).astype("<f4")
    pants_rules = {k: v for k, v in rules.__dict__.items() if k != "fit"}
    return {
        "schemaVersion": 1,
        "garmentId": GARMENT_ID,
        "category": "pants",
        "displayName": "Basic straight-leg pants (procedural)",
        "units": "meters",
        "upAxis": "+Y",
        "forwardAxis": "+Z",
        "bodyVariant": body.variant,
        "retargetedFrom": None,
        "skeleton": {"standard": "MHR", "jointCount": len(body.joint_names), "rootJoint": body.joint_names[0], "inverseBindSha256": hashlib.sha256(inverse.tobytes()).hexdigest()},
        "regions": list(REGION_NAMES),
        "openings": list(OPENINGS),
        "thicknessM": rules.fit.thickness_m,
        "material": {"model": "pbr-metallic-roughness", "baseColor": "#384561", "metalness": MATERIAL["metalness"], "roughness": MATERIAL["roughness"], "colorAdjustable": True},
        "fit": {"strategy": "eased seat/thigh body offset, straight-leg tubes below the knee, midline crotch seam slab, surface nets extraction, smoothed clearance pass, v2 projection skin weights with a symmetric crotch blend, hip and knee flexion corrective morph targets", "rules": {**pants_rules, "fit": rules_record(rules.fit)}},
        "provenance": {"generator": "services/garments/generate_pants.py", "sourceBody": "Official MHR model evaluated in its rest pose (Apache-2.0)", "personalData": False},
        "revision": "v1",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out-dir", type=Path, default=PROJECT / "outputs" / "garments")
    args = parser.parse_args()
    started = time.perf_counter()
    rules = PantsRules()
    neutral = evaluate_rest_body(load_model(), "neutral")
    sys.path.insert(0, str(VIEWER))
    import exporters  # noqa: F401  (registers the official exporter module)

    match = verify_glb_matches_body(NEUTRAL_AVATAR, neutral)
    garment, _ = design_pants(neutral, rules)
    arrays = assemble(garment, rules.fit.thickness_m)
    glb = new_file(args.out_dir / f"{GARMENT_ID}-mhr-neutral.glb")
    info = metadata(neutral, rules)
    avatar = load_asset(NEUTRAL_AVATAR)
    specs = leg_corrective_specs()
    morphs, corrective_report = correctives.solve_specs(arrays, garment.vertices, garment.faces, avatar.skeleton, avatar, specs)
    new_file(glb.with_name(glb.stem + ".correctives.json")).write_text(json.dumps(correctives.spec_sidecar(specs), indent=2) + "\n", encoding="utf-8")
    write_garment_glb(glb, arrays, neutral, info, MATERIAL, morphs)
    report = {"garment": info, "topology": topology_report(arrays), "fit_report": garment.report, "correctives": corrective_report, "neutral_avatar_match": match}
    new_file(glb.with_suffix(".json")).write_text(json.dumps(report, indent=2, default=float), encoding="utf-8")
    print(f"Wrote {glb}")
    print(json.dumps({"topology": report["topology"], "clearance": garment.report["clearance"], "landmarks": garment.report["landmarks"]}, indent=2, default=float))
    print(f"Total {time.perf_counter() - started:.1f} s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
