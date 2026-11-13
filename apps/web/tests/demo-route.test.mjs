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
for (const [variant, path] of [["v5.1", "garments/experiments/tshirt-v5.1-mhr-neutral.glb"], ["v5.2", "garments/experiments/tshirt-v5.2-mhr-neutral.glb"], ["pants-v2", "garments/pants-basic-v2-mhr-neutral.glb"]]) {
  const exists = existsSync(new URL(`../../../outputs/${path}`, import.meta.url));
  assert.equal((await HEAD(request(variant))).status, exists ? 200 : 404);
  const sidecar = await GET(request(variant, "&sidecar=1"));
  const sidecarExists = existsSync(new URL(`../../../outputs/${path.replace(/\.glb$/, ".correctives.json")}`, import.meta.url));
  assert.equal(sidecar.status, sidecarExists ? 200 : 404);
  if (sidecarExists) assert.equal((await sidecar.json()).version, 2, `${variant} should use the re-issued signed sidecar`);
}
console.log("Garment route HEAD and optional sidecar checks passed");
