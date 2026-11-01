import type { FillSettings, Layer, PlotDocument, Polyline } from '../model';
import { hatchRegion } from './hatch';

export const SUPPORTED_FILL_TYPES = ['none', 'lines', 'crosshatch', 'zigzag'] as const;

export const defaultFillSettings = (): FillSettings => ({
  type: 'lines',
  spacing: 0.6,
  angle: 45,
  inset: 0,
  connect: true,
});

/** Hatch polylines for one layer's fill regions, per its fill settings. */
export function layerHatches(layer: Layer): Polyline[] {
  const f = layer.settings.fill;
  if (!f || f.type === 'none' || !(f.spacing > 0)) return [];
  const passes: number[] =
    f.type === 'crosshatch' ? [f.angle, f.crossAngle ?? f.angle + 90] : [f.angle];
  const connect = f.type === 'zigzag' ? true : f.connect;
  if (f.type !== 'lines' && f.type !== 'crosshatch' && f.type !== 'zigzag') return [];
  const out: Polyline[] = [];
  for (const region of layer.fills)
    for (const angle of passes)
      out.push(...hatchRegion(region, { spacing: f.spacing, angle, inset: f.inset, connect }));
  return out;
}

/**
 * Fills pipeline step: adds hatch lines to each layer's strokes. Fill regions are kept so
 * outlines can still be drawn.
 */
export function applyFills(doc: PlotDocument): PlotDocument {
  return {
    ...doc,
    layers: doc.layers.map((l) => {
      const hatches = layerHatches(l);
      return hatches.length ? { ...l, strokes: [...l.strokes, ...hatches] } : l;
    }),
  };
}
