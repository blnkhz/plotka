import type { Polyline } from '../model';
import type { Rect } from '../page/paper';
import type { Vec2 } from './vec2';

export type ClipResult = { inside: Polyline[]; outside: Polyline[] };

const EPS = 1e-9;

const contains = (r: Rect, p: Vec2) =>
  p.x >= r.x - EPS && p.x <= r.x + r.width + EPS && p.y >= r.y - EPS && p.y <= r.y + r.height + EPS;

/**
 * Liang-Barsky segment clip. Returns the parameter range [t0, t1] of a->b inside the rect,
 * or null if the segment misses it.
 */
function clipSegment(a: Vec2, b: Vec2, r: Rect): [number, number] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a.x - r.x],
    [dx, r.x + r.width - a.x],
    [-dy, a.y - r.y],
    [dy, r.y + r.height - a.y],
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < EPS) {
      if (q < -EPS) return null;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  return t0 <= t1 ? [t0, t1] : null;
}

const at = (a: Vec2, b: Vec2, t: number): Vec2 =>
  t === 0 ? a : t === 1 ? b : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };

/**
 * Clips polylines to a rectangle. Returns the pieces inside and the pieces outside (for
 * highlighting). Closed polylines that end up cut become open.
 */
export function clipPolylines(lines: Polyline[], r: Rect): ClipResult {
  const inside: Polyline[] = [];
  const outside: Polyline[] = [];
  for (const line of lines) {
    const pts = line.points;
    if (pts.length === 0) continue;
    if (pts.every((p) => contains(r, p))) {
      inside.push(line);
      continue;
    }
    const segCount = line.closed ? pts.length : pts.length - 1;
    let curIn: Vec2[] | null = null;
    let curOut: Vec2[] | null = null;
    const flushIn = () => {
      if (curIn && curIn.length > 1) inside.push({ points: curIn, closed: false });
      curIn = null;
    };
    const flushOut = () => {
      if (curOut && curOut.length > 1) outside.push({ points: curOut, closed: false });
      curOut = null;
    };
    for (let i = 0; i < segCount; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const range = clipSegment(a, b, r);
      if (!range) {
        flushIn();
        if (!curOut) curOut = [a];
        curOut.push(b);
        continue;
      }
      const [t0, t1] = range;
      const p0 = at(a, b, t0);
      const p1 = at(a, b, t1);
      if (t0 > EPS) {
        if (!curOut) curOut = [a];
        curOut.push(p0);
        flushOut();
        flushIn();
      } else flushOut();
      if (!curIn) curIn = [p0];
      curIn.push(p1);
      if (t1 < 1 - EPS) {
        flushIn();
        curOut = [p1, b];
      }
    }
    flushIn();
    flushOut();
  }
  return { inside, outside };
}

/** Sutherland-Hodgman clip of one ring against a rectangle. */
export function clipRing(ring: Vec2[], r: Rect): Vec2[] {
  type Edge = (p: Vec2) => number; // >= 0 means inside
  const edges: Edge[] = [
    (p) => p.x - r.x,
    (p) => r.x + r.width - p.x,
    (p) => p.y - r.y,
    (p) => r.y + r.height - p.y,
  ];
  let out = ring;
  for (const edge of edges) {
    if (out.length === 0) break;
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i]!;
      const prev = input[(i + input.length - 1) % input.length]!;
      const dc = edge(cur);
      const dp = edge(prev);
      if (dc >= 0) {
        if (dp < 0) out.push(at(prev, cur, dp / (dp - dc)));
        out.push(cur);
      } else if (dp >= 0) {
        out.push(at(prev, cur, dp / (dp - dc)));
      }
    }
  }
  return out;
}

export const intersectRects = (a: Rect, b: Rect): Rect => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y),
  };
};
