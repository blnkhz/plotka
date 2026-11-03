import { isEmptyBounds, layerBounds } from '@plotter-studio/core';
import { currentLayerSettings, useStore } from '../store';
import {
  frameOf,
  frameOfBox,
  groupFrames,
  offAxis,
  placementForFrame,
  type Box,
  type Frame,
} from './arrange';
import type { Processed } from './useProcessed';

/**
 * What can be arranged now: each layer as drawn (`boxes`, for picking and snapping) and as a
 * frame (its placement applied to its bounds, which turns with it), and with two or more layers
 * the frame around all of them (null with one layer, where it would be the same thing as the
 * layer). `offAxis`: some layer is turned other than by quarter turns, so the group can only be
 * scaled in proportion.
 */
export type ArrangeData = {
  boxes: Record<string, Box>;
  frames: Record<string, Frame>;
  art: Frame | null;
  offAxis: boolean;
};

export function arrangeData(processed: Processed | null): ArrangeData {
  const boxes: Record<string, Box> = {};
  const frames: Record<string, Frame> = {};
  if (!processed) return { boxes, frames, art: null, offAxis: false };
  let turned = false;
  for (const l of processed.placed.layers) {
    const b = layerBounds(l);
    const base = processed.layerBounds[l.id];
    if (isEmptyBounds(b) || !base) continue;
    boxes[l.id] = b;
    frames[l.id] = frameOf(base, l.settings.placement);
    if (offAxis(frames[l.id]!.rot)) turned = true;
  }
  const all = Object.values(boxes);
  const art =
    all.length > 1
      ? frameOfBox({
          minX: Math.min(...all.map((b) => b.minX)),
          minY: Math.min(...all.map((b) => b.minY)),
          maxX: Math.max(...all.map((b) => b.maxX)),
          maxY: Math.max(...all.map((b) => b.maxY)),
        })
      : null;
  return { boxes, frames, art, offAxis: turned };
}

const same = (a: Frame, b: Frame) =>
  Math.abs(a.cx - b.cx) < 1e-6 &&
  Math.abs(a.cy - b.cy) < 1e-6 &&
  Math.abs(a.w - b.w) < 1e-6 &&
  Math.abs(a.h - b.h) < 1e-6 &&
  Math.abs(a.rot - b.rot) < 1e-6;

/**
 * Saves an arranged frame as layer placements: the target layer's, or (target null) every
 * layer's, moved, scaled and turned together as a group. One store change, so one undo step.
 * Returns false if nothing changed.
 */
export function commitArrange(
  processed: Processed,
  target: string | null,
  from: Frame,
  to: Frame,
): boolean {
  if (same(from, to)) return false;
  const { frames } = arrangeData(processed);
  const moved = target !== null ? { [target]: to } : groupFrames(frames, from, to);
  useStore.setState((s) => {
    const layerOverrides = { ...s.layerOverrides };
    for (const [id, f] of Object.entries(moved)) {
      const base = processed.layerBounds[id];
      if (!base) continue;
      const prev = layerOverrides[id] ?? {};
      const placement = placementForFrame(base, f, currentLayerSettings(id)?.placement);
      layerOverrides[id] = { ...prev, settings: { ...prev.settings, placement } };
    }
    return { layerOverrides };
  });
  return true;
}
