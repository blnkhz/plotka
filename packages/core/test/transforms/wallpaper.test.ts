import { describe, expect, it } from 'vitest';
import {
  applyToPoint,
  cartesianOps,
  cartesianRegion,
  invert,
  latticeBasis,
  seededRandom,
  WALLPAPER_GROUPS,
  type Vec2,
} from '../../src';

function inside(poly: Vec2[], p: Vec2): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
const area = (poly: Vec2[]) =>
  Math.abs(
    poly.reduce((s, p, i) => {
      const q = poly[(i + 1) % poly.length]!;
      return s + p.x * q.y - q.x * p.y;
    }, 0),
  ) / 2;

describe('wallpaper groups', () => {
  it('has the 17 groups plus honeycomb and triangles, with unique ids', () => {
    expect(new Set(WALLPAPER_GROUPS.map((g) => g.id)).size).toBe(19);
  });

  for (const g of WALLPAPER_GROUPS)
    it(`${g.id}: copies of the region cover the plane exactly once`, () => {
      const { a, b } = latticeBasis(g.lattice, 10, 0.7);
      const ops = cartesianOps(g, a, b);
      const inv = ops.map(invert);
      const region = cartesianRegion(g, a, b);
      // Region area × number of ops = cell area.
      const cell = Math.abs(a.x * b.y - a.y * b.x);
      expect(area(region) * ops.length).toBeCloseTo(cell, 6);
      // Every op is an isometry (lengths preserved).
      for (const m of ops) {
        const p = applyToPoint(m, 1, 0);
        const o = applyToPoint(m, 0, 0);
        expect(Math.hypot(p.x - o.x, p.y - o.y)).toBeCloseTo(1, 9);
      }
      const rand = seededRandom(42);
      for (let n = 0; n < 300; n++) {
        const u = rand();
        const v = rand();
        const P = { x: u * a.x + v * b.x, y: u * a.y + v * b.y };
        let count = 0;
        for (const mi of inv)
          for (let i = -3; i <= 3; i++)
            for (let j = -3; j <= 3; j++) {
              const q = applyToPoint(mi, P.x - i * a.x - j * b.x, P.y - i * a.y - j * b.y);
              if (inside(region, q)) count++;
            }
        expect(count, `point ${n} (${u.toFixed(3)}, ${v.toFixed(3)})`).toBe(1);
      }
    });
});
