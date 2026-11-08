import { describe, expect, it } from 'vitest';
import {
  createLayer,
  defaultDoodleSettings,
  doodleLayer,
  itemShape,
  itemStrokes,
  moveItem,
  PRIMITIVES,
  primitiveStroke,
  processItem,
  shapeArea,
  strokeNear,
  withDoodles,
  type BooleanOp,
  type DoodleLayerItem,
} from '../../src';

const loop = Array.from({ length: 41 }, (_, i) => {
  const a = (i / 40) * Math.PI * 2;
  return { x: 50 + 20 * Math.cos(a), y: 50 + 20 * Math.sin(a) };
});
const item = (id: string, fillClosed = false): DoodleLayerItem => ({
  id,
  name: `Doodle ${id}`,
  strokes: [{ points: loop }],
  settings: { ...defaultDoodleSettings(), fillClosed },
  size: { width: 100, height: 100 },
});

describe('doodle layers', () => {
  it('makes one layer per doodle, named and marked as that doodle', () => {
    const layer = doodleLayer(item('a'));
    expect(layer).toMatchObject({ id: 'doodle-a', name: 'Doodle a', doodle: 'a' });
    expect(layer.strokes).toHaveLength(1);
    expect(layer.fills).toHaveLength(0);
  });

  it('follows the doodle settings: closed shapes can be filled', () => {
    const layer = doodleLayer(item('a', true));
    expect(layer.fills).toHaveLength(1);
    expect(layer.settings.drawOutline).toBe(true);
  });

  it('gives an empty doodle an empty layer', () => {
    const layer = doodleLayer({ ...item('a'), strokes: [] });
    expect(layer).toMatchObject({ id: 'doodle-a', strokes: [], fills: [] });
  });

  it('withDoodles replaces the doodle layers, keeping the artwork', () => {
    const art = createLayer('layer-1', 'Art', '#000000');
    const doc = { layers: [art] };
    const two = withDoodles(doc, [item('a'), item('b')]);
    expect(two.layers.map((l) => l.id)).toEqual(['layer-1', 'doodle-a', 'doodle-b']);
    expect(withDoodles(two, [item('b')]).layers.map((l) => l.id)).toEqual(['layer-1', 'doodle-b']);
  });
});

describe('basic shapes', () => {
  const s = defaultDoodleSettings();
  const a = { x: 10, y: 20 };
  const b = { x: 50, y: 60 };

  it.each(PRIMITIVES)('%s fills the box between two corners, either way round', (kind) => {
    for (const [p, q] of [
      [a, b],
      [b, a],
    ] as const) {
      const { points } = primitiveStroke(kind, p, q);
      expect(Math.min(...points.map((v) => v.x))).toBeCloseTo(10);
      expect(Math.max(...points.map((v) => v.x))).toBeCloseTo(50);
      expect(Math.min(...points.map((v) => v.y))).toBeCloseTo(20);
      expect(Math.max(...points.map((v) => v.y))).toBeCloseTo(60);
    }
  });

  it('stays exact whatever the smoothing, and closed even with Close shapes off', () => {
    const rect = primitiveStroke('rectangle', a, b);
    const p = processItem(rect, { ...s, smoothing: 100, closeGap: 0 });
    expect(p).toEqual({ kind: 'lines', points: rect.points, closed: true });
    expect(shapeArea(itemShape(rect, s)!)).toBeCloseTo(1600);
  });

  it('makes an ellipse close to the true area', () => {
    const area = shapeArea(itemShape(primitiveStroke('ellipse', a, b), s)!);
    expect(Math.abs(area / (Math.PI * 400) - 1)).toBeLessThan(0.001);
  });

  it('combines with boolean operations', () => {
    const left = primitiveStroke('rectangle', { x: 0, y: 0 }, { x: 20, y: 20 });
    const right = primitiveStroke('rectangle', { x: 10, y: 0 }, { x: 30, y: 20 });
    const area = (op: BooleanOp) => shapeArea(itemShape({ op, items: [left, right] }, s)!);
    expect(area('union')).toBeCloseTo(600);
    expect(area('subtract')).toBeCloseTo(200);
    expect(area('intersect')).toBeCloseTo(200);
    expect(area('exclude')).toBeCloseTo(400);
  });

  it('moves items, combined ones with all their pieces', () => {
    const rect = primitiveStroke('rectangle', { x: 0, y: 0 }, { x: 10, y: 10 });
    const moved = moveItem({ op: 'union', items: [rect] }, 5, -2);
    expect(itemStrokes(moved)[0]).toMatchObject({ exact: true });
    expect(itemStrokes(moved)[0]!.points[0]).toEqual({ x: 5, y: -2 });
  });

  it('is near a shape anywhere along its outline, not only at its corners', () => {
    const rect = primitiveStroke('rectangle', { x: 0, y: 0 }, { x: 100, y: 100 });
    expect(strokeNear(rect, { x: 50, y: 1 }, 2)).toBe(true);
    expect(strokeNear(rect, { x: 1, y: 50 }, 2)).toBe(true); // the closing side
    expect(strokeNear(rect, { x: 50, y: 50 }, 2)).toBe(false);
  });
});
