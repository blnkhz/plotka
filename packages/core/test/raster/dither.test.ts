import { describe, expect, it } from 'vitest';
import {
  defaultDitherSettings,
  ditherCells,
  ditherGrid,
  ditherImage,
  ditherMarks,
  ditherSvg,
  importSvg,
  inkLevels,
  isDot,
  MAX_CELLS,
  type DitherSettings,
} from '../../src';

const s = (o: Partial<DitherSettings> = {}): DitherSettings => ({
  ...defaultDitherSettings(),
  ...o,
});

/** RGBA pixels, all one grey (0 black .. 255 white). */
const flat = (n: number, grey: number, alpha = 255) =>
  Uint8Array.from({ length: n * 4 }, (_, i) => (i % 4 === 3 ? alpha : grey));

const share = (on: Uint8Array) => on.reduce((a, v) => a + v, 0) / on.length;

describe('image dithering', () => {
  it('sizes the grid in mm from the image proportions', () => {
    const g = ditherGrid(400, 300, s({ width: 100, cell: 2 }));
    expect(g.cols).toBe(50);
    expect(g.rows).toBe(38); // 75 mm / 2
    expect(g.cell).toBeCloseTo(2);
    expect(g.width).toBeCloseTo(100);
    expect(g.capped).toBe(false);
  });

  it('caps very fine grids by raising the cell size', () => {
    const g = ditherGrid(1000, 1000, s({ width: 1000, cell: 0.1 }));
    expect(g.capped).toBe(true);
    expect(g.cols * g.rows).toBeLessThanOrEqual(MAX_CELLS * 1.01);
    expect(g.cell).toBeGreaterThan(0.1);
  });

  it('ink follows darkness; transparent counts as paper; brightness, contrast, invert', () => {
    expect(inkLevels(flat(1, 0), s())[0]).toBeCloseTo(1);
    expect(inkLevels(flat(1, 255), s())[0]).toBeCloseTo(0);
    expect(inkLevels(flat(1, 0, 0), s())[0]).toBeCloseTo(0);
    const mid = inkLevels(flat(1, 128), s())[0]!;
    expect(inkLevels(flat(1, 128), s({ brightness: 30 }))[0]).toBeLessThan(mid);
    expect(inkLevels(flat(1, 100), s({ contrast: 2 }))[0]).toBeGreaterThan(
      inkLevels(flat(1, 100), s())[0]!,
    );
    expect(inkLevels(flat(1, 0), s({ invert: true }))[0]).toBeCloseTo(0);
  });

  for (const method of ['ordered', 'diffusion'] as const)
    it(`${method}: the share of marks matches the grey`, () => {
      for (const grey of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        const ink = new Float32Array(64 * 64).fill(grey);
        expect(share(ditherCells(ink, 64, 64, method))).toBeCloseTo(grey, 1);
      }
      expect(share(ditherCells(new Float32Array(64).fill(0), 8, 8, method))).toBe(0);
      expect(share(ditherCells(new Float32Array(64).fill(1), 8, 8, method))).toBe(1);
    });

  it('marks: one shape per inked cell, rows back and forth', () => {
    const grid = ditherGrid(3, 2, s({ width: 3, cell: 1 }));
    const on = Uint8Array.from([1, 1, 1, 1, 1, 1]);
    const centers = ditherMarks(on, grid, s({ shape: 'dot' })).map((m) => m.points[0]!.x);
    expect(centers).toEqual([0.5, 1.5, 2.5, 2.5, 1.5, 0.5]);
    expect(ditherMarks(on, grid, s({ shape: 'dot' })).every(isDot)).toBe(true);
    expect(ditherMarks(on, grid, s({ shape: 'x' }))).toHaveLength(12); // two strokes each
    const square = ditherMarks(on, grid, s({ shape: 'square', markSize: 50 }))[0]!;
    expect(square.closed).toBe(true);
    expect(square.points[1]!.x - square.points[0]!.x).toBeCloseTo(0.5);
    const line = ditherMarks(on, grid, s({ shape: 'line', lineAngle: 90, markSize: 100 }))[0]!;
    expect(line.points[0]!.x).toBeCloseTo(line.points[1]!.x); // upright
  });

  it('the SVG is in mm and imports with every mark', () => {
    const grid = ditherGrid(20, 10, s({ width: 40, cell: 2 }));
    const black = flat(grid.cols * grid.rows, 0);
    const result = ditherImage(black, grid, s({ width: 40, cell: 2, shape: 'line' }));
    expect(result.marks).toHaveLength(grid.cols * grid.rows);
    const doc = importSvg(ditherSvg(result));
    expect(doc.width).toBeCloseTo(40);
    expect(doc.height).toBeCloseTo(20);
    const strokes = doc.layers.flatMap((l) => l.strokes);
    expect(strokes).toHaveLength(result.marks.length);
  });

  it('dots survive the SVG round trip as taps', () => {
    const grid = ditherGrid(2, 1, s({ width: 2, cell: 1 }));
    const doc = importSvg(ditherSvg(ditherImage(flat(2, 0), grid, s({ shape: 'dot' }))));
    const strokes = doc.layers.flatMap((l) => l.strokes);
    expect(strokes).toHaveLength(2);
    expect(strokes.every(isDot)).toBe(true);
  });
});
