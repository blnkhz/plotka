import { describe, expect, it } from 'vitest';
import { pathToPolylines } from '../../src/svg/path';
import { roundLine } from '../helpers';

const pts = (d: string, tol = 0.05) => pathToPolylines(d, undefined, tol).map(roundLine);

describe('pathToPolylines: line commands', () => {
  it('M L absolute', () => {
    expect(pts('M0 0 L10 0 L10 10')).toEqual([
      {
        closed: false,
        points: [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
      },
    ]);
  });
  it('m l relative', () => {
    expect(pts('m5 5 l10 0 l0 10')).toEqual([
      {
        closed: false,
        points: [
          [5, 5],
          [15, 5],
          [15, 15],
        ],
      },
    ]);
  });
  it('implicit lineto after moveto', () => {
    expect(pts('M0 0 10 0 10 10')).toEqual(pts('M0 0 L10 0 L10 10'));
    expect(pts('m0 0 10 0 0 10')).toEqual(pts('M0 0 L10 0 L10 10'));
  });
  it('H V absolute and h v relative', () => {
    expect(pts('M1 1 H11 V11')).toEqual([
      {
        closed: false,
        points: [
          [1, 1],
          [11, 1],
          [11, 11],
        ],
      },
    ]);
    expect(pts('M1 1 h10 v10')).toEqual([
      {
        closed: false,
        points: [
          [1, 1],
          [11, 1],
          [11, 11],
        ],
      },
    ]);
  });
  it('Z closes without repeating the start point', () => {
    expect(pts('M0 0 H10 V10 Z')).toEqual([
      {
        closed: true,
        points: [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
      },
    ]);
    expect(pts('M0 0 H10 V10 H0 V0 z')).toEqual([
      {
        closed: true,
        points: [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
      },
    ]);
  });
  it('multiple subpaths, relative move after Z starts from subpath start', () => {
    const out = pts('M0 0 h10 v10 z m20 0 h5 v5 z');
    expect(out).toHaveLength(2);
    expect(out[1]!.points[0]).toEqual([20, 0]);
  });
  it('drawing after Z without M starts a new subpath at the previous start', () => {
    const out = pts('M0 0 h10 v10 z l5 5');
    expect(out).toHaveLength(2);
    expect(out[1]!.points).toEqual([
      [0, 0],
      [5, 5],
    ]);
  });
  it('ignores lone moveto', () => {
    expect(pts('M0 0 M10 10 L20 20')).toEqual([
      {
        closed: false,
        points: [
          [10, 10],
          [20, 20],
        ],
      },
    ]);
  });
});

describe('pathToPolylines: curves', () => {
  const endsAt = (d: string, x: number, y: number) => {
    const line = pts(d)[0]!;
    expect(line.points[line.points.length - 1]).toEqual([x, y]);
    expect(line.points.length).toBeGreaterThan(3);
  };
  it('C and c', () => {
    endsAt('M0 0 C0 10 10 10 10 0', 10, 0);
    endsAt('M0 0 c0 10 10 10 10 0', 10, 0);
  });
  it('S and s reflect the previous control point', () => {
    const abs = pts('M0 0 C0 10 10 10 10 0 S20 -10 20 0');
    const rel = pts('M0 0 c0 10 10 10 10 0 s10 -10 10 0');
    const explicit = pts('M0 0 C0 10 10 10 10 0 C10 -10 20 -10 20 0');
    expect(abs).toEqual(explicit);
    expect(rel).toEqual(explicit);
  });
  it('Q and q', () => {
    endsAt('M0 0 Q5 10 10 0', 10, 0);
    endsAt('M0 0 q5 10 10 0', 10, 0);
  });
  it('T and t reflect the previous quadratic control point', () => {
    const explicit = pts('M0 0 Q5 10 10 0 Q15 -10 20 0');
    expect(pts('M0 0 Q5 10 10 0 T20 0')).toEqual(explicit);
    expect(pts('M0 0 q5 10 10 0 t10 0')).toEqual(explicit);
  });
  it('A and a: semicircle stays on the circle', () => {
    for (const d of ['M0 0 A10 10 0 0 1 20 0', 'M0 0 a10 10 0 0 1 20 0']) {
      const line = pathToPolylines(d, undefined, 0.01)[0]!;
      for (const p of line.points)
        expect(Math.abs(Math.hypot(p.x - 10, p.y) - 10)).toBeLessThan(0.011);
      // sweep=1 from (0,0) to (20,0) goes through negative y in SVG coordinates (y down).
      expect(Math.min(...line.points.map((p) => p.y))).toBeCloseTo(-10, 2);
    }
  });
  it('arc flags pick the right arc', () => {
    const large = pathToPolylines('M0 0 A10 10 0 1 0 10 10', undefined, 0.01)[0]!;
    const small = pathToPolylines('M0 0 A10 10 0 0 0 10 10', undefined, 0.01)[0]!;
    const length = (ps: { x: number; y: number }[]) =>
      ps.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - ps[i]!.x, p.y - ps[i]!.y), 0);
    expect(length(large.points)).toBeCloseTo((3 * Math.PI * 10) / 2, 0);
    expect(length(small.points)).toBeCloseTo((Math.PI * 10) / 2, 0);
  });
});

describe('adaptive flattening', () => {
  it('keeps every point within tolerance of a circle', () => {
    for (const tol of [0.5, 0.05, 0.005]) {
      const r = 50;
      const line = pathToPolylines(
        `M${r} 0 A${r} ${r} 0 0 1 0 ${r} A${r} ${r} 0 0 1 ${-r} 0 A${r} ${r} 0 0 1 0 ${-r} A${r} ${r} 0 0 1 ${r} 0Z`,
        undefined,
        tol,
      )[0]!;
      // Check vertices and segment midpoints (the chord sagitta is where error peaks).
      const ps = line.points;
      for (let i = 0; i < ps.length; i++) {
        const a = ps[i]!;
        const b = ps[(i + 1) % ps.length]!;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        expect(Math.abs(Math.hypot(mid.x, mid.y) - r)).toBeLessThanOrEqual(tol * 1.05);
      }
    }
  });
  it('uses more points for tighter curves', () => {
    const count = (r: number) =>
      pathToPolylines(`M${r} 0 A${r} ${r} 0 0 1 ${-r} 0`, undefined, 0.05)[0]!.points.length;
    // Same angle; a bigger radius needs more points for the same tolerance per mm.
    expect(count(100)).toBeGreaterThan(count(5));
    // Per mm of length, the tight curve is denser.
    expect(count(5) / (Math.PI * 5)).toBeGreaterThan(count(100) / (Math.PI * 100));
  });
  it('fewer points for looser tolerance', () => {
    const d = 'M0 0 C0 50 50 50 50 0';
    expect(pathToPolylines(d, undefined, 0.01)[0]!.points.length).toBeGreaterThan(
      pathToPolylines(d, undefined, 0.5)[0]!.points.length,
    );
  });
  it('straight cubic collapses to a line', () => {
    expect(pts('M0 0 C10 0 20 0 30 0')).toEqual([
      {
        closed: false,
        points: [
          [0, 0],
          [30, 0],
        ],
      },
    ]);
  });
});
