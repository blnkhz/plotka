import { describe, expect, it } from 'vitest';
import {
  defaultDoodleSettings,
  doodleToSvg,
  importSvg,
  itemShape,
  itemStrokes,
  processItem,
  regionShape,
  shapeArea,
  type DoodleItem,
  type DoodleSettings,
  type DoodleStroke,
  type Vec2,
} from '../../src';

/** Straight lines, no smoothing: a drawn square stays a square. */
const s = (o: Partial<DoodleSettings> = {}): DoodleSettings => ({
  ...defaultDoodleSettings(),
  style: 'lines',
  smoothing: 0,
  ...o,
});

/** A square drawn by hand: dense points round the outline, ending where it started. */
function square(x: number, y: number, size: number): DoodleStroke {
  const corners: Vec2[] = [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
    { x, y },
  ];
  const points: Vec2[] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i]!;
    const b = corners[i + 1]!;
    for (let t = 0; t < 1; t += 0.02)
      points.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  points.push({ x, y });
  return { points };
}

const area = (item: DoodleItem, o?: Partial<DoodleSettings>) =>
  shapeArea(itemShape(item, s(o)) ?? []);

// Two 20 mm squares overlapping by 10 × 10 mm.
const a = square(10, 10, 20);
const b = square(20, 20, 20);

describe('combining doodle shapes', () => {
  it('a drawn square covers its area', () => {
    expect(area(a)).toBeCloseTo(400, -1);
  });

  it('merge, cut out, keep overlap and remove overlap', () => {
    expect(area({ op: 'union', items: [a, b] })).toBeCloseTo(700, -1);
    expect(area({ op: 'subtract', items: [a, b] })).toBeCloseTo(300, -1);
    expect(area({ op: 'intersect', items: [a, b] })).toBeCloseTo(100, -1);
    expect(area({ op: 'exclude', items: [a, b] })).toBeCloseTo(600, -1);
  });

  it('cut out uses the bottom shape: order matters', () => {
    const big = square(0, 0, 40);
    const small = square(15, 15, 10);
    expect(area({ op: 'subtract', items: [big, small] })).toBeCloseTo(1500, -1);
    // The small one on the bottom: the big one cuts all of it away.
    expect(processItem({ op: 'subtract', items: [small, big] }, s())).toBeNull();
  });

  it('a cut inside a shape leaves a hole: two rings, written evenodd', () => {
    const item: DoodleItem = { op: 'subtract', items: [square(0, 0, 40), square(15, 15, 10)] };
    const p = processItem(item, s());
    expect(p?.kind).toBe('shape');
    expect(p?.kind === 'shape' && p.rings.length).toBe(2);

    const svg = doodleToSvg([item], s({ fillClosed: true }), { width: 50, height: 50 });
    expect(svg).toContain('fill-rule="evenodd"');
    // Imported, the fill covers the frame only, not the hole.
    const fills = importSvg(svg).layers[0]!.fills;
    expect(fills).toHaveLength(1);
    expect(shapeArea(regionShape(fills[0]!))).toBeCloseTo(1500, -1);
  });

  it('combined shapes combine again', () => {
    const merged: DoodleItem = { op: 'union', items: [a, b] };
    const cut: DoodleItem = { op: 'subtract', items: [merged, square(25, 5, 10)] };
    // The 10 mm square overlaps the merged shape by 5 × 5 (x 25..30, y 10..15).
    expect(area(cut)).toBeCloseTo(675, -1);
    expect(itemStrokes(cut)).toHaveLength(3);
  });

  it('shapes that do not touch: keep overlap leaves nothing', () => {
    const far = square(60, 60, 10);
    expect(processItem({ op: 'intersect', items: [a, far] }, s())).toBeNull();
    // Merging them keeps both, as two outer rings.
    const p = processItem({ op: 'union', items: [a, far] }, s());
    expect(p?.kind === 'shape' && p.rings.length).toBe(2);
  });

  it('an open stroke is not a shape and adds nothing', () => {
    const open: DoodleStroke = {
      points: Array.from({ length: 50 }, (_, i) => ({ x: i, y: 5 })),
    };
    expect(itemShape(open, s())).toBeNull();
    expect(area({ op: 'union', items: [a, open] })).toBeCloseTo(400, -1);
  });

  it('the settings still apply to the pieces', () => {
    const item: DoodleItem = { op: 'union', items: [a, b] };
    // With closing turned off, no piece is closed, so nothing is left.
    expect(processItem(item, s({ closeGap: 0 }))).toBeNull();
    // Smoothing rounds the corners: a little less area than the sharp version.
    const smooth = area(item, { smoothing: 100, keepCorners: false, style: 'curves' });
    expect(smooth).toBeLessThan(area(item));
    expect(smooth).toBeGreaterThan(500);
  });
});
