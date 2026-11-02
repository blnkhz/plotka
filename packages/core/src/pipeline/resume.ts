import type { Vec2 } from '../geometry/vec2';
import type { Polyline } from '../model';
import type { Toolpath } from './toolpath';

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** A path's points, with the closing segment spelled out for closed paths. */
const route = (p: Polyline): Vec2[] =>
  p.closed && p.points.length > 2 ? [...p.points, p.points[0]!] : p.points;

/** How far along `path` (mm from its start) the point nearest to `p` is. */
export function distanceAlong(path: Polyline, p: Vec2): number {
  const pts = route(path);
  let best = Infinity;
  let at = 0;
  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    const d = Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
    if (d < best) {
      best = d;
      at = walked + t * Math.sqrt(l2);
    }
    walked += Math.sqrt(l2);
  }
  return at;
}

/** The part of `path` from `offset` mm onward, as an open path (null if nothing is left). */
export function trimPathStart(path: Polyline, offset: number): Polyline | null {
  if (offset <= 0) return path;
  const pts = route(path);
  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const l = dist(a, b);
    if (walked + l > offset) {
      const t = (offset - walked) / l;
      const start = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      return { points: [start, ...pts.slice(i)], closed: false };
    }
    walked += l;
  }
  return null;
}

export type ResumePoint = {
  layerId: string;
  /** Index of the path within that layer of the toolpath. */
  pathIndex: number;
  /** Start this far (mm) along that path; 0 = its beginning. */
  offset?: number;
};

/**
 * PLOT-5: the toolpath from a point onward: earlier layers and paths are dropped, and the first
 * path starts `offset` mm along. Later layers are kept in order.
 */
export function toolpathFrom(tp: Toolpath, from: ResumePoint): Toolpath {
  const li = tp.layers.findIndex((l) => l.layerId === from.layerId);
  if (li < 0) return tp;
  return {
    layers: tp.layers.slice(li).map((l, k) => {
      if (k > 0) return l;
      const rest = l.paths.slice(Math.max(0, from.pathIndex));
      const first = rest[0] ? trimPathStart(rest[0], from.offset ?? 0) : null;
      return { ...l, paths: first ? [first, ...rest.slice(1)] : rest.slice(1) };
    }),
  };
}
