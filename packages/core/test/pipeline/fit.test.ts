import { describe, expect, it } from 'vitest';
import {
  clipPolylines,
  clipRing,
  createLayer,
  defaultPageSetup,
  documentBounds,
  fitToPage,
  marginBox,
  paperSize,
  processDocument,
  type PageSetup,
  type PlotDocument,
} from '../../src';

const doc = (pts: [number, number][], w = 100, h = 100): PlotDocument => {
  const layer = createLayer('l1', 'L');
  layer.strokes.push({ points: pts.map(([x, y]) => ({ x, y })), closed: false });
  return { width: w, height: h, layers: [layer], warnings: [] };
};
const page = (p: Partial<PageSetup>): PageSetup => ({ ...defaultPageSetup(), ...p });
const r3 = (n: number) => Math.round(n * 1000) / 1000 + 0;
const bounds = (d: PlotDocument) => {
  const b = documentBounds(d);
  return [r3(b.minX), r3(b.minY), r3(b.maxX), r3(b.maxY)];
};

describe('paper (PAGE-1)', () => {
  it('presets and orientation', () => {
    expect(paperSize(page({ paper: 'a4' }))).toEqual({ width: 210, height: 297 });
    expect(paperSize(page({ paper: 'a4', orientation: 'landscape' }))).toEqual({
      width: 297,
      height: 210,
    });
    expect(paperSize(page({ paper: 'letter' })).width).toBeCloseTo(215.9);
    expect(paperSize(page({ paper: 'custom', customWidth: 300, customHeight: 100 }))).toEqual({
      width: 100,
      height: 300,
    });
  });
  it('margin box', () => {
    expect(marginBox(page({ margins: { top: 10, right: 20, bottom: 30, left: 40 } }))).toEqual({
      x: 40,
      y: 10,
      width: 150,
      height: 257,
    });
  });
});

describe('fitToPage (PAGE-2)', () => {
  const square = doc([
    [10, 10],
    [60, 10],
    [60, 60],
  ]); // 50x50 art
  const box = { margins: { top: 10, right: 10, bottom: 10, left: 10 } };

  it('fit: scales into the margin box and centers', () => {
    const out = fitToPage(square, page({ ...box, fit: 'fit' }));
    // A4 portrait, 190x277 box, 50x50 art -> 190x190 centered vertically
    expect(bounds(out)).toEqual([10, 53.5, 200, 243.5]);
    expect(out.width).toBe(210);
  });
  it('original: keeps size, aligns top-left', () => {
    expect(bounds(fitToPage(square, page({ ...box, fit: 'original', align: 'top-left' })))).toEqual(
      [10, 10, 60, 60],
    );
  });
  it('all 9 anchors', () => {
    const at = (align: PageSetup['align']) =>
      bounds(fitToPage(square, page({ ...box, fit: 'original', align }))).slice(0, 2);
    expect(at('top-right')).toEqual([150, 10]);
    expect(at('bottom-left')).toEqual([10, 237]);
    expect(at('center')).toEqual([80, 123.5]);
    expect(at('bottom')).toEqual([80, 237]);
  });
  it('manual scale and offset', () => {
    const out = fitToPage(
      square,
      page({ ...box, fit: 'original', align: 'top-left', scale: 200, offsetX: 5, offsetY: -5 }),
    );
    expect(bounds(out)).toEqual([15, 5, 115, 105]);
  });
  it('rotation by 90 swaps the aspect before fitting', () => {
    const wide = doc([
      [0, 0],
      [100, 50],
    ]);
    const out = fitToPage(wide, page({ ...box, fit: 'original', align: 'top-left', rotation: 90 }));
    expect(bounds(out)).toEqual([10, 10, 60, 110]);
  });
  it('fill: covers the box and crops the overflow', () => {
    const wide = doc([
      [0, 0],
      [200, 0],
      [200, 100],
      [0, 100],
      [0, 0],
    ]);
    const out = fitToPage(wide, page({ ...box, fit: 'fill' }));
    expect(bounds(out)).toEqual([10, 10, 200, 287]);
  });
  it("align 'file' keeps the artboard layout", () => {
    expect(bounds(fitToPage(square, page({ align: 'file' })))).toEqual([10, 10, 60, 60]);
  });
});

