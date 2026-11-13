"""Write outputs/garments/personal/manifest.json for the personal fit (Sprint 2.3A).

    python personal_manifest.py [--stem sam3d-person-front-sprint03-run2]

Schema (consumed by the web app; keep it exact):

    {"version": 1, "fit_date": "YYYY-MM-DD",
     "primary":   {"id", "label", "body", "top": {"glb", "sidecar"}, "bottom": {"glb", "sidecar"}},
     "secondary": [ same shape, ... ]}

The primary body is "identity + scales, ground-aligned"; identity-only is secondary. Paths are repository-relative with
forward slashes, all inside outputs/. The files are personal data: they stay local and git-ignored.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROJECT = Path(__file__).resolve().parents[2]
PERSONAL_DIR = PROJECT / "outputs" / "garments" / "personal"
# (manifest id, label, body suffix)
PRIMARY = ("personal-scaled", "My avatar", "rest-identity-scale-floor")
SECONDARY = (("personal-identity", "My avatar (identity only)", "rest-identity"),)
SHIRT_REVISION, PANTS_REVISION = "v5.2", "v2"


def _relative(path: Path) -> str:
    if not path.is_file():
        raise SystemExit(f"Missing personal fit file: {path}")
    return path.resolve().relative_to(PROJECT).as_posix()


def _body(stem: str, directory: Path, ident: str, label: str, suffix: str) -> dict[str, Any]:
    shirt = f"tshirt-{SHIRT_REVISION}-{stem}-{suffix}"  # plain strings: "v5.2" would confuse Path.with_suffix
    pants = f"pants-basic-{PANTS_REVISION}-{stem}-{suffix}"
    return {
        "id": ident,
        "label": label,
        "body": _relative(PROJECT / "outputs" / "avatars" / f"{stem}-{suffix}.glb"),
        "top": {"glb": _relative(directory / f"{shirt}.glb"), "sidecar": _relative(directory / f"{shirt}.correctives.json")},
        "bottom": {"glb": _relative(directory / f"{pants}.glb"), "sidecar": _relative(directory / f"{pants}.correctives.json")},
    }


def build(stem: str, directory: Path = PERSONAL_DIR) -> dict[str, Any]:
    entries = [PRIMARY, *SECONDARY]
    newest = max((directory / f"{prefix}-{stem}-{suffix}.glb").stat().st_mtime for _, _, suffix in entries for prefix in (f"tshirt-{SHIRT_REVISION}", f"pants-basic-{PANTS_REVISION}"))
    return {
        "version": 1,
        "fit_date": datetime.fromtimestamp(newest, tz=timezone.utc).date().isoformat(),
        "primary": _body(stem, directory, *PRIMARY),
        "secondary": [_body(stem, directory, *entry) for entry in SECONDARY],
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
