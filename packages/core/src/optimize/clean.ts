import { simplifyLines } from '../doodle/fit';
import type { Vec2 } from '../geometry/vec2';
import type { Polyline } from '../model';

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** A dot: a deliberate pen tap, stored as a two-point path with both points equal. */
export const isDot = (p: Polyline) =>
  p.points.length === 2 && p.points[0]!.x === p.points[1]!.x && p.points[0]!.y === p.points[1]!.y;

/**
 * OPT-3: removes line segments (and dots) the pen has already drawn in this list, matching
 * endpoints within `tolerance` mm in either direction. Paths are cut where a duplicate segment is
 * taken out; closed paths that lose a segment become open. Partly overlapping segments that don't
 * share both ends aren't detected.
 */
export function removeDuplicateSegments(paths: Polyline[], tolerance = 0.01): Polyline[] {
  // Seen segments, indexed under the grid cell of each end. A match is within one cell, so
  // looking in the 3 × 3 cells around an end finds it even across a cell boundary.
  const cell = (v: number) => Math.floor(v / tolerance);
  const grid = new Map<string, [Vec2, Vec2][]>();
  const add = (a: Vec2, b: Vec2) => {
    for (const p of a === b ? [a] : [a, b]) {
      const k = `${cell(p.x)},${cell(p.y)}`;
      const list = grid.get(k);
      if (list) list.push([a, b]);
      else grid.set(k, [[a, b]]);
    }
  };
  const near = (p: Vec2, q: Vec2) => dist(p, q) <= tolerance;
  const seenBefore = (a: Vec2, b: Vec2) => {
    const cx = cell(a.x);
    const cy = cell(a.y);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const [p, q] of grid.get(`${cx + dx},${cy + dy}`) ?? [])
          if ((near(a, p) && near(b, q)) || (near(a, q) && near(b, p))) return true;
    return false;
  };
  const out: Polyline[] = [];
  for (const path of paths) {
    const pts = path.points;
    if (pts.length < 2) continue;
    if (isDot(path)) {
      if (!seenBefore(pts[0]!, pts[0]!)) {
        add(pts[0]!, pts[0]!);
        out.push(path);
      }
      continue;
    }
    const n = path.closed ? pts.length : pts.length - 1;
    const keep: boolean[] = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      // A segment that collapses to a point within the tolerance adds nothing.
      const dup = dist(a, b) < tolerance || seenBefore(a, b);
      keep.push(!dup);
      if (!dup) add(a, b);
    }
    if (keep.every(Boolean)) {
      out.push(path);
      continue;
    }
    // Rebuild runs of kept segments. For a closed path, start right after a removed segment so
    // a run that wraps around the start stays in one piece.
    const start = path.closed ? (keep.indexOf(false) + 1) % n : 0;
    let run: Vec2[] | null = null;
    for (let s = 0; s < n; s++) {
      const i = (start + s) % n;
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      if (keep[i]) {
        if (!run) run = [a];
        run.push(b);
      } else if (run) {
        out.push({ points: run, closed: false });
        run = null;
      }
    }
    if (run) out.push({ points: run, closed: false });
  }
  return out;
}

/**
 * OPT-4: simplifies each path (Ramer–Douglas–Peucker, `tolerance` mm) and drops paths shorter than
 * `minLength` mm. Dots are kept: they're deliberate taps.
 */
export function simplifyPaths(paths: Polyline[], tolerance = 0.01, minLength = 0.05): Polyline[] {
  const out: Polyline[] = [];
  for (const p of paths) {
    if (isDot(p)) {
      out.push(p);
      continue;
    }
    if (p.points.length < 2) continue;
    let len = 0;
    for (let i = 1; i < p.points.length; i++) len += dist(p.points[i - 1]!, p.points[i]!);
    if (p.closed) len += dist(p.points[p.points.length - 1]!, p.points[0]!);
    if (len < minLength) continue;
    if (p.points.length <= 2 || tolerance <= 0) {
      out.push(p);
      continue;
    }
    if (p.closed) {
      // Simplify the ring as a path that returns to its start, then drop the repeated point.
      const s = simplifyLines([...p.points, p.points[0]!], tolerance);
      s.pop();
      out.push(s.length >= 3 ? { points: s, closed: true } : p);
    } else out.push({ points: simplifyLines(p.points, tolerance), closed: false });
  }
  return out;
}

/**
 * OPT-5: rotates each closed path to start at its vertex nearest the pen, following the order
 * given (the pen ends a closed path where it started it).
 */
export function startClosedNearest(paths: Polyline[], from: Vec2): Polyline[] {
  let pos = from;
  return paths.map((p) => {
    if (!p.closed || p.points.length < 3) {
      pos = p.points[p.points.length - 1] ?? pos;
      return p;
    }
    let best = 0;
    let bestD = Infinity;
    p.points.forEach((q, i) => {
      const d = dist(q, pos);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const rotated =
      best === 0
        ? p
        : { points: [...p.points.slice(best), ...p.points.slice(0, best)], closed: true };
    pos = rotated.points[0]!;
    return rotated;
  });
}