describe('clipping (PAGE-3)', () => {
  const rect = { x: 0, y: 0, width: 10, height: 10 };
  it('splits a line crossing the rect', () => {
    const { inside, outside } = clipPolylines(
      [
        {
          points: [
            { x: -5, y: 5 },
            { x: 15, y: 5 },
          ],
          closed: false,
        },
      ],
      rect,
    );
    expect(inside.map((l) => l.points)).toEqual([
      [
        { x: 0, y: 5 },
        { x: 10, y: 5 },
      ],
    ]);
    expect(outside).toHaveLength(2);
  });
  it('keeps fully inside lines untouched', () => {
    const line = {
      points: [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
      closed: true,
    };
    expect(clipPolylines([line], rect).inside[0]).toBe(line);
  });
  it('line leaving and re-entering gives two inside pieces', () => {
    const { inside } = clipPolylines(
      [
        {
          points: [
            { x: 2, y: 2 },
            { x: 2, y: 20 },
            { x: 8, y: 20 },
            { x: 8, y: 2 },
          ],
          closed: false,
        },
      ],
      rect,
    );
    expect(inside).toHaveLength(2);
  });
  it('clips a ring', () => {
    const ring = clipRing(
      [
        { x: -5, y: -5 },
        { x: 5, y: -5 },
        { x: 5, y: 5 },
        { x: -5, y: 5 },
      ],
      rect,
    );
    const xs = ring.map((p) => p.x);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(5);
  });
  it('processDocument clips to paper ∩ bed and flags paper larger than bed', () => {
    const d = doc([
      [0, 0],
      [500, 0],
    ]);
    const res = processDocument({
      doc: d,
      page: page({ paper: 'a3', orientation: 'landscape', align: 'file' }),
      bed: { width: 430, height: 297 },
    });
    expect(res.printable).toEqual({ x: 0, y: 0, width: 420, height: 297 });
    expect(res.paperExceedsBed).toBe(false);
    expect(bounds(res.clipped)).toEqual([0, 0, 420, 0]);
    expect(res.outside.get('l1')).toHaveLength(1);
    const big = processDocument({
      doc: d,
      page: page({ paper: 'a3' }),
      bed: { width: 430, height: 297 },
    });
    expect(big.paperExceedsBed).toBe(true);
  });
});

describe('moving and resizing layers', () => {
  // Two layers: a 20 × 10 box at the top left and a dot far away, so the page fit is known.
  const twoLayers = (placement?: { dx: number; dy: number; sx: number; sy: number }) => {
    const a = createLayer('a', 'A');
    a.strokes.push({
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 10 },
        { x: 0, y: 10 },
      ],
      closed: true,
    });
    if (placement) a.settings.placement = placement;
    const b = createLayer('b', 'B');
    b.strokes.push({
      points: [
        { x: 100, y: 100 },
        { x: 100, y: 100 },
      ],
      closed: false,
    });
    return { width: 100, height: 100, layers: [a, b], warnings: [] } as PlotDocument;
  };
  const p = page({ fit: 'original', align: 'top-left' });
  const m = marginBox(p);

  it('moves and scales a layer around its center, on the paper, after the page fit', () => {
    const r = processDocument({
      doc: twoLayers({ dx: 5, dy: -2, sx: 2, sy: 0.5 }),
      page: p,
      bed: { width: 430, height: 297 },
    });
    // Fitted: the box sits at the margin corner, 20 × 10, center (m + 10, m + 5).
    const { x, y } = m;
    expect(r.layerBounds['a']).toEqual({ minX: x, minY: y, maxX: x + 20, maxY: y + 10 });
    const a = r.placed.layers.find((l) => l.id === 'a')!;
    // Twice as wide (40), half as tall (5), around its center, then moved (5, -2).
    expect(bounds({ ...r.placed, layers: [a] })).toEqual([x - 5, y + 0.5, x + 35, y + 5.5]);
    // The other layer doesn't move.
    const b = r.placed.layers[1]!;
    expect(bounds({ ...r.placed, layers: [b] })).toEqual([x + 100, y + 100, x + 100, y + 100]);
  });

  it('no placement leaves the layer exactly where the page setup put it', () => {
    const plain = fitToPage(twoLayers(), p);
    const zero = fitToPage(twoLayers({ dx: 0, dy: 0, sx: 1, sy: 1 }), p);
    expect(zero.layers[0]!.strokes).toEqual(plain.layers[0]!.strokes);
  });

  it("in 'fill' mode a moved layer is still cropped to the margins", () => {
    const d = twoLayers({ dx: -500, dy: 0, sx: 1, sy: 1 });
    const out = fitToPage(d, page({ fit: 'fill' }));
    const box = marginBox(page({ fit: 'fill' }));
    for (const s of out.layers[0]!.strokes)
      for (const q of s.points) expect(q.x).toBeGreaterThanOrEqual(box.x - 1e-6);
  });
});
