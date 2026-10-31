/**
 * Garment deformation diagnostics over plain typed arrays (shared by Node tests; usable by a future overlay).
 * Positions are xyz triplets; `index` is a triangle list. Body penetration is approximate (nearest body vertex).
 */

export interface SkinArrays { joints: ArrayLike<number>; weights: ArrayLike<number>; boneMatrices: ArrayLike<number> }

export interface TriangleDeformation {
  /** Largest posed/rest edge-length ratio per triangle. */
  stretch: Float64Array;
  /** Smallest posed/rest edge-length ratio per triangle. */
  compression: Float64Array;
  areaRatio: Float64Array;
  /** Angle between the posed normal and the rest normal carried by the triangle's own skinning transform. */
  normalDeviationDeg: Float64Array;
  flipped: Uint8Array;
  degenerate: Uint8Array;
}

const cross = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): [number, number, number] => [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];

function blendLinear(skin: SkinArrays, vertex: number, out: Float64Array): void {
  out.fill(0);
  for (let k = 0; k < 4; k++) {
    const w = skin.weights[vertex * 4 + k];
    if (w === 0) continue;
    const m = skin.joints[vertex * 4 + k] * 16;
    for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) out[col * 3 + row] += w * skin.boneMatrices[m + col * 4 + row];
  }
}

