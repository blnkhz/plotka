import type { Vec2 } from '../geometry/vec2';
import type { Polyline } from '../model';
import { removeDuplicateSegments, simplifyPaths, startClosedNearest } from './clean';
import { PointGrid } from './grid';
import { mergeTouching } from './merge';

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const startOf = (p: Polyline) => p.points[0]!;
const endOf = (p: Polyline) => (p.closed ? p.points[0]! : p.points[p.points.length - 1]!);
const reversed = (p: Polyline): Polyline => ({ points: [...p.points].reverse(), closed: p.closed });

/** Total pen-up distance from `from`, through the paths in order, ending at the last path. */
export function travelDistance(paths: Polyline[], from: Vec2): number {
  let d = 0;
  let pos = from;
  for (const p of paths) {
    d += dist(pos, startOf(p));
    pos = endOf(p);
  }
  return d;
}

/**
 * OPT-1: greedy nearest-neighbor ordering. From the current pen position, go to the nearest
 * unused path end; open paths may be drawn in reverse. Uses a grid index so it's fast on big files.
 */
export function orderGreedy(paths: Polyline[], from: Vec2 = { x: 0, y: 0 }): Polyline[] {
  const valid = paths.filter((p) => p.points.length > 0);
  if (valid.length === 0) return valid;
  // Candidate ids: 2*i = enter path i at its start, 2*i+1 = enter at its end (open paths only).
  const pts: Vec2[] = [];
  for (const p of valid) {
    pts.push(startOf(p));
    // Closed paths start and end at the same point; their "end" entry is a far-away placeholder
    // removed right away, so the id layout stays simple.
    pts.push(p.closed ? startOf(p) : p.points[p.points.length - 1]!);
  }
  const grid = new PointGrid(pts);
  valid.forEach((p, i) => {
    if (p.closed) grid.remove(2 * i + 1);
  });
  const out: Polyline[] = [];
  let pos = from;
  while (grid.size > 0) {
    const id = grid.nearest(pos);
    if (id === -1) break;
    const i = id >> 1;
    grid.remove(2 * i);
    grid.remove(2 * i + 1);
    const p = valid[i]!;
    const chosen = id & 1 ? reversed(p) : p;
    out.push(chosen);
    pos = endOf(chosen);
  }
  return out;
}

export type TwoOptOptions = {
  /** How far ahead in the sequence to look for a swap partner. */
  window?: number;
  /**
   * Cap on candidate moves evaluated. This is a fixed amount of work rather than wall-clock
   * time, so the same input always gives the same order (the preview must match the plot).
   */
  maxEvaluations?: number;
};

/**
 * OPT-1 improvement pass: 2-opt on the path sequence. Reversing a run of paths (and each path in
 * it) is accepted when it shortens the travel. Closed paths keep their start point.
 */
export function improveTwoOpt(
  paths: Polyline[],
  from: Vec2 = { x: 0, y: 0 },
  { window = 50, maxEvaluations = 1_000_000 }: TwoOptOptions = {},
): Polyline[] {
  const seq = [...paths];
  const n = seq.length;
  if (n < 3) return seq;
  let evaluations = 0;
  let improved = true;
  // Position before path k: home for k = 0, else end of path k-1.
  const before = (k: number) => (k === 0 ? from : endOf(seq[k - 1]!));
  while (improved && evaluations < maxEvaluations) {
    improved = false;
    for (let i = 0; i < n - 1 && evaluations < maxEvaluations; i++) {
      const a = before(i);
      const limit = Math.min(n - 1, i + window);
      for (let j = i + 1; j <= limit; j++) {
        evaluations++;
        // Reverse seq[i..j]. Old links: a -> start(i), end(j) -> start(j+1).
        // New links: a -> end(j) (j reversed starts at its end), start(i) -> start(j+1).
        const si = startOf(seq[i]!);
        const ej = endOf(seq[j]!);
        const next = j + 1 < n ? startOf(seq[j + 1]!) : null;
        // Closed paths reversed still start at the same point.
        const newFirst = seq[j]!.closed ? startOf(seq[j]!) : ej;
        const newLast = seq[i]!.closed ? startOf(seq[i]!) : si;
        const oldCost = dist(a, si) + (next ? dist(ej, next) : 0);
        const newCost = dist(a, newFirst) + (next ? dist(newLast, next) : 0);
        if (newCost < oldCost - 1e-9) {
          const run = seq
            .slice(i, j + 1)
            .reverse()
            .map(reversed);
          seq.splice(i, run.length, ...run);
          improved = true;
          break;
        }
      }
    }
  }
  return seq;
}

export type OptimizeSettings = {
  /** OPT-2: join paths whose ends touch. */
  merge: boolean;
  /** mm */
  mergeTolerance: number;
  /** OPT-1: reorder to minimize pen-up travel. */
  order: boolean;
  /** Extra 2-opt pass after the greedy order. */
  twoOpt: boolean;
  /** OPT-3: drop segments drawn twice. */
  dedupe: boolean;
  /** OPT-4: simplify paths and drop tiny ones. */
  simplify: boolean;
  /** OPT-5: start closed shapes at the vertex nearest the pen. */
  closedStart: boolean;
};

export const defaultOptimizeSettings = (): OptimizeSettings => ({
  merge: true,
  mergeTolerance: 0.1,
  order: true,
  twoOpt: true,
  dedupe: true,
  simplify: true,
  closedStart: true,
});

/** Clean up, merge, order and pick start points for one layer's paths, from `from`. */
export function optimizePaths(paths: Polyline[], from: Vec2, s: OptimizeSettings): Polyline[] {
  let out = paths;
  if (s.dedupe) out = removeDuplicateSegments(out);
  if (s.simplify) out = simplifyPaths(out);
  if (s.merge) out = mergeTouching(out, s.mergeTolerance);
  if (s.order) {
    out = orderGreedy(out, from);
    if (s.twoOpt) out = improveTwoOpt(out, from);
  }
  if (s.closedStart) out = startClosedNearest(out, from);
  return out;
}
