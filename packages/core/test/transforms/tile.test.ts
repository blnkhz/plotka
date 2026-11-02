import { describe, expect, it } from 'vitest';
import {
  applyTransforms,
  createLayer,
  createStep,
  documentBounds,
  getTransform,
  MAX_TILE_POINTS,
  TRANSFORMS,
  type PipelineStep,
  type PlotDocument,
} from '../../src';

/** A 10 × 10 mm square outline at (0, 0), plus an L-shaped stroke to tell orientation. */
const motif = (): PlotDocument => {
  const l = createLayer('a', 'A');
  l.strokes = [
    {
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      closed: true,
    },
    {
      points: [
        { x: 2, y: 2 },
        { x: 2, y: 8 },
        { x: 5, y: 8 },
      ],
      closed: false,
    },
  ];
  return { width: 10, height: 10, layers: [l], warnings: [] };
};
const step = (params: PipelineStep['params']): PipelineStep => ({
  ...createStep('tile'),
  params: { ...createStep('tile').params, ...params },
});
const tileStarts = (d: PlotDocument) =>
  d.layers[0]!.strokes.filter((s) => s.closed).map((s) => s.points[0]!);
const round = (v: { x: number; y: number }) => ({ x: +v.x.toFixed(6) + 0, y: +v.y.toFixed(6) + 0 });

describe('transform registry', () => {
  it('has tile with defaults for every param, and unique keys', () => {
    const t = getTransform('tile')!;
    expect(TRANSFORMS).toContain(t);
    expect(new Set(t.params.map((p) => p.key)).size).toBe(t.params.length);
    const s = createStep('tile');
    for (const p of t.params) expect(s.params[p.key]).toBe(p.default);
  });
  it('skips disabled steps and warns about unknown ones', () => {
    const d = motif();
    expect(applyTransforms(d, [{ ...step({ columns: 3 }), enabled: false }])).toBe(d);
    const out = applyTransforms(d, [{ id: 'x', type: 'nope', enabled: true, params: {} }]);
    expect(out.warnings[0]).toMatch(/Unknown transform/);
  });
});

describe('tile', () => {
  it('columns × rows copies at the cell size plus gap', () => {
    const out = applyTransforms(motif(), [step({ columns: 3, rows: 2, gapX: 5, gapY: 2 })]);
    expect(out.layers[0]!.strokes).toHaveLength(12);
    const starts = tileStarts(out).map(round);
    expect(starts).toEqual([
      { x: 0, y: 0 },
      { x: 15, y: 0 },
      { x: 30, y: 0 },
      { x: 0, y: 12 },
      { x: 15, y: 12 },
      { x: 30, y: 12 },
    ]);
    expect(out.width).toBeCloseTo(40);
    expect(out.height).toBeCloseTo(22);
  });

  it('brick (row shift) and half-drop (column shift)', () => {
    const brick = tileStarts(
      applyTransforms(motif(), [step({ columns: 2, rows: 2, rowShift: 50 })]),
    );
    expect(round(brick[2]!)).toEqual({ x: 5, y: 10 });
    const drop = tileStarts(
      applyTransforms(motif(), [step({ columns: 2, rows: 1, columnShift: 50 })]),
    );
    expect(round(drop[1]!)).toEqual({ x: 10, y: 5 });
  });

  it('mirrors every other column', () => {
    const out = applyTransforms(motif(), [step({ columns: 2, rows: 1, mirror: 'columns' })]);
    const ls = out.layers[0]!.strokes.filter((s) => !s.closed);
    // The L's vertical bar is at x = 2 in tile 1 and mirrored to x = 18 in tile 2.
    expect(ls[0]!.points[0]!.x).toBeCloseTo(2);
    expect(ls[1]!.points[0]!.x).toBeCloseTo(18);
  });

  it('rotates tiles around their own centers, and the grid by its angle', () => {
    const out = applyTransforms(motif(), [step({ columns: 1, rows: 1, rotation: 90 })]);
    const b = documentBounds(out);
    expect(b.maxX - b.minX).toBeCloseTo(10);
    const l = out.layers[0]!.strokes[1]!.points[0]!; // (2, 2) turned 90° about (5, 5) → (8, 2)
    expect(round(l)).toEqual({ x: 8, y: 2 });
    const grid = applyTransforms(motif(), [step({ columns: 3, rows: 1, angle: 90 })]);
    const gb = documentBounds(grid);
    expect(gb.maxY - gb.minY).toBeCloseTo(30);
    expect(gb.maxX - gb.minX).toBeCloseTo(10);
  });

  it('jitter is repeatable with the same seed and changes with another', () => {
    const p = { columns: 3, rows: 3, rotationJitter: 30, scaleJitter: 20 };
    const a = applyTransforms(motif(), [step({ ...p, seed: 7 })]);
    const b = applyTransforms(motif(), [step({ ...p, seed: 7 })]);
    const c = applyTransforms(motif(), [step({ ...p, seed: 8 })]);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('tiles fill regions too, and steps stack in order', () => {
    const d = motif();
    d.layers[0]!.fills = [{ outer: [d.layers[0]!.strokes[0]!.points], fillRule: 'nonzero' }];
    const out = applyTransforms(d, [step({ columns: 2, rows: 1 }), step({ columns: 1, rows: 3 })]);
    expect(out.layers[0]!.fills).toHaveLength(6);
  });

  it('stops at the size cap with a warning', () => {
    const d = motif();
    const many = Array.from({ length: 2000 }, (_, i) => ({ x: i * 0.005, y: 0 }));
    d.layers[0]!.strokes = [{ points: many, closed: false }];
    const out = applyTransforms(d, [step({ columns: 100, rows: 100 })]);
    const pts = out.layers[0]!.strokes.reduce((n, s) => n + s.points.length, 0);
    expect(pts).toBeLessThanOrEqual(MAX_TILE_POINTS);
    expect(out.warnings.some((w) => /Tile stopped/.test(w))).toBe(true);
  });
});
