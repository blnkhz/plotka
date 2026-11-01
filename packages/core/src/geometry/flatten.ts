import type { Vec2 } from './vec2';

const MAX_DEPTH = 16;

/**
 * Adaptive cubic Bezier flattening. Subdivides until the control points are within
 * `tolerance` of the chord, so tight curves get more points and gentle ones fewer.
 * Appends points after p0 (p0 itself is not pushed).
 */
export function flattenCubic(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  tolerance: number,
  out: Vec2[],
  depth = 0,
): void {
  if (depth >= MAX_DEPTH || isFlat(p0, p1, p2, p3, tolerance)) {
    out.push(p3);
    return;
  }
  // de Casteljau split at t = 0.5
  const p01 = mid(p0, p1);
  const p12 = mid(p1, p2);
  const p23 = mid(p2, p3);
  const p012 = mid(p01, p12);
  const p123 = mid(p12, p23);
  const m = mid(p012, p123);
  flattenCubic(p0, p01, p012, m, tolerance, out, depth + 1);
  flattenCubic(m, p123, p23, p3, tolerance, out, depth + 1);
}

/** Quadratic Bezier, elevated to cubic. */
export function flattenQuadratic(
  p0: Vec2,
  c: Vec2,
  p2: Vec2,
  tolerance: number,
  out: Vec2[],
): void {
  const c1 = { x: p0.x + (2 / 3) * (c.x - p0.x), y: p0.y + (2 / 3) * (c.y - p0.y) };
  const c2 = { x: p2.x + (2 / 3) * (c.x - p2.x), y: p2.y + (2 / 3) * (c.y - p2.y) };
  flattenCubic(p0, c1, c2, p2, tolerance, out);
}

const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function isFlat(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, tol: number): boolean {
  // Distance of both control points from the chord p0-p3. If the chord is degenerate,
  // fall back to distance from p0.
  const dx = p3.x - p0.x;
  const dy = p3.y - p0.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) {
    return (
      Math.hypot(p1.x - p0.x, p1.y - p0.y) <= tol && Math.hypot(p2.x - p0.x, p2.y - p0.y) <= tol
    );
  }
  const d1 = Math.abs((p1.x - p0.x) * dy - (p1.y - p0.y) * dx) / len;
  const d2 = Math.abs((p2.x - p0.x) * dy - (p2.y - p0.y) * dx) / len;
  // Also guard against control points that run past the ends of the chord (loops/cusps).
  const t1 = ((p1.x - p0.x) * dx + (p1.y - p0.y) * dy) / (len * len);
  const t2 = ((p2.x - p0.x) * dx + (p2.y - p0.y) * dy) / (len * len);
  const overshoot = Math.max(0, -t1, t1 - 1, -t2, t2 - 1) * len;
  return Math.max(d1, d2, overshoot) <= tol;
}
