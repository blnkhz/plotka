import { layerBounds, isEmptyBounds, type Bounds } from '@plotter-studio/core';
import { currentLayerSettings, useStore } from '../store';
import { pageFor, placementFor, type Box } from './arrange';
import type { Processed } from './useProcessed';

/** What can be arranged now: each shown layer's box on the paper, and the whole artwork's. */
export type ArrangeData = { boxes: Record<string, Box>; art: Box | null };

export function arrangeData(processed: Processed | null): ArrangeData {
  const boxes: Record<string, Box> = {};
  if (!processed) return { boxes, art: null };
  for (const l of processed.placed.layers) {
    const b = layerBounds(l);
    if (!isEmptyBounds(b)) boxes[l.id] = b;
  }
  const a: Bounds = processed.artBounds;
  return { boxes, art: isEmptyBounds(a) ? null : a };
}

const same = (a: Box, b: Box) =>
  Math.abs(a.minX - b.minX) < 1e-6 &&
  Math.abs(a.minY - b.minY) < 1e-6 &&
  Math.abs(a.maxX - b.maxX) < 1e-6 &&
  Math.abs(a.maxY - b.maxY) < 1e-6;

/**
 * Saves an arranged box: a layer's placement, or the Page tab's scale and offset for the whole
 * artwork. One store change, so one undo step. Returns false if nothing changed.
 */
export function commitArrange(
  processed: Processed,
  target: string | null,
  from: Box,
  to: Box,
): boolean {
  if (same(from, to)) return false;
  const s = useStore.getState();
  if (target === null) {
    s.setPage(pageFor(s.page, processed.artBounds, to));
    return true;
  }
  const base = processed.layerBounds[target];
  if (!base) return false;
  const placement = placementFor(base, to, currentLayerSettings(target)?.placement);
  s.setLayer(target, { settings: { placement } });
  return true;
}
