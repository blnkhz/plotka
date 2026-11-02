import { describe, expect, it } from 'vitest';
import {
  bezierPoint,
  defaultDoodleSettings,
  doodleToSvg,
  findCorners,
  fitCubics,
  importSvg,
  processStroke,
  resample,
  simplifyLines,
  smoothPath,
  type DoodleSettings,
  type Vec2,
} from '../../src';

const settings = (o: Partial<DoodleSettings> = {}): DoodleSettings => ({
  ...defaultDoodleSettings(),
  ...o,
});

/** A hand-drawn-ish circle: radius 20 with deterministic wobble. */
const wobblyCircle = (closeGapMm = 0): Vec2[] => {
  const pts: Vec2[] = [];
  const n = 400;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * (2 * Math.PI - closeGapMm / 20);
    const r = 20 + 0.3 * Math.sin(i * 1.7) + 0.2 * Math.sin(i * 5.3);
    pts.push({ x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) });
  }
  return pts;
};
/** A square drawn as one stroke, 30 mm sides, slight jitter. */
const square = (): Vec2[] => {
  const c: Vec2[] = [
    { x: 10, y: 10 },
    { x: 40, y: 10 },
    { x: 40, y: 40 },
    { x: 10, y: 40 },
  ];
  const pts: Vec2[] = [];
  for (let k = 0; k < 4; k++) {
    const a = c[k]!;
    const b = c[(k + 1) % 4]!;
    for (let i = 0; i < 60; i++) {
      const t = i / 60;
      pts.push({
        x: a.x + (b.x - a.x) * t + 0.1 * Math.sin(i),
        y: a.y + (b.y - a.y) * t + 0.1 * Math.cos(i * 1.3),
      });
    }
  }
  pts.push({ x: 10.5, y: 10.3 });
  return pts;
};
const radiusErr = (pts: Vec2[]) =>
  Math.max(...pts.map((p) => Math.abs(Math.hypot(p.x - 50, p.y - 50) - 20)));

describe('doodle building blocks', () => {
  it('resample spaces points evenly and keeps the ends', () => {
    const r = resample(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      1,
    );
    expect(r).toHaveLength(11);
    expect(r[10]).toEqual({ x: 10, y: 0 });
  });
  it('smoothing reduces wobble and keeps the ends', () => {
    const pts = resample(wobblyCircle());
    const s = smoothPath(pts, 8);
    expect(radiusErr(s.slice(20, -20))).toBeLessThan(radiusErr(pts.slice(20, -20)) * 0.6);
    expect(s[0]).toEqual(pts[0]);
    expect(s[s.length - 1]).toEqual(pts[pts.length - 1]);
  });
  it('finds the four corners of a square, not the wobble', () => {
    expect(findCorners(resample(square()))).toHaveLength(3); // the start corner is an end point
  });
  it('simplifyLines keeps corners within tolerance', () => {
    const l = simplifyLines(
      [
        { x: 0, y: 0 },
        { x: 5, y: 0.01 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      0.05,
    );
    expect(l).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
  });
  it('fitCubics follows the points within tolerance with few curves', () => {
    const pts = Array.from({ length: 200 }, (_, i) => {
      const a = (i / 199) * Math.PI;
      return { x: 30 * Math.cos(a), y: 30 * Math.sin(a) };
    });
    const curves = fitCubics(pts, 0.05);
    expect(curves.length).toBeLessThanOrEqual(6);
    for (const c of curves)
      for (let t = 0; t <= 1; t += 0.05) {
        const q = bezierPoint(c, t);
        expect(Math.abs(Math.hypot(q.x, q.y) - 30)).toBeLessThan(0.1);
      }
    expect(curves[0]![0]).toEqual(pts[0]);
    expect(curves[curves.length - 1]![3]).toEqual(pts[pts.length - 1]);
  });
});

describe('processStroke', () => {
  it('curves: a smoothed circle becomes a handful of Béziers close to the true circle', () => {
    const p = processStroke({ points: wobblyCircle() }, settings({ smoothing: 60, closeGap: 0 }))!;
    expect(p.kind).toBe('curves');
    if (p.kind !== 'curves') return;
    expect(p.curves.length).toBeLessThan(20);
    const samples = p.curves.flatMap((c) => [0.25, 0.5, 0.75].map((t) => bezierPoint(c, t)));
    expect(radiusErr(samples)).toBeLessThan(0.6);
  });
  it('lines: few straight segments, more smoothing = fewer points', () => {
    const lo = processStroke(
      { points: wobblyCircle() },
      settings({ style: 'lines', smoothing: 10 }),
    )!;
    const hi = processStroke(
      { points: wobblyCircle() },
      settings({ style: 'lines', smoothing: 90 }),
    )!;
    if (lo.kind !== 'lines' || hi.kind !== 'lines') throw new Error('expected lines');
    expect(hi.points.length).toBeLessThan(lo.points.length);
    expect(hi.points.length).toBeLessThan(40);
  });
  it('keeps sharp corners when asked', () => {
    const s = settings({ style: 'lines', smoothing: 80, closeGap: 3 });
    const kept = processStroke({ points: square() }, s)!;
    const lost = processStroke({ points: square() }, { ...s, keepCorners: false })!;
    if (kept.kind !== 'lines' || lost.kind !== 'lines') throw new Error('expected lines');
    const nearCorner = (pts: Vec2[]) => pts.some((p) => Math.hypot(p.x - 40, p.y - 40) < 0.6);
    expect(nearCorner(kept.points)).toBe(true);
    expect(nearCorner(lost.points)).toBe(false);
    expect(kept.closed).toBe(true);
  });
  it('closes a stroke whose ends meet, not one that stays open', () => {
    expect(processStroke({ points: wobblyCircle(1) }, settings({ closeGap: 3 }))!.closed).toBe(
      true,
    );
    expect(processStroke({ points: wobblyCircle(10) }, settings({ closeGap: 3 }))!.closed).toBe(
      false,
    );
    expect(processStroke({ points: wobblyCircle(1) }, settings({ closeGap: 0 }))!.closed).toBe(
      false,
    );
  });
  it('ignores a tap with no length', () => {
    expect(processStroke({ points: [{ x: 1, y: 1 }] }, settings())).toBeNull();
  });
});

describe('doodleToSvg', () => {
  it('writes curves or lines that import back at the right size, filled when closed', () => {
    const strokes = [
      { points: wobblyCircle(1) },
      {
        points: [
          { x: 5, y: 90 },
          { x: 95, y: 92 },
        ],
      },
    ];
    const curves = doodleToSvg(strokes, settings({ fillClosed: true }), {
      width: 100,
      height: 100,
    });
    expect(curves).toMatch(/C\d/);
    expect(curves).toContain('width="100mm"');
    const doc = importSvg(curves);
    expect(doc.width).toBeCloseTo(100);
    expect(doc.layers[0]!.strokes.length).toBe(2);
    expect(doc.layers[0]!.fills.length).toBe(1);

    const lines = doodleToSvg(strokes, settings({ style: 'lines' }), { width: 100, height: 100 });
    expect(lines).not.toMatch(/C\d/);
    expect(importSvg(lines).layers[0]!.fills).toHaveLength(0);
  });
});
