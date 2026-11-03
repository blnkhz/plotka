import { applyToPoint, isEmptyBounds, layerBounds } from '@plotter-studio/core';
import { currentLayerSettings, useStore } from '../store';
import { boxMatrix, placementFor, type Box } from './arrange';
import type { Processed } from './useProcessed';

/**
 * What can be arranged now: each layer's box on the paper, as drawn, and with two or more layers
 * the box around all of them (null with one layer, where it would be the same thing as the
 * layer).
 */
export type ArrangeData = { boxes: Record<string, Box>; art: Box | null };

export function arrangeData(processed: Processed | null): ArrangeData {
  const boxes: Record<string, Box> = {};
  if (!processed) return { boxes, art: null };
  for (const l of processed.placed.layers) {
    const b = layerBounds(l);
    if (!isEmptyBounds(b)) boxes[l.id] = b;
  }
  const all = Object.values(boxes);
  const art =
    all.length > 1
      ? {
          minX: Math.min(...all.map((b) => b.minX)),
          minY: Math.min(...all.map((b) => b.minY)),
          maxX: Math.max(...all.map((b) => b.maxX)),
          maxY: Math.max(...all.map((b) => b.maxY)),
        }
      : null;
  return { boxes, art };
}

const same = (a: Box, b: Box) =>
  Math.abs(a.minX - b.minX) < 1e-6 &&
  Math.abs(a.minY - b.minY) < 1e-6 &&
  Math.abs(a.maxX - b.maxX) < 1e-6 &&
  Math.abs(a.maxY - b.maxY) < 1e-6;

/**
 * Saves an arranged box as layer placements: the target layer's, or (target null) every
 * layer's, moved and scaled together as a group. One store change, so one
 * undo step. Returns false if nothing changed.
 */
export function commitArrange(
  processed: Processed,
  target: string | null,
  from: Box,
  to: Box,
): boolean {
  if (same(from, to)) return false;
  const { boxes } = arrangeData(processed);
  const m = boxMatrix(from, to);
  const moved: Record<string, Box> = {};
  if (target !== null) moved[target] = to;
  else
    for (const [id, b] of Object.entries(boxes)) {
      // The group's move and scale map each layer's box onto a box (no turning).
      const a = applyToPoint(m, b.minX, b.minY);
      const c = applyToPoint(m, b.maxX, b.maxY);
      moved[id] = { minX: a.x, minY: a.y, maxX: c.x, maxY: c.y };
    }
  useStore.setState((s) => {
    const layerOverrides = { ...s.layerOverrides };
    for (const [id, box] of Object.entries(moved)) {
      const base = processed.layerBounds[id];
      if (!base) continue;
      const prev = layerOverrides[id] ?? {};
      const placement = placementFor(base, box, currentLayerSettings(id)?.placement);
      layerOverrides[id] = { ...prev, settings: { ...prev.settings, placement } };
    }
    return { layerOverrides };
  });
  return true;
}
