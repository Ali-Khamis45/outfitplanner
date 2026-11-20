"""Write outputs/garments/personal/manifest.json for the personal fit (Sprint 2.3A; layout of Sprint 3A, garments of 3.6).

    python personal_manifest.py [--stem sam3d-person-front-sprint03-run2]

Schema (consumed by the web app; keep it exact):

    {"version": 1, "fit_date": "YYYY-MM-DD",
     "primary":   {"id", "label", "body", "top": {"glb", "sidecar"}, "bottom": {"glb", "sidecar"}},
     "secondary": [ same shape, ... ]}

Bodies and garments (the default generation, tshirt-v5.3 / pants-v3):
- Not calibrated (no outputs/avatars/measurements.json, or no calibrated avatar yet): the primary body is "identity +
  scales, ground-aligned", identity-only is secondary. Each wears its own base fit from outputs/garments/personal/.
- Calibrated (Sprint 3A): the primary body is the calibrated avatar. It has no base fit of its own, so it wears its
  recommended size files from outputs/garments/sizes/ (the .fit.json marked recommended). The uncalibrated body follows
  as "My avatar (photo estimate)", then identity-only; both wear their base fits.

Paths are repository-relative with forward slashes, all inside outputs/. The files are personal data: they stay local
and git-ignored.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROJECT = Path(__file__).resolve().parents[2]
PERSONAL_DIR = PROJECT / "outputs" / "garments" / "personal"
SIZES_DIR = PROJECT / "outputs" / "garments" / "sizes"
AVATARS = PROJECT / "outputs" / "avatars"
MEASUREMENTS = AVATARS / "measurements.json"
SHIRT_REVISION, PANTS_REVISION = "v5.3", "v3.1"
SCALED, IDENTITY = "rest-identity-scale-floor", "rest-identity"


def _relative(path: Path) -> str:
    if not path.is_file():
        raise SystemExit(f"Missing personal fit file: {path}")
    return path.resolve().relative_to(PROJECT).as_posix()


def _entry(ident: str, label: str, body: Path, top: Path, bottom: Path) -> dict[str, Any]:
    def part(glb: Path) -> dict[str, str]:
        return {"glb": _relative(glb), "sidecar": _relative(glb.with_name(glb.name[: -len(".glb")] + ".correctives.json"))}

    return {"id": ident, "label": label, "body": _relative(body), "top": part(top), "bottom": part(bottom)}


def _base_fit(stem: str, directory: Path, ident: str, label: str, suffix: str) -> dict[str, Any]:
    # plain strings: "v5.3" would confuse Path.with_suffix
    return _entry(ident, label, AVATARS / f"{stem}-{suffix}.glb", directory / f"tshirt-{SHIRT_REVISION}-{stem}-{suffix}.glb", directory / f"pants-basic-{PANTS_REVISION}-{stem}-{suffix}.glb")


def _recommended(garment: str, body_id: str, sizes: Path) -> Path:
    for fit in sorted(sizes.glob(f"{garment}-*-{body_id}.fit.json")):
        if json.loads(fit.read_text(encoding="utf-8")).get("recommended"):
            return fit.with_name(fit.name[: -len(".fit.json")] + ".glb")
    raise SystemExit(f"No recommended {garment} size for {body_id} in {sizes}")


def build(stem: str, directory: Path = PERSONAL_DIR, sizes: Path = SIZES_DIR) -> dict[str, Any]:
    calibrated = AVATARS / f"{stem}-{SCALED}-calibrated.glb"
    identity = _base_fit(stem, directory, "personal-identity", "My avatar (identity only)", IDENTITY)
    if MEASUREMENTS.is_file() and calibrated.is_file():
        primary = _entry("personal-scaled", "My avatar", calibrated, _recommended(f"tshirt-{SHIRT_REVISION}", "personal-scaled", sizes), _recommended(f"pants-{PANTS_REVISION}", "personal-scaled", sizes))
        secondary = [_base_fit(stem, directory, "personal-scaled-photo", "My avatar (photo estimate)", SCALED), identity]
    else:
        primary, secondary = _base_fit(stem, directory, "personal-scaled", "My avatar", SCALED), [identity]
    garments = [PROJECT / e[part]["glb"] for e in (primary, *secondary) for part in ("top", "bottom")]
    return {
        "version": 1,
        "fit_date": datetime.fromtimestamp(max(path.stat().st_mtime for path in garments), tz=timezone.utc).date().isoformat(),
        "primary": primary,
        "secondary": secondary,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--stem", default="sam3d-person-front-sprint03-run2", help="reconstruction run name")
    args = parser.parse_args()
    out = PERSONAL_DIR / "manifest.json"
    out.write_text(json.dumps(build(args.stem), indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
