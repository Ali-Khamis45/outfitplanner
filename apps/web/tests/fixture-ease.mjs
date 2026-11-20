// Synthetic local gap in mm, blended smoothly between garment regions by height.
// These are visual fixtures, not measurements of the source garment.
export function fixtureEase(garment, size, y) {
  const index = ["S", "M", "L", "XL"].indexOf(size);
  if (index < 0) throw new Error("Unknown fixture size");
  const levels = garment.startsWith("tshirt-")
    ? [[0.88, [-8, 8, 23, 38]], [1.02, [-10, 8, 24, 40]], [1.17, [-15, 5, 22, 40]], [1.34, [-24, 2, 22, 48]], [1.49, [-12, 8, 25, 42]]]
    : [[0.10, [-4, 7, 20, 34]], [0.48, [-6, 6, 20, 36]], [0.80, [-18, 5, 22, 42]], [0.96, [-22, 4, 20, 40]]];
  if (y <= levels[0][0]) return levels[0][1][index];
  for (let i = 1; i < levels.length; i++) {
    const [end, values] = levels[i], [start, previous] = levels[i - 1];
    if (y <= end) { const t = (y - start) / (end - start), smooth = t * t * (3 - 2 * t); return previous[index] + (values[index] - previous[index]) * smooth; }
  }
  return levels.at(-1)[1][index];
}
