import { describe, expect, it } from 'vitest';
import {
  createLayer,
  fillCenters,
  flowFill,
  hexagonFill,
  layerFillPaths,
  rippleFill,
  stippleFill,
  triangleFill,
  type FillRegion,
  type Polyline,
  type Vec2,
} from '../../src';

const rect = (x: number, y: number, w: number, h: number): FillRegion => ({
  outer: [
    [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
  ],
  fillRule: 'nonzero',
});
const pts = (ls: Polyline[]) => ls.flatMap((l) => l.points);
const inside = (p: Vec2, x: number, y: number, w: number, h: number, eps = 2e-3) =>
  p.x >= x - eps && p.x <= x + w + eps && p.y >= y - eps && p.y <= y + h + eps;
const hatch = { spacing: 2, angle: 0, inset: 0, connect: false };

describe('ripples', () => {
  it('circles a spacing apart around the center, cut to the shape', () => {
    const lines = rippleFill(rect(0, 0, 20, 20), hatch);
    for (const p of pts(lines)) expect(inside(p, 0, 0, 20, 20)).toBe(true);
    const radii = new Set(
      pts(lines).map((p) => Math.round(Math.hypot(p.x - 10, p.y - 10) * 10) / 10),
    );
    // Rings at 1, 3, 5, … (polygon corners sit on the circle).
    for (const r of [1, 3, 5, 7, 9]) expect(radii.has(r)).toBe(true);
  });
  it('uses the movable center, like the spiral', () => {
    const l = createLayer('a', 'A');
    l.fills = [rect(0, 0, 20, 20)];
    l.settings.fill = {
      type: 'ripples',
      spacing: 2,
      angle: 0,
      inset: 0,
      connect: false,
      centerX: 10,
    };
    expect(fillCenters(l)).toEqual([{ x: 20, y: 10 }]);
    const near = pts(layerFillPaths(l)).filter((p) => Math.hypot(p.x - 20, p.y - 10) < 1.05);
    expect(near.length).toBeGreaterThan(3); // the innermost ring, around the moved center
  });
});

describe('triangles and hexagons', () => {
  it('triangles: lines in three directions 60° apart', () => {
    const lines = triangleFill(rect(0, 0, 20, 20), hatch);
    const angles = new Set(
      lines.map((l) => {
        const [a, b] = [l.points[0]!, l.points.at(-1)!];
        return (Math.round((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI) + 180) % 180;
      }),
    );
    expect(angles).toEqual(new Set([0, 60, 120]));
  });

  it('hexagons: a honeycomb of equal sides, inside the shape', () => {
    const w = 5;
    const lines = hexagonFill(rect(0, 0, 40, 40), { ...hatch, spacing: w });
    for (const p of pts(lines)) expect(inside(p, 0, 0, 40, 40)).toBe(true);
    // Every segment away from the edge is one side long (w / √3).
    const a = w / Math.sqrt(3);
    for (const l of lines)
      for (let i = 1; i < l.points.length; i++) {
        const p = l.points[i - 1]!;
        const q = l.points[i]!;
        if ([p, q].every((v) => inside(v, 0.1, 0.1, 39.8, 39.8, 0)))
          expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeCloseTo(a, 2);
      }
    // Neighboring shapes line up: the same grid on both sides of x = 20.
    const left = hexagonFill(rect(0, 0, 20, 40), { ...hatch, spacing: w });
    const right = hexagonFill(rect(20, 0, 20, 40), { ...hatch, spacing: w });
    const ends = (ls: Polyline[]) =>
      ls.flatMap((l) => [l.points[0]!, l.points.at(-1)!]).filter((p) => Math.abs(p.x - 20) < 1e-3);
    // (An edge lying exactly on the shared border is kept on one side only: drawn once.)
    expect(ends(right).length).toBeGreaterThan(5);
    for (const e of ends(right))
      expect(ends(left).some((q) => Math.abs(q.y - e.y) < 0.01)).toBe(true);
  });
});

describe('stipple', () => {
  const dots = (seed = 1, spacing = 1.5) =>
    stippleFill(rect(0, 0, 30, 20), { spacing, inset: 0, seed });
  it('dots never closer than the spacing, filling the shape evenly', () => {
    const d = dots();
    const p = d.map((x) => x.points[0]!);
    for (const q of d) expect(q.points[0]).toEqual(q.points[1]); // pen taps
    for (const q of p) expect(inside(q, 0, 0, 30, 20)).toBe(true);
    for (let i = 0; i < p.length; i++)
      for (let j = i + 1; j < p.length; j++)
        expect(Math.hypot(p[i]!.x - p[j]!.x, p[i]!.y - p[j]!.y)).toBeGreaterThanOrEqual(1.5 - 1e-9);
    // Poisson-disk packing: roughly one dot per 1.5–3 spacing² of area.
    expect(p.length).toBeGreaterThan((30 * 20) / (3 * 1.5 * 1.5));
    expect(p.length).toBeLessThan((30 * 20) / (1.2 * 1.5 * 1.5));
  });
  it('the same seed gives the same dots', () => {
    expect(dots(4)).toEqual(dots(4));
    expect(dots(4)).not.toEqual(dots(5));
  });
});

describe('flow', () => {
  const flow = (o: Partial<Parameters<typeof flowFill>[1]> = {}) =>
    flowFill(rect(0, 0, 40, 30), {
      spacing: 2,
      angle: 0,
      inset: 0,
      noiseScale: 15,
      strokeLength: 0,
      seed: 1,
      ...o,
    });
  it('lines stay inside and apart from each other', () => {
    const lines = flow();
    expect(lines.length).toBeGreaterThan(5);
    for (const p of pts(lines)) expect(inside(p, 0, 0, 40, 30)).toBe(true);
    // Points of different lines stay at least about half a spacing apart.
    const all = lines.flatMap((l, i) => l.points.map((p) => ({ ...p, i })));
    for (let a = 0; a < all.length; a += 7)
      for (let b = 0; b < all.length; b++)
        if (all[a]!.i !== all[b]!.i)
          expect(Math.hypot(all[a]!.x - all[b]!.x, all[a]!.y - all[b]!.y)).toBeGreaterThan(0.9);
  });
  it('stroke length limits each line; the same seed gives the same lines', () => {
    for (const l of flow({ strokeLength: 6 })) {
      let len = 0;
      for (let i = 1; i < l.points.length; i++)
        len += Math.hypot(l.points[i]!.x - l.points[i - 1]!.x, l.points[i]!.y - l.points[i - 1]!.y);
      expect(len).toBeLessThanOrEqual(6.6);
    }
    expect(flow({ seed: 3 })).toEqual(flow({ seed: 3 }));
    expect(flow({ seed: 3 })).not.toEqual(flow({ seed: 4 }));
  });
});

describe('dashes instead of dots', () => {
  const layer = (type: 'dots' | 'stipple', extra: object = {}) => {
    const l = createLayer('a', 'A');
    l.fills = [rect(0, 0, 20, 20)];
    l.settings.fill = { type, spacing: 2, angle: 0, inset: 0, connect: false, ...extra };
    return layerFillPaths(l);
  };
  const length = (l: Polyline) => {
    const [a, b] = [l.points[0]!, l.points.at(-1)!];
    return Math.hypot(b.x - a.x, b.y - a.y);
  };
  for (const type of ['dots', 'stipple'] as const)
    it(`${type}: each dot becomes a short line of the dash length, at the dash angle`, () => {
      const dots = layer(type);
      const dashed = layer(type, { dashLength: 1.5, dashAngle: 90 });
      expect(dashed.length).toBe(dots.length);
      for (const l of dashed) {
        expect(l.points[0]).not.toEqual(l.points[1]); // lines, not pen taps
        for (const p of l.points) expect(inside(p, 0, 0, 20, 20)).toBe(true);
        // Upright (90°), centered on the dot; shorter only where cut by the edge.
        expect(Math.abs(l.points[0]!.x - l.points[1]!.x)).toBeLessThan(1e-9);
        expect(length(l)).toBeLessThanOrEqual(1.5 + 1e-9);
      }
      const full = dashed.filter((l) => Math.abs(length(l) - 1.5) < 1e-6);
      expect(full.length).toBeGreaterThan(dashed.length / 2);
      // No dash angle: along the fill's angle.
      const along = layer(type, { dashLength: 1, angle: 0 });
      for (const l of along) expect(Math.abs(l.points[0]!.y - l.points[1]!.y)).toBeLessThan(1e-9);
    });
});
