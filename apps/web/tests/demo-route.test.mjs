import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { GET, HEAD } from "../app/api/demo-garment/route.ts";

const request = (variant, suffix = "") => new Request(`http://localhost/api/demo-garment?variant=${variant}${suffix}`);
assert.equal((await HEAD(request("unknown"))).status, 400);
const pantsPresent = existsSync(new URL("../../../outputs/garments/pants-basic-v1-mhr-neutral.glb", import.meta.url));
const pants = await HEAD(request("pants"));
assert.equal(pants.status, pantsPresent ? 200 : 404);
assert.equal(await pants.text(), "", "availability checks must not download the GLB");
const sidecarPresent = existsSync(new URL("../../../outputs/garments/experiments/tshirt-v5-mhr-neutral.correctives.json", import.meta.url));
const v5 = await GET(request("v5", "&sidecar=1"));
assert.equal(v5.status, sidecarPresent ? 200 : 404);
if (sidecarPresent) assert.equal((await v5.json()).version, 1);
console.log("Garment route HEAD and optional sidecar checks passed");
