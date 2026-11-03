import type { Bounds, Vec2 } from '@plotka/core';
import type { MachineProfile } from '../profile';
import { planTravel, type Plan, type PlanItem, type StepPos } from './plan';

/**
 * PLOT-6: a pen-up trace around a rectangle (the drawing's bounds), so the paper's placement can
 * be checked. Starts from `start` (steps from home), goes round the corners clockwise from the top
 * left, and returns home. The pen is never lowered.
 */
export function planDryRun(
  profile: MachineProfile,
  bounds: Bounds,
  start: StepPos,
  speedPct = 50,
): Plan {
  const clamp = (p: Vec2): Vec2 => ({
    x: Math.min(profile.bed.width, Math.max(0, p.x)),
    y: Math.min(profile.bed.height, Math.max(0, p.y)),
  });
  const corners = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.minY },
    { x: 0, y: 0 },
  ].map(clamp);
  const items: PlanItem[] = [];
  let pos = start;
  let totalMs = 0;
  corners.forEach((c, i) => {
    const m = planTravel(profile, pos, c, speedPct);
    if (!m.segments.length) return;
    items.push({
      kind: 'move',
      penDown: false,
      segments: m.segments,
      ms: m.ms,
      layerIndex: -1,
      pathIndex: i,
      to: m.to,
    });
    pos = m.to;
    totalMs += m.ms;
  });
  return { items, totalMs, layers: [], start, end: pos };
}
