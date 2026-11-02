import type { Vec2 } from './vec2';

/** 2D affine matrix [a b c d e f], same layout as SVG: x' = a*x + c*y + e, y' = b*x + d*y + f. */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Returns m1 * m2 (apply m2 first, then m1). */
export function multiply(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function applyToPoint(m: Matrix, x: number, y: number): Vec2 {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

export const translate = (tx: number, ty = 0): Matrix => [1, 0, 0, 1, tx, ty];
export const scaleMatrix = (sx: number, sy = sx): Matrix => [sx, 0, 0, sy, 0, 0];
export function rotate(deg: number, cx = 0, cy = 0): Matrix {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const m: Matrix = [cos, sin, -sin, cos, 0, 0];
  if (cx === 0 && cy === 0) return m;
  return multiply(translate(cx, cy), multiply(m, translate(-cx, -cy)));
}
export const skewX = (deg: number): Matrix => [1, 0, Math.tan((deg * Math.PI) / 180), 1, 0, 0];
export const skewY = (deg: number): Matrix => [1, Math.tan((deg * Math.PI) / 180), 0, 1, 0, 0];

/** Approximate uniform scale factor of a matrix (geometric mean of axis scales). */
export function matrixScale(m: Matrix): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

/** Inverse of an affine matrix. Throws for a degenerate (non-invertible) matrix. */
export function invert(m: Matrix): Matrix {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-15) throw new Error('Matrix is not invertible');
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}
