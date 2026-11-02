import { documentBounds } from '../geometry/bounds';
import { multiply, rotate, scaleMatrix, translate, type Matrix } from '../geometry/matrix';
import { transformLayer } from '../geometry/transform-doc';
import type { Layer, PassSettings, PlotDocument } from '../model';

/** Blue, black, red: a classic three-pen set. */
export const DEFAULT_PASS_COLORS = ['#2b3d91', '#1f1f1f', '#b3362c'];

export const defaultPassSettings = (): PassSettings => ({
  count: 3,
  offsetX: 0.2,
  offsetY: 0,
  rotate: 0.25,
  scale: 0,
  colors: [...DEFAULT_PASS_COLORS],
});

/** Upper limit on passes per layer. */
export const MAX_PASSES = 12;

/**
 * The transform for pass `k` of `count`. Passes spread around the original (the middle pass
 * stays put); rotation and scale pivot on `center`.
 */
export function passMatrix(p: PassSettings, k: number, center: { x: number; y: number }): Matrix {
  const t = k - (Math.min(p.count, MAX_PASSES) - 1) / 2;
  const s = 1 + (t * p.scale) / 100;
  let m: Matrix = translate(-center.x, -center.y);
  m = multiply(scaleMatrix(s > 0 ? s : 1), m);
  m = multiply(rotate(t * p.rotate), m);
  return multiply(translate(center.x + t * p.offsetX, center.y + t * p.offsetY), m);
}

/** Passes step: replaces each layer that has passes with one layer per pass. */
export function applyPasses(doc: PlotDocument): PlotDocument {
  const layers: Layer[] = [];
  for (const layer of doc.layers) {
    const p = layer.settings.passes;
    const count = Math.min(Math.floor(p?.count ?? 1), MAX_PASSES);
    if (!p || count < 2) {
      layers.push(layer);
      continue;
    }
    const b = documentBounds({ ...doc, layers: [layer] });
    const center = Number.isFinite(b.minX)
      ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
      : { x: 0, y: 0 };
    for (let k = 0; k < count; k++) {
      const colors = p.colors.length ? p.colors : DEFAULT_PASS_COLORS;
      layers.push({
        ...transformLayer(layer, passMatrix(p, k, center)),
        id: `${layer.id}~${k + 1}`,
        name: `${layer.name} · pass ${k + 1}`,
        color: colors[k % colors.length]!,
        passOf: { layerId: layer.id, index: k, count },
      });
    }
  }
  return { ...doc, layers };
}
