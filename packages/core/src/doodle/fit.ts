import type { Vec2 } from '../geometry/vec2';

/** A cubic Bézier: start, two control points, end. */
export type Cubic = [Vec2, Vec2, Vec2, Vec2];

const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y;
const len = (a: Vec2) => Math.hypot(a.x, a.y);
const norm = (a: Vec2): Vec2 => {
  const l = len(a);
  return l > 1e-12 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};

export function bezierPoint(c: Cubic, t: number): Vec2 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const d = 3 * u * t * t;
  const e = t * t * t;
  return {
    x: a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x,
    y: a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y,
  };
}

/**
 * Ramer–Douglas–Peucker: drops points closer than `tolerance` to the simplified line.
 * Keeps the first and last points.
 */
export function simplifyLines(points: Vec2[], tolerance: number): Vec2[] {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    const a = points[i]!;
    const ab = sub(points[j]!, a);
    const l2 = dot(ab, ab);
    let best = -1;
    let bestD = tolerance;
    for (let k = i + 1; k < j; k++) {
      const ap = sub(points[k]!, a);
      const t = l2 > 0 ? Math.max(0, Math.min(1, dot(ap, ab) / l2)) : 0;
      const d = len(sub(ap, mul(ab, t)));
      if (d > bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([i, best], [best, j]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Fits cubic Béziers through points within `tolerance` (mm), after Philip J. Schneider's
 * "An Algorithm for Automatically Fitting Digitized Curves" (Graphics Gems, 1990):
 * least-squares control points with chord-length parameters, Newton–Raphson reparameterization,
 * and splitting at the worst point with a shared tangent so the joins stay smooth.
 */
export function fitCubics(points: Vec2[], tolerance: number): Cubic[] {
  const pts = dedupe(points);
  if (pts.length < 2) return [];
  if (pts.length === 2) return [line(pts[0]!, pts[1]!)];
  const t1 = norm(sub(pts[1]!, pts[0]!));
  const t2 = norm(sub(pts[pts.length - 2]!, pts[pts.length - 1]!));
  const out: Cubic[] = [];
  fitRange(pts, 0, pts.length - 1, t1, t2, tolerance, out, 0);
  return out;
}

const line = (a: Vec2, b: Vec2): Cubic => {
  const d = sub(b, a);
  return [a, add(a, mul(d, 1 / 3)), add(a, mul(d, 2 / 3)), b];
};

function dedupe(points: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of points) {
    const q = out[out.length - 1];
    if (!q || len(sub(p, q)) > 1e-9) out.push(p);
  }
  return out;
}

const MAX_DEPTH = 40;

function fitRange(
  pts: Vec2[],
  first: number,
  last: number,
  tHat1: Vec2,
  tHat2: Vec2,
  tol: number,
  out: Cubic[],
  depth: number,
) {
  const n = last - first + 1;
  if (n === 2) {
    const d = len(sub(pts[last]!, pts[first]!)) / 3;
    out.push([
      pts[first]!,
      add(pts[first]!, mul(tHat1, d)),
      add(pts[last]!, mul(tHat2, d)),
      pts[last]!,
    ]);
    return;
  }
  let u = chordParams(pts, first, last);
  let bez = generate(pts, first, last, u, tHat1, tHat2);
  let [err, split] = maxError(pts, first, last, bez, u);
  const tol2 = tol * tol;
  if (err < tol2) {
    out.push(bez);
    return;
  }
  if (err < tol2 * 16) {
    for (let i = 0; i < 4; i++) {
      u = reparameterize(pts, first, last, u, bez);
      bez = generate(pts, first, last, u, tHat1, tHat2);
      [err, split] = maxError(pts, first, last, bez, u);
      if (err < tol2) {
        out.push(bez);
        return;
      }
    }
  }
  if (depth >= MAX_DEPTH) {
    out.push(bez);
    return;
  }
  split = Math.min(last - 1, Math.max(first + 1, split));
  const center = norm(sub(pts[split - 1]!, pts[split + 1]!));
  const c = len(center) > 0 ? center : norm(sub(pts[split - 1]!, pts[split]!));
  fitRange(pts, first, split, tHat1, c, tol, out, depth + 1);
  fitRange(pts, split, last, mul(c, -1), tHat2, tol, out, depth + 1);
}

function chordParams(pts: Vec2[], first: number, last: number): number[] {
  const u = [0];
  for (let i = first + 1; i <= last; i++) u.push(u[u.length - 1]! + len(sub(pts[i]!, pts[i - 1]!)));
  const total = u[u.length - 1]!;
  return total > 0 ? u.map((x) => x / total) : u.map((_, i) => i / (u.length - 1));
}

function generate(
  pts: Vec2[],
  first: number,
  last: number,
  u: number[],
  t1: Vec2,
  t2: Vec2,
): Cubic {
  const p0 = pts[first]!;
  const p3 = pts[last]!;
  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;
  for (let i = 0; i < u.length; i++) {
    const t = u[i]!;
    const s = 1 - t;
    const b0 = s * s * s;
    const b1 = 3 * s * s * t;
    const b2 = 3 * s * t * t;
    const b3 = t * t * t;
    const a1 = mul(t1, b1);
    const a2 = mul(t2, b2);
    c00 += dot(a1, a1);
    c01 += dot(a1, a2);
    c11 += dot(a2, a2);
    const tmp = sub(pts[first + i]!, add(mul(p0, b0 + b1), mul(p3, b2 + b3)));
    x0 += dot(a1, tmp);
    x1 += dot(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  let alpha1 = det !== 0 ? (x0 * c11 - x1 * c01) / det : 0;
  let alpha2 = det !== 0 ? (c00 * x1 - c01 * x0) / det : 0;
  const segLen = len(sub(p3, p0));
  const eps = 1e-6 * segLen;
  if (alpha1 < eps || alpha2 < eps) {
    // Fall back to the Wu/Barsky heuristic.
    alpha1 = alpha2 = segLen / 3;
  }
  return [p0, add(p0, mul(t1, alpha1)), add(p3, mul(t2, alpha2)), p3];
}

function maxError(
  pts: Vec2[],
  first: number,
  last: number,
  bez: Cubic,
  u: number[],
): [number, number] {
  let max = 0;
  let split = Math.floor((first + last) / 2);
  for (let i = first + 1; i < last; i++) {
    const d = sub(bezierPoint(bez, u[i - first]!), pts[i]!);
    const e = dot(d, d);
    if (e >= max) {
      max = e;
      split = i;
    }
  }
  return [max, split];
}

function reparameterize(
  pts: Vec2[],
  first: number,
  last: number,
  u: number[],
  bez: Cubic,
): number[] {
  return u.map((t, i) => newton(bez, pts[first + i]!, t));
}

/** One Newton–Raphson step toward the parameter of the closest point on the curve. */
function newton(c: Cubic, p: Vec2, t: number): number {
  const d1: Vec2[] = [0, 1, 2].map((i) => mul(sub(c[i + 1]!, c[i]!), 3));
  const d2: Vec2[] = [0, 1].map((i) => mul(sub(d1[i + 1]!, d1[i]!), 2));
  const q = bezierPoint(c, t);
  const s = 1 - t;
  const q1 = add(add(mul(d1[0]!, s * s), mul(d1[1]!, 2 * s * t)), mul(d1[2]!, t * t));
  const q2 = add(mul(d2[0]!, s), mul(d2[1]!, t));
  const diff = sub(q, p);
  const num = dot(diff, q1);
  const den = dot(q1, q1) + dot(diff, q2);
  if (Math.abs(den) < 1e-12) return t;
  return Math.min(1, Math.max(0, t - num / den));
}
