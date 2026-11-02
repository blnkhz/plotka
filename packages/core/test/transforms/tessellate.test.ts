import { describe, expect, it } from 'vitest';
import {
  applyTransforms,
  createLayer,
  createStep,
  documentBounds,
  WALLPAPER_GROUPS,
  type PipelineStep,
  type PlotDocument,
} from '../../src';

/** An "F": asymmetric, so every rotation and mirror is visible. Plus a filled square. */
const motif = (): PlotDocument => {
  const l = createLayer('a', 'A');
  l.strokes = [
    {
      points: [
        { x: 0, y: 10 },
        { x: 0, y: 0 },
        { x: 6, y: 0 },
      ],
      closed: false,
    },
    {
      points: [
        { x: 0, y: 5 },
        { x: 4, y: 5 },
      ],
      closed: false,
    },
  ];
  l.fills = [
    {
      outer: [
        [
          { x: 2, y: 7 },
          { x: 4, y: 7 },
          { x: 4, y: 9 },
          { x: 2, y: 9 },
        ],
      ],
      fillRule: 'nonzero',
    },
  ];
  return { width: 6, height: 10, layers: [l], warnings: [] };
};
const step = (params: PipelineStep['params']): PipelineStep => {
  const s = createStep('tessellate');
  return { ...s, params: { ...s.params, ...params } };
};

describe('tessellate', () => {
  it('is registered with a pattern menu covering every group', () => {
    const s = createStep('tessellate');
    expect(s.params['pattern']).toBe('p6m');
  });

  for (const g of WALLPAPER_GROUPS)
    it(`${g.id}: fills the trimmed rectangle with copies`, () => {
      const out = applyTransforms(motif(), [
        step({ pattern: g.id, columns: 3, rows: 3, cellSize: 20 }),
      ]);
      const l = out.layers[0]!;
      expect(l.strokes.length).toBeGreaterThan(g.ops.length * 2);
      const b = documentBounds(out);
      // Trimmed to columns × cell width, rows × row height.
      const rowH = g.lattice === 'hex' ? (20 * Math.sqrt(3)) / 2 : 20;
      expect(b.minX).toBeGreaterThanOrEqual(-1e-6);
      expect(b.minY).toBeGreaterThanOrEqual(-1e-6);
      expect(b.maxX).toBeLessThanOrEqual(60 + 1e-6);
      expect(b.maxY).toBeLessThanOrEqual(3 * rowH + 1e-6);
      expect(out.warnings).toHaveLength(0);
    });

  it('more operations means more copies per cell', () => {
    const count = (pattern: string) =>
      applyTransforms(motif(), [step({ pattern, columns: 4, rows: 4, cellSize: 20, trim: false })])
        .layers[0]!.strokes.length;
    expect(count('p6m')).toBeGreaterThan(count('p6'));
    expect(count('p4m')).toBeGreaterThan(count('p4'));
    expect(count('p4')).toBeGreaterThan(count('p1'));
  });

  it('without trimming keeps whole copies inside the area', () => {
    const out = applyTransforms(motif(), [
      step({ pattern: 'p4', columns: 2, rows: 2, cellSize: 20, trim: false }),
    ]);
    // 2 × 2 cells × 4 quarter turns, 2 strokes each (whole, since each copy is placed by its center).
    expect(out.layers[0]!.strokes).toHaveLength(32);
  });

  it('clipping keeps copies inside their piece; turning it off lets big artwork overlap', () => {
    const clipped = applyTransforms(motif(), [
      step({ pattern: 'p1', columns: 1, rows: 1, cellSize: 20, motifScale: 300, trim: false }),
    ]);
    const free = applyTransforms(motif(), [
      step({
        pattern: 'p1',
        columns: 1,
        rows: 1,
        cellSize: 20,
        motifScale: 300,
        clip: false,
        trim: false,
      }),
    ]);
    const cb = documentBounds(clipped);
    expect(cb.maxX - cb.minX).toBeLessThanOrEqual(20 + 1e-6);
    const fb = documentBounds(free);
    expect(fb.maxY - fb.minY).toBeGreaterThan(20);
  });

  it('cell height changes rectangular patterns only', () => {
    const tall = applyTransforms(motif(), [
      step({ pattern: 'pmm', columns: 1, rows: 1, aspect: 200 }),
    ]);
    const normal = applyTransforms(motif(), [step({ pattern: 'pmm', columns: 1, rows: 1 })]);
    expect(tall.height).toBeGreaterThan(normal.height * 1.5);
    expect(tall.height).toBeLessThanOrEqual(80 + 1e-6);
    const sq = applyTransforms(motif(), [
      step({ pattern: 'p4', columns: 1, rows: 1, aspect: 200 }),
    ]);
    expect(sq.height).toBeLessThanOrEqual(40 + 1e-6);
  });

  it('fill regions are copied and clipped too', () => {
    const out = applyTransforms(motif(), [step({ pattern: 'p6m', columns: 2, rows: 2 })]);
    expect(out.layers[0]!.fills.length).toBeGreaterThan(12);
  });

  it('stops at the size cap with a warning', () => {
    const d = motif();
    d.layers[0]!.strokes = [
      {
        points: Array.from({ length: 20000 }, (_, i) => ({ x: i * 0.001, y: Math.sin(i) })),
        closed: false,
      },
    ];
    const out = applyTransforms(d, [step({ pattern: 'p6m', columns: 20, rows: 20, clip: false })]);
    expect(out.warnings.some((w) => /Tessellate stopped/.test(w))).toBe(true);
  });
});
