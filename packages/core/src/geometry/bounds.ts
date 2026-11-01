import type { Bounds, PlotDocument, Polyline } from '../model';
import type { Vec2 } from './vec2';

export const emptyBounds = (): Bounds => ({
  minX: Infinity,
  minY: Infinity,
  maxX: -Infinity,
  maxY: -Infinity,
});

export function extendBounds(b: Bounds, p: Vec2): void {
  if (p.x < b.minX) b.minX = p.x;
  if (p.y < b.minY) b.minY = p.y;
  if (p.x > b.maxX) b.maxX = p.x;
  if (p.y > b.maxY) b.maxY = p.y;
}

export const isEmptyBounds = (b: Bounds): boolean => b.minX > b.maxX || b.minY > b.maxY;

export function polylinesBounds(lines: Polyline[], b: Bounds = emptyBounds()): Bounds {
  for (const l of lines) for (const p of l.points) extendBounds(b, p);
  return b;
}

/** Bounds of all strokes and fill rings in visible layers. */
export function documentBounds(doc: PlotDocument): Bounds {
  const b = emptyBounds();
  for (const layer of doc.layers) {
    polylinesBounds(layer.strokes, b);
    for (const f of layer.fills)
      for (const ring of f.outer) for (const p of ring) extendBounds(b, p);
  }
  return b;
}
