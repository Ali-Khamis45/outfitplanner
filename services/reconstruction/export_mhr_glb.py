"""Export the neutral MHR state through the official local viewer API."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen


def request(path: str, payload: dict[str, object] | None = None) -> bytes:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = Request(f"http://127.0.0.1:8891{path}", data=data, headers={"Content-Type": "application/json"})
    try:
        with urlopen(req, timeout=180) as response:
            return response.read()
    except (OSError, URLError) as exc:
        raise RuntimeError(f"MHR viewer request {path} failed: {exc}") from exc


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="Destination GLB in the ignored outputs directory")
    args = parser.parse_args()
    root = (Path(__file__).resolve().parents[2] / "outputs").resolve()
    output = args.output.resolve()
    if root not in output.parents or output.suffix.lower() != ".glb":
        parser.error("output must be a .glb file under this project's outputs directory")
    # The viewer owns one shared state; reset and configure it before export.
    request("/api/configure", {"lod": 1, "snapToGround": False, "applyCorrectives": True})
    request("/api/deform", {"action": "reset_all", "group": "pose", "index": 0})
    payload = request("/api/export/glb")
    if payload[:4] != b"glTF":
        raise RuntimeError("Viewer did not return a binary glTF file")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(payload)
    print(f"Saved {len(payload)} bytes to {output}")


if __name__ == "__main__":
    main()
