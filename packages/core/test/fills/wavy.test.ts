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

describe('wave shapes', () => {
  const row = (ls: Polyline[], y: number) =>
    ls
      .filter((l) => Math.abs(l.points.reduce((s, p) => s + p.y, 0) / l.points.length - y) < 0.6)
      .sort((a, b) => b.points.length - a.points.length)[0]!;

  it('zigzag: straight lines between sharp corners at ± the amplitude', () => {
    const r = row(wavyFill(rect(0, -10, 40, 40), opts({ shape: 'triangle', amplitude: 1.5 })), 9);
    const ys = r.points.slice(1, -1).map((p) => Math.round((p.y - 9) * 1e6) / 1e6);
    expect(new Set(ys)).toEqual(new Set([1.5, -1.5])); // only corners inside the shape
    // Corners every half wavelength (5 mm).
    const xs = r.points.slice(1, -1).map((p) => p.x);
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeCloseTo(5);
  });

  it('square: flat runs and upright steps', () => {
    const r = row(wavyFill(rect(0, -10, 40, 40), opts({ shape: 'square', amplitude: 0.8 })), 9);
    for (const p of r.points) expect(Math.abs(Math.abs(p.y - 9) - 0.8)).toBeLessThan(1e-6);
    // Each step is two points at the same x.
    const steps = r.points.filter((p, i) => i > 0 && Math.abs(p.x - r.points[i - 1]!.x) < 1e-9);
    expect(steps.length).toBeGreaterThan(5);
  });

  it('caps the amplitude per shape so shifted lines never cross', () => {
    const base = { kind: 'waves' as const, spacing: 2, noiseScale: 1 };
    expect(maxWavyAmplitude({ ...base, phase: 180, shape: 'triangle' })).toBeCloseTo(1);
    expect(maxWavyAmplitude({ ...base, phase: 90, shape: 'triangle' })).toBeCloseTo(2);
    expect(maxWavyAmplitude({ ...base, phase: 10, shape: 'square' })).toBeCloseTo(1);
    // In step, square waves' upright steps would still overlap the next line's.
    expect(maxWavyAmplitude({ ...base, phase: 0, shape: 'square' })).toBeCloseTo(1);
    expect(maxWavyAmplitude({ ...base, phase: 0, shape: 'triangle' })).toBe(Infinity);
    expect(maxWavyAmplitude({ ...base, phase: 350, shape: 'sine' })).toBeCloseTo(
      2 / (2 * Math.sin(Math.PI / 36)),
    );
    // At the cap, neighbors stay apart everywhere.
    for (const shape of ['sine', 'triangle', 'square'] as const) {
      const lines = wavyFill(rect(0, -20, 30, 60), opts({ shape, phase: 120, amplitude: 50 }));
      const a = row(lines, 9);
      const b = row(lines, 11);
      const yAt = (l: Polyline, x: number) => {
        for (let i = 1; i < l.points.length; i++) {
          const p = l.points[i - 1]!;
          const q = l.points[i]!;
          if (x >= Math.min(p.x, q.x) && x <= Math.max(p.x, q.x) && q.x !== p.x)
            return p.y + ((x - p.x) / (q.x - p.x)) * (q.y - p.y);
        }
        return NaN;
      };
      for (let x = 1; x < 29; x += 0.25) {
        const ya = yAt(a, x);
        const yb = yAt(b, x);
        if (Number.isFinite(ya) && Number.isFinite(yb)) expect(yb).toBeGreaterThan(ya);
      }
    }
  });
});
