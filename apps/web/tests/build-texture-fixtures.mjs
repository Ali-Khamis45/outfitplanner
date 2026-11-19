import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
const dir = fileURLToPath(new URL("../../../outputs/wardrobe/test-textures/", import.meta.url));
await mkdir(dir, { recursive: true });
function chunk(name, data) {
  const type = Buffer.from(name), length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(data.length);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([type, data])) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0); return Buffer.concat([length, type, data, checksum]);
}
// UV layout v2: the torso occupies v=0..0.58; its front is centered at u=0.5.
// Body up is +v, so the F is drawn upside down in image coordinates.
// Stripes cover the whole atlas, including sleeves, legs, seat and gusset.
function texture(shirt, candidate = false) {
  const size = 2048, raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = y * (size * 4 + 1) + 1 + x * 4, stripe = y % 128 < 52;
    let rgb = stripe ? [41, 63, 112] : [233, 227, 213];
    const logoX = candidate ? x + 478 : x;
    if (shirt && logoX >= 980 && logoX < 1068 && y >= 570 && y < 760) {
      rgb = [232, 80, 53];
      if ((logoX >= 1000 && logoX < 1012 && y >= 600 && y < 730) || (logoX >= 1000 && logoX < 1050 && y >= 705 && y < 730) || (logoX >= 1000 && logoX < 1035 && y >= 650 && y < 675)) rgb = [255, 255, 255];
    }
    raw[offset] = rgb[0]; raw[offset + 1] = rgb[1]; raw[offset + 2] = rgb[2]; raw[offset + 3] = 255;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
for (const [item, template, fallback] of [["shirt", "tshirt-v5.2", "#e9e3d5"], ["pants", "pants-basic-v2", "#777f69"]]) {
  await writeFile(path.join(dir, `${item}.png`), texture(item === "shirt"));
  await writeFile(path.join(dir, `${item}.texture.json`), JSON.stringify({ version: 1, item, template, views: ["front", "back"], coverage: 1, fallback_hex: fallback, created_at: "2026-11-14" }, null, 2));
}
for (const [item, template, fallback] of [["shirt-v3", "tshirt-v5.3", "#e9e3d5"], ["pants-v3", "pants-v3", "#777f69"]]) {
  await writeFile(path.join(dir, `${item}.png`), texture(item === "shirt-v3", true));
  await writeFile(path.join(dir, `${item}.texture.json`), JSON.stringify({ version: 1, item, template, views: ["front", "back"], coverage: 1, fallback_hex: fallback, created_at: "2026-11-14" }, null, 2));
}
console.log(`Generated test textures in ${dir}`);