export function triangleDeformation(rest: ArrayLike<number>, posed: ArrayLike<number>, index: ArrayLike<number>, skin: SkinArrays): TriangleDeformation {
  const count = index.length / 3;
  const result: TriangleDeformation = { stretch: new Float64Array(count), compression: new Float64Array(count), areaRatio: new Float64Array(count), normalDeviationDeg: new Float64Array(count), flipped: new Uint8Array(count), degenerate: new Uint8Array(count) };
  const blend = new Float64Array(9), sum = new Float64Array(9);
  for (let t = 0; t < count; t++) {
    const v = [index[t * 3], index[t * 3 + 1], index[t * 3 + 2]];
    let maxRatio = 0, minRatio = Infinity;
    for (let e = 0; e < 3; e++) {
      const a = v[e] * 3, b = v[(e + 1) % 3] * 3;
      const restLength = Math.hypot(rest[a] - rest[b], rest[a + 1] - rest[b + 1], rest[a + 2] - rest[b + 2]);
      const posedLength = Math.hypot(posed[a] - posed[b], posed[a + 1] - posed[b + 1], posed[a + 2] - posed[b + 2]);
      const ratio = restLength > 1e-9 ? posedLength / restLength : 1;
      maxRatio = Math.max(maxRatio, ratio); minRatio = Math.min(minRatio, ratio);
    }
    const [a, b, c] = v.map((i) => i * 3);
    const nr = cross(rest[b] - rest[a], rest[b + 1] - rest[a + 1], rest[b + 2] - rest[a + 2], rest[c] - rest[a], rest[c + 1] - rest[a + 1], rest[c + 2] - rest[a + 2]);
    const np = cross(posed[b] - posed[a], posed[b + 1] - posed[a + 1], posed[b + 2] - posed[a + 2], posed[c] - posed[a], posed[c + 1] - posed[a + 1], posed[c + 2] - posed[a + 2]);
    const restArea = Math.hypot(...nr) / 2, posedArea = Math.hypot(...np) / 2;
    sum.fill(0);
    for (const vertex of v) { blendLinear(skin, vertex, blend); for (let i = 0; i < 9; i++) sum[i] += blend[i]; }
    const expected = [sum[0] * nr[0] + sum[3] * nr[1] + sum[6] * nr[2], sum[1] * nr[0] + sum[4] * nr[1] + sum[7] * nr[2], sum[2] * nr[0] + sum[5] * nr[1] + sum[8] * nr[2]];
    const denominator = Math.hypot(...expected) * Math.hypot(...np);
    const cosine = denominator > 0 ? (expected[0] * np[0] + expected[1] * np[1] + expected[2] * np[2]) / denominator : 1;
    result.stretch[t] = maxRatio;
    result.compression[t] = minRatio;
    result.areaRatio[t] = restArea > 1e-14 ? posedArea / restArea : 1;
    result.normalDeviationDeg[t] = (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI;
    result.flipped[t] = cosine < 0 ? 1 : 0;
    result.degenerate[t] = restArea > 1e-14 && posedArea < restArea * 1e-3 ? 1 : 0;
  }
  return result;
}

export function percentile(values: ArrayLike<number>, p: number): number {
  const sorted = Float64Array.from(values).sort();
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : NaN;
}

export function maxOf(values: ArrayLike<number>): number { let m = -Infinity; for (let i = 0; i < values.length; i++) if (values[i] > m) m = values[i]; return m; }
export function minOf(values: ArrayLike<number>): number { let m = Infinity; for (let i = 0; i < values.length; i++) if (values[i] < m) m = values[i]; return m; }
export function countWhere(values: ArrayLike<number>, predicate: (value: number) => boolean): number { let n = 0; for (let i = 0; i < values.length; i++) if (predicate(values[i])) n++; return n; }

/** Canonical vertex ids by position, so split seam/rim copies count as one vertex. */
export function weldIds(positions: ArrayLike<number>): Int32Array {
  const ids = new Int32Array(positions.length / 3), seen = new Map<string, number>();
  for (let i = 0; i < ids.length; i++) {
    const key = `${Math.round(positions[i * 3] * 1e6)},${Math.round(positions[i * 3 + 1] * 1e6)},${Math.round(positions[i * 3 + 2] * 1e6)}`;
    const existing = seen.get(key);
    if (existing === undefined) { seen.set(key, i); ids[i] = i; } else ids[i] = existing;
  }
  return ids;
}

function segmentHitsTriangle(p: ArrayLike<number>, s0: number, s1: number, t0: number, t1: number, t2: number): boolean {
  const ox = p[s0], oy = p[s0 + 1], oz = p[s0 + 2];
  const dx = p[s1] - ox, dy = p[s1 + 1] - oy, dz = p[s1 + 2] - oz;
  const e1x = p[t1] - p[t0], e1y = p[t1 + 1] - p[t0 + 1], e1z = p[t1 + 2] - p[t0 + 2];
  const e2x = p[t2] - p[t0], e2y = p[t2 + 1] - p[t0 + 1], e2z = p[t2 + 2] - p[t0 + 2];
  const [hx, hy, hz] = cross(dx, dy, dz, e2x, e2y, e2z);
  const det = e1x * hx + e1y * hy + e1z * hz;
  if (Math.abs(det) < 1e-14) return false;
  const inv = 1 / det, sx = ox - p[t0], sy = oy - p[t0 + 1], sz = oz - p[t0 + 2];
  const u = inv * (sx * hx + sy * hy + sz * hz);
  if (u < 0 || u > 1) return false;
  const [qx, qy, qz] = cross(sx, sy, sz, e1x, e1y, e1z);
  const w = inv * (dx * qx + dy * qy + dz * qz);
  if (w < 0 || u + w > 1) return false;
  const t = inv * (e2x * qx + e2y * qy + e2z * qz);
  return t > 1e-6 && t < 1 - 1e-6;
}

/** Exact triangle–triangle intersection over a uniform grid; pairs sharing a (welded) vertex are skipped. */
export function selfIntersections(positions: ArrayLike<number>, index: ArrayLike<number>, welded: Int32Array, cell = 0.01): { pairs: number; triangles: Uint8Array } {
  const count = index.length / 3, grid = new Map<number, number[]>();
  const hash = (x: number, y: number, z: number) => ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) | 0;
  for (let t = 0; t < count; t++) {
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < 3; k++) for (let d = 0; d < 3; d++) { const value = positions[index[t * 3 + k] * 3 + d]; lo[d] = Math.min(lo[d], value); hi[d] = Math.max(hi[d], value); }
    lo = lo.map((value) => Math.floor(value / cell)); hi = hi.map((value) => Math.floor(value / cell));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      const key = hash(x, y, z);
      const bucket = grid.get(key);
      if (bucket) bucket.push(t); else grid.set(key, [t]);
    }
  }
  const tested = new Set<number>(), hit = new Uint8Array(count);
  let pairs = 0;
  for (const bucket of grid.values()) {
    for (let i = 0; i < bucket.length; i++) for (let j = i + 1; j < bucket.length; j++) {
      const a = Math.min(bucket[i], bucket[j]), b = Math.max(bucket[i], bucket[j]);
      const key = a * count + b;
      if (tested.has(key)) continue;
      tested.add(key);
      const va = [welded[index[a * 3]], welded[index[a * 3 + 1]], welded[index[a * 3 + 2]]];
      const vb = [welded[index[b * 3]], welded[index[b * 3 + 1]], welded[index[b * 3 + 2]]];
      if (va.some((value) => vb.includes(value))) continue;
      const ia = [index[a * 3] * 3, index[a * 3 + 1] * 3, index[a * 3 + 2] * 3], ib = [index[b * 3] * 3, index[b * 3 + 1] * 3, index[b * 3 + 2] * 3];
      let crossing = false;
      for (let e = 0; e < 3 && !crossing; e++) crossing = segmentHitsTriangle(positions, ia[e], ia[(e + 1) % 3], ib[0], ib[1], ib[2]) || segmentHitsTriangle(positions, ib[e], ib[(e + 1) % 3], ia[0], ia[1], ia[2]);
      if (crossing) { pairs++; hit[a] = 1; hit[b] = 1; }
    }
  }
  return { pairs, triangles: hit };
}

