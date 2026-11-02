import type { Vec2 } from '../geometry/vec2';
import type { PlotDocument, Polyline } from '../model';

/** Pen-down paths for one layer, in plot order. */
export type LayerToolpath = {
  layerId: string;
  paths: Polyline[];
};

export type Toolpath = { layers: LayerToolpath[] };

/**
 * Collects what the pen will draw: strokes, plus fill outlines when `drawOutline` is on.
 * Hatch fills are added here by the fill step (Epic 4). Only layers with `plot` on are included.
 */
export function buildToolpath(doc: PlotDocument): Toolpath {
  return {
    layers: doc.layers
      .filter((l) => l.plot)
      .map((l) => {
        const paths: Polyline[] = [...l.strokes];
        if (l.settings.drawOutline)
          for (const f of l.fills)
            for (const ring of f.outer) paths.push({ points: ring, closed: true });
        return { layerId: l.id, paths: paths.filter((p) => p.points.length > 1) };
      }),
  };
}

export type MotionLimits = {
  /** mm/s at 100% speed. */
  maxSpeedPenDown: number;
  maxSpeedPenUp: number;
  /** mm/s² */
  acceleration: number;
  /** Seconds per pen raise or lower. */
  penLiftDelay: number;
};

export type PathStats = {
  penDownDistance: number;
  travelDistance: number;
  penLifts: number;
  pathCount: number;
  /** Seconds. The app fills this from the motion planner; see toolpathStats. */
  estimatedTime: number;
};

export type ToolpathStats = { total: PathStats; layers: Map<string, PathStats> };

export function polylineLength(l: Polyline): number {
  let d = 0;
  const p = l.points;
  for (let i = 1; i < p.length; i++) d += Math.hypot(p[i]!.x - p[i - 1]!.x, p[i]!.y - p[i - 1]!.y);
  if (l.closed && p.length > 2)
    d += Math.hypot(p[0]!.x - p[p.length - 1]!.x, p[0]!.y - p[p.length - 1]!.y);
  return d;
}

/** Time for a straight move of length d with a trapezoidal profile from rest to rest. */
export function moveTime(d: number, vmax: number, accel: number): number {
  if (d <= 0) return 0;
  const dAccel = (vmax * vmax) / accel; // accel + decel distance
  if (d >= dAccel) return d / vmax + vmax / accel;
  return 2 * Math.sqrt(d / accel);
}

const emptyStats = (): PathStats => ({
  penDownDistance: 0,
  travelDistance: 0,
  penLifts: 0,
  pathCount: 0,
  estimatedTime: 0,
});

/**
 * Distances, plus a rough time estimate when `limits` are given (one accelerated move per path,
 * no corner slowdowns). The app uses the motion planner in packages/plotter for real estimates.
 * Travel starts and ends at home (0, 0). `speeds` gives per-layer speed in % of max.
 */
export function toolpathStats(
  tp: Toolpath,
  limits?: MotionLimits,
  speeds: (layerId: string) => { penDown: number; penUp: number } = () => ({
    penDown: 25,
    penUp: 75,
  }),
): ToolpathStats {
  const total = emptyStats();
  const layers = new Map<string, PathStats>();
  let pos: Vec2 = { x: 0, y: 0 };
  for (const layer of tp.layers) {
    const s = emptyStats();
    const sp = speeds(layer.layerId);
    const vDown = ((limits?.maxSpeedPenDown ?? 0) * sp.penDown) / 100;
    const vUp = ((limits?.maxSpeedPenUp ?? 0) * sp.penUp) / 100;
    for (const path of layer.paths) {
      const start = path.points[0]!;
      const travel = Math.hypot(start.x - pos.x, start.y - pos.y);
      s.travelDistance += travel;
      if (limits) s.estimatedTime += moveTime(travel, vUp, limits.acceleration);
      const len = polylineLength(path);
      s.penDownDistance += len;
      // Rough: each polyline is one accelerated move. MOTION-2 adds corner slowdowns.
      if (limits)
        s.estimatedTime += moveTime(len, vDown, limits.acceleration) + 2 * limits.penLiftDelay;
      s.penLifts++;
      s.pathCount++;
      pos = path.closed ? start : path.points[path.points.length - 1]!;
    }
    layers.set(layer.layerId, s);
    accumulate(total, s);
  }
  const home = Math.hypot(pos.x, pos.y);
  total.travelDistance += home;
  if (limits) total.estimatedTime += moveTime(home, limits.maxSpeedPenUp, limits.acceleration);
  return { total, layers };
}

function accumulate(into: PathStats, s: PathStats) {
  into.penDownDistance += s.penDownDistance;
  into.travelDistance += s.travelDistance;
  into.penLifts += s.penLifts;
  into.pathCount += s.pathCount;
  into.estimatedTime += s.estimatedTime;
}
