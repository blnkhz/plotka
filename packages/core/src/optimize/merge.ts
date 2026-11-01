import type { Vec2 } from '../geometry/vec2';
import type { Polyline } from '../model';
import { PointGrid } from './grid';

/**
 * OPT-2: joins open polylines whose endpoints are within `tolerance`, reversing as needed,
 * so the pen doesn't lift between touching paths. A merged chain whose ends meet becomes closed.
 * Closed polylines are left alone.
 */
export function mergeTouching(paths: Polyline[], tolerance = 0.1): Polyline[] {
  const open = paths.filter((p) => !p.closed && p.points.length > 1);
  const out: Polyline[] = paths.filter((p) => p.closed || p.points.length <= 1);
  if (open.length < 2 || tolerance <= 0) return [...out, ...open];

  // Endpoint ids: 2*i = start of path i, 2*i+1 = end of path i.
  const ends: Vec2[] = [];
  for (const p of open) ends.push(p.points[0]!, p.points[p.points.length - 1]!);
  const grid = new PointGrid(ends, Math.max(tolerance, 1e-3) * 4);
  const used = new Uint8Array(open.length);

  const take = (i: number) => {
    used[i] = 1;
    grid.remove(2 * i);
    grid.remove(2 * i + 1);
  };

  for (let i = 0; i < open.length; i++) {
    if (used[i]) continue;
    take(i);
    let pts = [...open[i]!.points];
    // Extend forward from the end, then backward from the start.
    for (const dir of ['end', 'start'] as const) {
      for (;;) {
        const tip = dir === 'end' ? pts[pts.length - 1]! : pts[0]!;
        const id = grid.nearest(tip, tolerance);
        if (id === -1) break;
        const j = id >> 1;
        const atStart = (id & 1) === 0;
        take(j);
        const other = open[j]!.points;
        if (dir === 'end') {
          // Attach so the touching endpoint comes first; skip it (it duplicates our tip).
          const seq = atStart ? other : [...other].reverse();
          pts = pts.concat(seq.slice(1));
        } else {
          const seq = atStart ? [...other].reverse() : other;
          pts = seq.slice(0, -1).concat(pts);
        }
      }
    }
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    if (pts.length > 3 && Math.hypot(first.x - last.x, first.y - last.y) <= tolerance) {
      out.push({ points: pts.slice(0, -1), closed: true });
    } else out.push({ points: pts, closed: false });
  }
  return out;
}