/** Approximate garment-body penetration: signed distance to the nearest posed body vertex along its normal. */
export function bodyPenetration(body: ArrayLike<number>, bodyIndex: ArrayLike<number>, garment: ArrayLike<number>, cell = 0.03): Float64Array {
  const normals = new Float64Array(body.length);
  for (let f = 0; f < bodyIndex.length; f += 3) {
    const [a, b, c] = [bodyIndex[f] * 3, bodyIndex[f + 1] * 3, bodyIndex[f + 2] * 3];
    const n = cross(body[b] - body[a], body[b + 1] - body[a + 1], body[b + 2] - body[a + 2], body[c] - body[a], body[c + 1] - body[a + 1], body[c + 2] - body[a + 2]);
    for (const p of [a, b, c]) { normals[p] += n[0]; normals[p + 1] += n[1]; normals[p + 2] += n[2]; }
  }
  const grid = new Map<string, number[]>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  for (let i = 0; i < body.length / 3; i++) {
    const k = key(Math.floor(body[i * 3] / cell), Math.floor(body[i * 3 + 1] / cell), Math.floor(body[i * 3 + 2] / cell));
    const bucket = grid.get(k);
    if (bucket) bucket.push(i); else grid.set(k, [i]);
  }
  const signed = new Float64Array(garment.length / 3);
  for (let q = 0; q < signed.length; q++) {
    const x = garment[q * 3], y = garment[q * 3 + 1], z = garment[q * 3 + 2];
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    let best = -1, bestDistance = Infinity;
    for (let radius = 1; radius <= 6 && best < 0; radius++) {
      for (let i = -radius; i <= radius; i++) for (let j = -radius; j <= radius; j++) for (let k = -radius; k <= radius; k++) {
        for (const v of grid.get(key(cx + i, cy + j, cz + k)) ?? []) {
          const d = (body[v * 3] - x) ** 2 + (body[v * 3 + 1] - y) ** 2 + (body[v * 3 + 2] - z) ** 2;
          if (d < bestDistance) { bestDistance = d; best = v; }
        }
      }
    }
    if (best < 0) { signed[q] = Infinity; continue; }
    const b = best * 3, length = Math.hypot(normals[b], normals[b + 1], normals[b + 2]) || 1;
    signed[q] = ((x - body[b]) * normals[b] + (y - body[b + 1]) * normals[b + 1] + (z - body[b + 2]) * normals[b + 2]) / length;
  }
  return signed;
}
