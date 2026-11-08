import { createLayer, type Layer } from '../model';
import { importSvg } from '../svg/import';
import { doodleToSvg, type DoodleItem, type DoodleSettings } from './doodle';

/** A doodle kept as its own layer: its strokes as drawn, and how they turn into vectors. */
export type DoodleLayerItem = {
  id: string;
  name: string;
  strokes: DoodleItem[];
  settings: DoodleSettings;
  /** Artboard size in mm. Every doodle's artboard starts at the same top-left corner. */
  size: { width: number; height: number };
};

/** Layers already built, as vectorising is too slow to repeat for every unrelated edit. */
const built = new WeakMap<DoodleLayerItem, Layer>();

/** The layer for a doodle, like the SVG it saves as. Layer id: `doodle-<item id>`. */
export function doodleLayer(item: DoodleLayerItem): Layer {
  const cached = built.get(item);
  if (cached) return cached;
  const svg = doodleToSvg(item.strokes, item.settings, item.size);
  const imported = importSvg(svg).layers[0];
  const layer: Layer = {
    ...(imported ?? createLayer('', '', '#000000')),
    id: `doodle-${item.id}`,
    name: item.name,
    doodle: item.id,
  };
  built.set(item, layer);
  return layer;
}

/** The document with its doodle layers replaced by those of `doodles` (after the artwork's). */
export function withDoodles<T extends { layers: Layer[] }>(
  doc: T,
  doodles: readonly DoodleLayerItem[],
): T {
  return {
    ...doc,
    layers: [...doc.layers.filter((l) => !l.doodle), ...doodles.map(doodleLayer)],
  };
}
