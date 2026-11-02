import { describe, expect, it } from 'vitest';
import {
  applyTransforms,
  createLayer,
  createStep,
  documentBounds,
  type PlotDocument,
} from '../../src';

const doc = (): PlotDocument => {
  const l = createLayer('a', 'A');
  // A spoke from the center (0, 0) to (10, 0), plus a point at (-10, 0) to center the bounds.
  l.strokes = [
    {
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      closed: false,
    },
    {
      points: [
        { x: -10, y: 0 },
        { x: -10, y: 0 },
      ],
      closed: false,
    },
  ];
  return { width: 20, height: 0, layers: [l], warnings: [] };
};
const run = (params: Record<string, number | string>) => {
  const s = createStep('symmetry');
  return applyTransforms(doc(), [{ ...s, params: { ...s.params, ...params } }]);
};

describe('symmetry (GEN-2)', () => {
  it('N copies turned evenly around the center', () => {
    const out = run({ copies: 4 });
    const ends = out.layers[0]!.strokes.filter((_, i) => i % 2 === 0).map((s) => s.points[1]!);
    expect(ends.map((p) => [Math.round(p.x), Math.round(p.y)] + '')).toEqual([
      '10,0',
      '0,10',
      '-10,0',
      '0,-10',
    ]);
  });
  it('mirroring adds copies (both = 4 per turn)', () => {
    expect(run({ copies: 3, mirror: 'x' }).layers[0]!.strokes).toHaveLength(12);
    expect(run({ copies: 3, mirror: 'both' }).layers[0]!.strokes).toHaveLength(24);
  });
  it('keeps the center; one copy without mirror changes nothing', () => {
    const b = documentBounds(run({ copies: 6 }));
    expect((b.minX + b.maxX) / 2).toBeCloseTo(0);
    expect(run({ copies: 1 }).layers[0]!.strokes).toEqual(doc().layers[0]!.strokes);
  });
});
