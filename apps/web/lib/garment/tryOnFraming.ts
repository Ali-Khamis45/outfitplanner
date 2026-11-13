/** Fit the avatar to the current viewport, with extra horizontal room for arms out. */
export function tryOnFraming(height: number, width: number, viewportWidth: number, viewportHeight: number, fov: number, armsOut: boolean) {
  const safeHeight = Math.max(height, 0.01);
  const aspect = viewportWidth / Math.max(viewportHeight, 1);
  const halfFov = fov * Math.PI / 360;
  const fittedWidth = width * (armsOut ? 1.5 : 1.05);
  // On short portrait screens reserve room for the bar; wide landscape puts it to the side.
  const barBesideBody = viewportHeight <= 300 && viewportWidth >= 600 && aspect >= 1.5;
  const coverage = barBesideBody ? 0.82 : Math.max(0.35, Math.min(0.82, (0.5 - 72 / Math.max(viewportHeight, 1)) / 0.43));
  const distance = Math.max(safeHeight / (2 * Math.tan(halfFov) * coverage), fittedWidth / (2 * Math.tan(halfFov) * 0.9 * Math.max(aspect, 0.2)));
  return { distance, targetYOffset: -safeHeight * 0.07 };
}
