import type { FillRegion, Layer, PlotDocument, Polyline } from '../model';
import { applyToPoint, type Matrix } from './matrix';
import type { Vec2 } from './vec2';

const mapPoints = (pts: Vec2[], m: Matrix) => pts.map((p) => applyToPoint(m, p.x, p.y));

export const transformPolyline = (l: Polyline, m: Matrix): Polyline => ({
  points: mapPoints(l.points, m),
  closed: l.closed,
});

export const transformFill = (f: FillRegion, m: Matrix): FillRegion => ({
  ...f,
  outer: f.outer.map((ring) => mapPoints(ring, m)),
});

export const transformLayer = (l: Layer, m: Matrix): Layer => ({
  ...l,
  strokes: l.strokes.map((s) => transformPolyline(s, m)),
  fills: l.fills.map((f) => transformFill(f, m)),
});

/** Applies a matrix to all geometry. Does not change the document's width/height. */
export const transformDocument = (doc: PlotDocument, m: Matrix): PlotDocument => ({
  ...doc,
  layers: doc.layers.map((l) => transformLayer(l, m)),
});
