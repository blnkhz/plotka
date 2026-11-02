import type { Polyline, Vec2 } from '@plotter-studio/core';
import type { Timeline } from './pipeline';

/** PREVIEW-4 helpers: what has been drawn at time `t` (ms from the start of the plot). */

/** How many paths are completely drawn at `t` (ends are in plot order, so binary search). */
export function completedCount(tl: Timeline, t: number): number {
  let lo = 0;
  let hi = tl.end.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tl.end[mid]! <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const route = (p: Polyline): Vec2[] =>
  p.closed && p.points.length > 2 ? [...p.points, p.points[0]!] : p.points;

/** The first fraction `f` (0..1, by length) of a path's points. */
export function partialRoute(path: Polyline, f: number): Vec2[] {
  const pts = route(path);
  if (f >= 1 || pts.length < 2) return pts;
  let total = 0;
  for (let i = 1; i < pts.length; i++)
    total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  let left = Math.max(0, f) * total;
  const out: Vec2[] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l >= left) {
      const k = l ? left / l : 0;
      out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
      return out;
    }
    out.push(b);
    left -= l;
  }
  return out;
}

export const routeEnd = (p: Polyline): Vec2 =>
  p.closed ? p.points[0]! : p.points[p.points.length - 1]!;

/**
 * Where the pen is at `t`, and whether it's drawing. Between paths the pen travels (pen up)
 * from the end of one path to the start of the next, timed between them; home before the first
 * and after the last.
 */
export function penAt(
  tl: Timeline,
  pathOf: (layer: number, path: number) => Polyline | undefined,
  t: number,
): { x: number; y: number; down: boolean } {
  const n = tl.end.length;
  const k = completedCount(tl, t);
  const home = { x: 0, y: 0 };
  if (k < n && tl.start[k]! <= t) {
    const p = pathOf(tl.layer[k]!, tl.path[k]!);
    if (p) {
      const span = tl.end[k]! - tl.start[k]!;
      const pts = partialRoute(p, span > 0 ? (t - tl.start[k]!) / span : 1);
      return { ...pts[pts.length - 1]!, down: true };
    }
  }
  const prev = k > 0 ? pathOf(tl.layer[k - 1]!, tl.path[k - 1]!) : undefined;
  const from = prev ? routeEnd(prev) : home;
  const next = k < n ? pathOf(tl.layer[k]!, tl.path[k]!) : undefined;
  const to = next ? next.points[0]! : home;
  const t0 = k > 0 ? tl.end[k - 1]! : 0;
  const t1 = k < n ? tl.start[k]! : tl.totalMs;
  const f = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1;
  return { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f, down: false };
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
