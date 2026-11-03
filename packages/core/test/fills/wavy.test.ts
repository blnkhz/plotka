import { describe, expect, it } from 'vitest';
import {
  createLayer,
  layerHatches,
  maxWavyAmplitude,
  NOISE_MAX_SLOPE,
  perlin,
  wavyFill,
  type FillRegion,
  type Polyline,
  type Vec2,
  type WavyOptions,
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
const opts = (o: Partial<WavyOptions> = {}): WavyOptions => ({
  kind: 'waves',
  spacing: 2,
  angle: 0,
  inset: 0,
  connect: false,
  amplitude: 1,
  wavelength: 10,
  phase: 0,
  noiseScale: 15,
  seed: 1,
  allowCross: false,
  ...o,
});
const pts = (ls: Polyline[]) => ls.flatMap((l) => l.points);
/** The longest line whose average height is y (a whole row, away from the edges). */
const rowAt = (ls: Polyline[], y: number) =>
  ls
    .filter((l) => Math.abs(l.points.reduce((s, p) => s + p.y, 0) / l.points.length - y) < 0.5)
    .sort((a, b) => b.points.length - a.points.length)[0]!;
const inside = (p: Vec2, x: number, y: number, w: number, h: number, eps = 2e-3) =>
  p.x >= x - eps && p.x <= x + w + eps && p.y >= y - eps && p.y <= y + h + eps;

describe('waves and noise fills', () => {
  it('waves: sine lines on the spacing grid, inside the shape and its inset', () => {
    const lines = wavyFill(rect(0, 0, 40, 20), opts({ inset: 1, amplitude: 1.5 }));
    for (const p of pts(lines)) expect(inside(p, 1, 1, 38, 18)).toBe(true);
    // A middle row (y = 9) swings by the amplitude around its grid line.
    const row = rowAt(lines, 9);
    const ys = row.points.map((p) => p.y);
    expect(Math.max(...ys) - 9).toBeCloseTo(1.5, 1);
    expect(9 - Math.min(...ys)).toBeCloseTo(1.5, 1);
  });

  it('neighboring shapes line up (global grid and phase)', () => {
    const a = wavyFill(rect(0, 0, 20, 20), opts());
    const b = wavyFill(rect(20, 0, 20, 20), opts());
    const endsA = a.flatMap((l) => [l.points[0]!, l.points.at(-1)!]).filter((p) => p.x > 19.99);
    const endsB = b.flatMap((l) => [l.points[0]!, l.points.at(-1)!]).filter((p) => p.x < 20.01);
    expect(endsA.length).toBeGreaterThan(5);
    for (const e of endsA)
      expect(endsB.some((q) => Math.hypot(q.x - e.x, q.y - e.y) < 0.01)).toBe(true);
  });

  it('caps the amplitude so neighboring lines never cross, unless allowed', () => {
    // Opposite phase on every line: they'd touch at amplitude = spacing / 2.
    const o = opts({ phase: 180, amplitude: 5, spacing: 2 });
    expect(maxWavyAmplitude(o)).toBeCloseTo(1);
    const swing = (ls: Polyline[]) =>
      Math.max(...rowAt(ls, 9).points.map((p) => Math.abs(p.y - 9)));
    expect(swing(wavyFill(rect(0, -20, 40, 60), o))).toBeLessThan(1);
    expect(swing(wavyFill(rect(0, -20, 40, 60), { ...o, allowCross: true }))).toBeGreaterThan(4);
    // Noise: capped by its feature size.
    expect(maxWavyAmplitude(opts({ kind: 'noise', noiseScale: 12 }))).toBeCloseTo(
      12 / NOISE_MAX_SLOPE,
    );
  });

  it('noise: the same seed gives the same lines, another seed different ones', () => {
    const n = (seed: number) =>
      wavyFill(rect(0, 0, 30, 30), opts({ kind: 'noise', amplitude: 2, seed }));
    expect(n(7)).toEqual(n(7));
    expect(n(7)).not.toEqual(n(8));
    const f = perlin(3);
    expect(f(1.3, 2.7)).toBe(perlin(3)(1.3, 2.7));
  });

  it('keep pen down joins the rows into one zigzag where the joins stay inside', () => {
    const joined = wavyFill(rect(0, 0, 30, 20), opts({ connect: true, amplitude: 0.5 }));
    expect(joined).toHaveLength(1);
    for (const p of pts(joined)) expect(inside(p, 0, 0, 30, 20)).toBe(true);
    // A U shape: rows on both arms can't join across the gap.
    const u: FillRegion = {
      outer: [
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 20 },
          { x: 20, y: 20 },
          { x: 20, y: 0 },
          { x: 30, y: 0 },
          { x: 30, y: 30 },
          { x: 0, y: 30 },
        ],
      ],
      fillRule: 'nonzero',
    };
    const lines = wavyFill(u, opts({ angle: 90, connect: true, amplitude: 0.5 }));
    for (const l of lines)
      for (let i = 1; i < l.points.length; i++) {
        const a = l.points[i - 1]!;
        const b = l.points[i]!;
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        expect(m.x > 10.01 && m.x < 19.99 && m.y < 19.99).toBe(false); // never in the gap
      }
  });

  it('works as a layer fill type, with spacing from fill color', () => {
    const l = createLayer('a', 'A');
    l.fills = [{ ...rect(0, 0, 20, 20), color: '#808080' }];
    l.settings.fill = { type: 'waves', spacing: 2, angle: 0, inset: 0, connect: false };
    const plain = layerHatches(l).length;
    l.settings.fill = { ...l.settings.fill, densityFromColor: true };
    expect(layerHatches(l).length).toBeLessThan(plain); // gray: wider spacing
    l.settings.fill = { type: 'noise', spacing: 2, angle: 30, inset: 0, connect: false };
    expect(layerHatches(l).length).toBeGreaterThan(5);
  });
});
