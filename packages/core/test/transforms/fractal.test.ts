import { describe, expect, it } from 'vitest';
import {
  applyTransforms,
  createLayer,
  createStep,
  fractal,
  MAX_FRACTAL_COPIES,
  type PlotDocument,
} from '../../src';

type P = Record<string, number | string | boolean>;
/** A 10 mm horizontal line centered on the origin. */
const doc = (points = 2): PlotDocument => {
  const l = createLayer('a', 'A');
  l.strokes = [
    {
      points: Array.from({ length: points }, (_, i) => ({ x: -5 + (10 * i) / (points - 1), y: 0 })),
      closed: false,
    },
  ];
  return { width: 10, height: 0, layers: [l], warnings: [] };
};
const run = (params: P, d = doc()) => {
  const s = createStep('fractal');
  return applyTransforms(d, [{ ...s, params: { ...s.params, ...params } }]);
};
const strokes = (d: PlotDocument) => d.layers[0]!.strokes;
const len = (s: { points: { x: number; y: number }[] }) => {
  const a = s.points[0]!;
  const b = s.points[s.points.length - 1]!;
  return Math.hypot(b.x - a.x, b.y - a.y);
};

describe('fractal (GEN-3)', () => {
  it('makes copies^levels copies, or every level when kept', () => {
    expect(strokes(run({ copies: 3, levels: 4, minSize: 0 }))).toHaveLength(81);
    expect(strokes(run({ copies: 2, levels: 3, minSize: 0, keep: true }))).toHaveLength(
      1 + 2 + 4 + 8,
    );
  });

  it('composes size, turn and position level after level', () => {
    const out = run({ copies: 1, levels: 2, minSize: 0, size1: 50, turn1: 90, x1: 100, y1: 0 });
    const s = strokes(out);
    expect(s).toHaveLength(1);
    expect(len(s[0]!)).toBeCloseTo(2.5); // 10 mm × 50% × 50%
    // Level 1: centered at (10, 0), vertical. Level 2 is the same map applied inside it: the
    // offset (10, 0), turned 90° and halved, adds (0, 5).
    const mid = {
      x: (s[0]!.points[0]!.x + s[0]!.points[1]!.x) / 2,
      y: (s[0]!.points[0]!.y + s[0]!.points[1]!.y) / 2,
    };
    expect(mid.x).toBeCloseTo(10);
    expect(mid.y).toBeCloseTo(5);
    expect(s[0]!.points[0]!.y).toBeCloseTo(s[0]!.points[1]!.y); // turned 180° in all: horizontal
  });

  it('the smallest-copy cutoff stops branches and draws their last copy', () => {
    // 50% per level: level 3 is 12.5%, level 4 6.25%. A 10% cutoff stops at level 3.
    const out = run({ copies: 2, levels: 8, minSize: 10 });
    expect(strokes(out)).toHaveLength(8);
    for (const s of strokes(out)) expect(len(s)).toBeCloseTo(1.25);
  });

  it('caps the copies with a warning', () => {
    const out = run({ copies: 4, levels: 12, minSize: 0 });
    expect(strokes(out).length).toBe(MAX_FRACTAL_COPIES);
    expect(out.warnings.some((w) => w.startsWith('Fractal stopped'))).toBe(true);
  });

  it('presets only set known params, and fill every copy slot', () => {
    const keys = new Set(fractal.params.map((p) => p.key));
    for (const pr of fractal.presets!) {
      for (const k of Object.keys(pr.params)) expect(keys.has(k)).toBe(true);
      expect(Object.keys(pr.params).length).toBe(keys.size);
      expect(strokes(run(pr.params)).length).toBeGreaterThan(1);
    }
  });

  it('shows only the fields of the copies in use', () => {
    const shown = (copies: number) =>
      fractal.params.filter((p) => !p.visible || p.visible({ copies })).map((p) => p.key);
    expect(shown(2)).toContain('size2');
    expect(shown(2)).not.toContain('size3');
    expect(shown(4)).toContain('y4');
  });
});
