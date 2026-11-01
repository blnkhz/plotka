import { describe, expect, it } from 'vitest';
import {
  improveTwoOpt,
  mergeTouching,
  orderGreedy,
  PointGrid,
  polylineLength,
  travelDistance,
  type Polyline,
  type Vec2,
} from '../../src';

const line = (...pts: [number, number][]): Polyline => ({
  points: pts.map(([x, y]) => ({ x, y })),
  closed: false,
});
const penDown = (ps: Polyline[]) => ps.reduce((s, p) => s + polylineLength(p), 0);

/** Deterministic pseudo-random generator for test data. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}
function randomSegments(n: number, seed = 1): Polyline[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => {
    const x = r() * 300;
    const y = r() * 200;
    return line([x, y], [x + (r() - 0.5) * 10, y + (r() - 0.5) * 10]);
  });
}

describe('PointGrid', () => {
  it('finds the nearest point and skips removed ones', () => {
    const r = rng(7);
    const pts: Vec2[] = Array.from({ length: 500 }, () => ({ x: r() * 100, y: r() * 100 }));
    const grid = new PointGrid(pts);
    for (let k = 0; k < 50; k++) {
      const q = { x: r() * 140 - 20, y: r() * 140 - 20 }; // includes points outside the grid
      const id = grid.nearest(q);
      let best = -1;
      let bd = Infinity;
      pts.forEach((p, i) => {
        if (grid.isRemoved(i)) return;
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < bd) [bd, best] = [d, i];
      });
      expect(Math.hypot(pts[id]!.x - q.x, pts[id]!.y - q.y)).toBeCloseTo(bd, 9);
      grid.remove(best);
    }
  });
  it('respects maxDist', () => {
    const grid = new PointGrid([{ x: 0, y: 0 }]);
    expect(grid.nearest({ x: 5, y: 0 }, 1)).toBe(-1);
    expect(grid.nearest({ x: 0.5, y: 0 }, 1)).toBe(0);
  });
});

describe('mergeTouching (OPT-2)', () => {
  it('joins paths whose ends are within tolerance, reversing as needed', () => {
    const out = mergeTouching(
      [line([0, 0], [10, 0]), line([20, 0], [10.05, 0]), line([20.08, 0], [30, 0])],
      0.1,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.points.map((p) => p.x)).toEqual([0, 10, 20, 30]);
  });
  it('does not join paths farther apart than tolerance', () => {
    expect(mergeTouching([line([0, 0], [10, 0]), line([10.5, 0], [20, 0])], 0.1)).toHaveLength(2);
  });
  it('extends backward from the start too', () => {
    const out = mergeTouching([line([10, 0], [20, 0]), line([0, 0], [10, 0])], 0.1);
    expect(out).toHaveLength(1);
    expect(penDown(out)).toBeCloseTo(20);
  });
  it('closes a chain whose ends meet', () => {
    const out = mergeTouching(
      [
        line([0, 0], [10, 0]),
        line([10, 0], [10, 10]),
        line([10, 10], [0, 10]),
        line([0, 10], [0, 0]),
      ],
      0.1,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.closed).toBe(true);
    expect(out[0]!.points).toHaveLength(4);
  });
  it('keeps pen-down length and leaves closed paths alone', () => {
    const paths = randomSegments(300, 3);
    paths.push({
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 5 },
      ],
      closed: true,
    });
    const out = mergeTouching(paths, 2);
    expect(out.length).toBeLessThan(paths.length);
    // Merging drops at most the tiny gaps it bridges; length stays within those gaps.
    expect(Math.abs(penDown(out) - penDown(paths))).toBeLessThan(2 * paths.length);
    expect(out.filter((p) => p.closed).length).toBeGreaterThanOrEqual(1);
  });
});

describe('orderGreedy and 2-opt (OPT-1)', () => {
  it('visits every path exactly once', () => {
    const paths = randomSegments(400);
    const out = orderGreedy(paths);
    expect(out).toHaveLength(400);
    expect(penDown(out)).toBeCloseTo(penDown(paths), 6);
  });
  it('reverses paths when the far end is closer', () => {
    const out = orderGreedy([line([100, 0], [1, 0])], { x: 0, y: 0 });
    expect(out[0]!.points[0]).toEqual({ x: 1, y: 0 });
    const two = orderGreedy([line([50, 0], [60, 0]), line([10, 0], [1, 0])]);
    expect(two[0]!.points[0]).toEqual({ x: 1, y: 0 });
  });
  it('never reverses closed paths, enters them at their start', () => {
    const sq: Polyline = {
      points: [
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 10 },
      ],
      closed: true,
    };
    const out = orderGreedy([line([100, 100], [101, 101]), sq]);
    expect(out[0]).toBe(sq);
  });
  it('cuts travel a lot on random input', () => {
    const paths = randomSegments(1000, 5);
    const home = { x: 0, y: 0 };
    const before = travelDistance(paths, home);
    const greedy = orderGreedy(paths, home);
    const after = travelDistance(greedy, home);
    expect(after).toBeLessThan(before * 0.2);
    const opt = improveTwoOpt(greedy, home);
    expect(travelDistance(opt, home)).toBeLessThanOrEqual(after);
    expect(opt).toHaveLength(1000);
    expect(penDown(opt)).toBeCloseTo(penDown(paths), 6);
  });
  it('2-opt fixes a crossing tour', () => {
    // Points on a line visited out of order: 0, 2, 1, 3
    const dots = [0, 20, 10, 30].map((x) => line([x, 0], [x, 1]));
    const out = improveTwoOpt(dots, { x: -10, y: 0 });
    expect(travelDistance(out, { x: -10, y: 0 })).toBeLessThan(
      travelDistance(dots, { x: -10, y: 0 }),
    );
  });
  it('is deterministic', () => {
    const paths = randomSegments(500, 9);
    const a = improveTwoOpt(orderGreedy(paths));
    const b = improveTwoOpt(orderGreedy(paths));
    expect(a).toEqual(b);
  });
  it('stops at the evaluation budget', () => {
    const paths = randomSegments(500, 11);
    expect(() => improveTwoOpt(paths, { x: 0, y: 0 }, { maxEvaluations: 10 })).not.toThrow();
  });
});
