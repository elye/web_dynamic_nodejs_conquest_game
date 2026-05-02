// Pointy-top hex grid utilities using axial coordinates (q, r)
// Reference: https://www.redblobgames.com/grids/hexagons/

export const DEFAULT_HEX_SIZE = 30;

const SQRT3 = Math.sqrt(3);

/** Convert axial hex coords to pixel position (pointy-top). */
export function hexToPixel(
  q: number,
  r: number,
  size: number = DEFAULT_HEX_SIZE,
): { x: number; y: number } {
  const x = size * (SQRT3 * q + (SQRT3 / 2) * r);
  const y = size * ((3 / 2) * r);
  return { x, y };
}

/** Convert pixel position to nearest axial hex coords (pointy-top). */
export function pixelToHex(
  x: number,
  y: number,
  size: number = DEFAULT_HEX_SIZE,
): { q: number; r: number } {
  const q = ((SQRT3 / 3) * x - (1 / 3) * y) / size;
  const r = ((2 / 3) * y) / size;
  return axialRound(q, r);
}

/** Round fractional axial coords to nearest hex. */
function axialRound(q: number, r: number): { q: number; r: number } {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);

  const qDiff = Math.abs(rq - q);
  const rDiff = Math.abs(rr - r);
  const sDiff = Math.abs(rs - s);

  if (qDiff > rDiff && qDiff > sDiff) {
    rq = -rr - rs;
  } else if (rDiff > sDiff) {
    rr = -rq - rs;
  }

  return { q: rq, r: rr };
}

/** Return the 6 corner points of a pointy-top hexagon. */
export function getHexCorners(
  centerX: number,
  centerY: number,
  size: number = DEFAULT_HEX_SIZE,
): { x: number; y: number }[] {
  const corners: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i - 30; // pointy-top starts at -30°
    const angleRad = (Math.PI / 180) * angleDeg;
    corners.push({
      x: centerX + size * Math.cos(angleRad),
      y: centerY + size * Math.sin(angleRad),
    });
  }
  return corners;
}

/** Return a Path2D for a pointy-top hexagon. */
export function getHexPath(
  centerX: number,
  centerY: number,
  size: number = DEFAULT_HEX_SIZE,
): Path2D {
  const corners = getHexCorners(centerX, centerY, size);
  const path = new Path2D();
  path.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 6; i++) {
    path.lineTo(corners[i].x, corners[i].y);
  }
  path.closePath();
  return path;
}

/** Get axial hex neighbors. */
export function getHexNeighbors(q: number, r: number): { q: number; r: number }[] {
  return [
    { q: q + 1, r: r },
    { q: q - 1, r: r },
    { q: q, r: r + 1 },
    { q: q, r: r - 1 },
    { q: q + 1, r: r - 1 },
    { q: q - 1, r: r + 1 },
  ];
}
