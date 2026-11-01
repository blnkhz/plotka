import type { PlotDocument, Polyline } from '../src';

const r = (n: number) => Math.round(n * 1000) / 1000 + 0; // +0 turns -0 into 0

/** Rounds every coordinate to 0.001 mm for stable snapshots. */
export function roundDoc(doc: PlotDocument) {
  return {
    width: r(doc.width),
    height: r(doc.height),
    warnings: doc.warnings,
    source: doc.source,
    layers: doc.layers.map((l) => ({
      name: l.name,
      color: l.color,
      strokes: l.strokes.map(roundLine),
      fills: l.fills.map((f) => ({
        fillRule: f.fillRule,
        color: f.color,
        outer: f.outer.map((ring) => ring.map((p) => [r(p.x), r(p.y)])),
      })),
    })),
  };
}

export const roundLine = (l: Polyline) => ({
  closed: l.closed,
  points: l.points.map((p) => [r(p.x), r(p.y)]),
});

export function bbox(points: { x: number; y: number }[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: r(Math.min(...xs)),
    minY: r(Math.min(...ys)),
    maxX: r(Math.max(...xs)),
    maxY: r(Math.max(...ys)),
  };
}
