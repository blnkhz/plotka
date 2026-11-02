import { describe, expect, it } from 'vitest';
import { applyTransforms, createLayer, createStep, type PlotDocument } from '../../src';

const doc = (): PlotDocument => {
  const l = createLayer('a', 'A');
  l.strokes = [
    {
      points: [
        { x: -1, y: 0 },
        { x: 1, y: 0 },
      ],
      closed: false,
    },
  ];
  return { width: 2, height: 0, layers: [l], warnings: [] };
};
const run = (params: Record<string, number | string | boolean>) => {
  const s = createStep('spiral');
  return applyTransforms(doc(), [{ ...s, params: { ...s.params, ...params } }]);
};
const mid = (s: { points: { x: number; y: number }[] }) => ({
  x: (s.points[0]!.x + s.points[1]!.x) / 2,
  y: (s.points[0]!.y + s.points[1]!.y) / 2,
});

describe('spiral repeat (GEN-4)', () => {
  it('copies from the inner to the outer radius over the given turns', () => {
    const out = run({ copies: 5, turns: 1, inner: 10, outer: 50, follow: false });
    const c = out.layers[0]!.strokes.map(mid);
    expect(c).toHaveLength(5);
    expect(Math.hypot(c[0]!.x, c[0]!.y)).toBeCloseTo(10);
    expect(Math.hypot(c[4]!.x, c[4]!.y)).toBeCloseTo(50);
    expect(c[2]!.x).toBeCloseTo(-30); // half a turn: opposite side, radius 30
  });
  it('sizes change evenly to the last copy size', () => {
    const out = run({ copies: 3, endSize: 300, follow: false });
    const len = (i: number) => {
      const s = out.layers[0]!.strokes[i]!;
      return Math.hypot(s.points[1]!.x - s.points[0]!.x, s.points[1]!.y - s.points[0]!.y);
    };
    expect([len(0), len(1), len(2)].map((x) => Math.round(x))).toEqual([2, 4, 6]);
  });
});
