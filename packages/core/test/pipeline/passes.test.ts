import { describe, expect, it } from 'vitest';
import {
  applyPasses,
  createLayer,
  defaultPageSetup,
  defaultPassSettings,
  passMatrix,
  applyToPoint,
  processDocument,
  type PassSettings,
  type PlotDocument,
} from '../../src';

const doc = (passes: Partial<PassSettings> | null): PlotDocument => {
  const l = createLayer('a', 'Lines', '#000000');
  l.strokes = [
    {
      points: [
        { x: 10, y: 10 },
        { x: 30, y: 10 },
      ],
      closed: false,
    },
    {
      points: [
        { x: 10, y: 30 },
        { x: 30, y: 30 },
      ],
      closed: false,
    },
  ];
  l.settings.passes = passes ? { ...defaultPassSettings(), ...passes } : null;
  return { width: 40, height: 40, layers: [l], warnings: [] };
};

describe('passes', () => {
  it('off by default and with count 1', () => {
    expect(applyPasses(doc(null)).layers).toHaveLength(1);
    expect(applyPasses(doc({ count: 1 })).layers).toHaveLength(1);
  });

  it('one layer per pass, with its own id, name, color and source', () => {
    const out = applyPasses(doc({ count: 3, colors: ['#0000ff', '#ff0000'] })).layers;
    expect(out.map((l) => l.id)).toEqual(['a~1', 'a~2', 'a~3']);
    expect(out.map((l) => l.name)).toEqual(['Lines · pass 1', 'Lines · pass 2', 'Lines · pass 3']);
    expect(out.map((l) => l.color)).toEqual(['#0000ff', '#ff0000', '#0000ff']); // cycled
    expect(out[1]!.passOf).toEqual({ layerId: 'a', index: 1, count: 3 });
  });

  it('spreads offsets around the original; the middle pass stays put', () => {
    const out = applyPasses(doc({ count: 3, offsetX: 0.5, offsetY: -0.2, rotate: 0 })).layers;
    const x0 = out.map((l) => l.strokes[0]!.points[0]!.x);
    const y0 = out.map((l) => l.strokes[0]!.points[0]!.y);
    expect(x0[0]).toBeCloseTo(9.5);
    expect(x0[1]).toBeCloseTo(10);
    expect(x0[2]).toBeCloseTo(10.5);
    expect(y0[0]).toBeCloseTo(10.2);
    expect(y0[2]).toBeCloseTo(9.8);
  });

  it('rotates and scales around the center of the content', () => {
    const p = { ...defaultPassSettings(), count: 2, offsetX: 0, rotate: 2, scale: 4 };
    const c = { x: 20, y: 20 };
    for (const k of [0, 1]) {
      const m = passMatrix(p, k, c);
      const q = applyToPoint(m, c.x, c.y);
      expect(q.x).toBeCloseTo(20);
      expect(q.y).toBeCloseTo(20);
    }
    // Pass 2 (t = +0.5): 1° turn and 2% bigger relative to the original.
    const q = applyToPoint(passMatrix(p, 1, c), 30, 20);
    expect(Math.hypot(q.x - 20, q.y - 20)).toBeCloseTo(10.2);
    expect((Math.atan2(q.y - 20, q.x - 20) * 180) / Math.PI).toBeCloseTo(1);
  });

  it('runs after fills in the pipeline, so each pass gets its own toolpath layer', () => {
    const d = doc({ count: 3 });
    const r = processDocument({
      doc: d,
      page: defaultPageSetup(),
      bed: { width: 430, height: 297 },
    });
    expect(r.toolpath.layers.map((l) => l.layerId)).toEqual(['a~1', 'a~2', 'a~3']);
    expect(r.toolpath.layers.every((l) => l.paths.length === 2)).toBe(true);
  });
});
