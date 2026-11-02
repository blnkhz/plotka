import { describe, expect, it } from 'vitest';
import {
  defaultOptimizeSettings,
  isDot,
  optimizePaths,
  removeDuplicateSegments,
  simplifyPaths,
  startClosedNearest,
  type Polyline,
} from '../../src';

const open = (...pts: [number, number][]): Polyline => ({
  points: pts.map(([x, y]) => ({ x, y })),
  closed: false,
});
const closed = (...pts: [number, number][]): Polyline => ({ ...open(...pts), closed: true });
const dot = (x: number, y: number): Polyline => open([x, y], [x, y]);

describe('removeDuplicateSegments (OPT-3)', () => {
  it('drops a path drawn twice, in either direction', () => {
    const out = removeDuplicateSegments([open([0, 0], [10, 0]), open([10, 0], [0, 0])]);
    expect(out).toHaveLength(1);
  });
  it('cuts out a shared edge between two squares (mirrored tiles)', () => {
    const a = closed([0, 0], [10, 0], [10, 10], [0, 10]);
    const b = closed([10, 0], [20, 0], [20, 10], [10, 10]);
    const out = removeDuplicateSegments([a, b]);
    expect(out[0]).toBe(a);
    // b loses its left edge (10,10)->(10,0) and becomes one open run of 3 segments.
    expect(out.slice(1)).toEqual([open([10, 0], [20, 0], [20, 10], [10, 10])]);
  });
  it('matches within the tolerance, keeps different lines, and dedupes dots', () => {
    const out = removeDuplicateSegments([
      open([0, 0], [10, 0]),
      open([0.003, 0.002], [10.001, 0]),
      open([0, 1], [10, 1]),
      dot(5, 5),
      dot(5, 5),
    ]);
    expect(out).toHaveLength(3);
    expect(out.filter(isDot)).toHaveLength(1);
  });
});

describe('simplifyPaths (OPT-4)', () => {
  it('removes points that change the line by less than the tolerance', () => {
    const wavy = open(
      ...Array.from({ length: 101 }, (_, i) => [i * 0.1, i % 2 ? 0.004 : 0] as [number, number]),
    );
    const [s] = simplifyPaths([wavy], 0.01);
    expect(s!.points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });
  it('drops tiny paths but keeps dots and real shapes', () => {
    const out = simplifyPaths([
      open([0, 0], [0.02, 0]),
      dot(3, 3),
      closed([0, 0], [5, 0], [5, 5], [0, 5]),
    ]);
    expect(out).toHaveLength(2);
    expect(isDot(out[0]!)).toBe(true);
    expect(out[1]!.closed).toBe(true);
    expect(out[1]!.points).toHaveLength(4);
  });
});

describe('startClosedNearest (OPT-5)', () => {
  it('starts each closed shape at the vertex nearest the pen', () => {
    const sq = closed([0, 0], [10, 0], [10, 10], [0, 10]);
    const [r] = startClosedNearest([sq], { x: 11, y: 11 });
    expect(r!.points[0]).toEqual({ x: 10, y: 10 });
    expect(r!.points).toHaveLength(4);
  });
  it('follows the pen through the sequence', () => {
    const a = open([0, 0], [20, 20]);
    const sq = closed([0, 0], [10, 0], [10, 10], [0, 10]);
    const [, r] = startClosedNearest([a, sq], { x: 0, y: 0 });
    expect(r!.points[0]).toEqual({ x: 10, y: 10 }); // nearest to (20, 20), where a ended
  });
});

describe('optimizePaths with cleanup', () => {
  it('less travel and no duplicates with the defaults', () => {
    const tiles = [0, 10, 20].map((x) => closed([x, 0], [x + 10, 0], [x + 10, 10], [x, 10]));
    const out = optimizePaths(tiles, { x: 0, y: 0 }, defaultOptimizeSettings());
    const segs = out.reduce((n, p) => n + (p.closed ? p.points.length : p.points.length - 1), 0);
    expect(segs).toBe(10); // 12 edges minus the 2 shared ones
    const none = optimizePaths(
      tiles,
      { x: 0, y: 0 },
      {
        ...defaultOptimizeSettings(),
        dedupe: false,
        simplify: false,
        closedStart: false,
      },
    );
    expect(none.reduce((n, p) => n + p.points.length, 0)).toBe(12);
  });
});
