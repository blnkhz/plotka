import type { Polyline, Toolpath, Vec2 } from '@plotka/core';
import type { MotionSegment } from '../ebb';
import type { MachineProfile } from '../profile';
import { servoSettings, type ServoSettings } from '../servo';

/** Planner tuning. These are software choices, not hardware values. */
export type PlannerSettings = {
  /** mm. How far a corner may be "rounded" in the speed model; bigger = faster corners. */
  junctionDeviation: number;
  /** ms between samples while accelerating or decelerating. */
  sliceMs: number;
  /** Longest single command at constant speed, ms. Keeps pause responsive. */
  maxChunkMs: number;
  /** Shortest command, ms. Shorter samples are merged so the 1-slot FIFO keeps up. */
  minMoveMs: number;
};

export const defaultPlannerSettings: PlannerSettings = {
  junctionDeviation: 0.05,
  sliceMs: 25,
  maxChunkMs: 200,
  minMoveMs: 5,
};

/** Per-layer settings the planner needs (a subset of the core LayerSettings). */
export type LayerMotionSettings = {
  /** % of the profile's max speed. */
  speedPenDown: number;
  speedPenUp: number;
  /** 0..100 */
  penPosUp: number;
  penPosDown: number;
};

export type StepPos = { x: number; y: number };

export type PlanItem =
  | { kind: 'servo'; layerIndex: number; settings: ServoSettings }
  | { kind: 'pen'; down: boolean; ms: number; layerIndex: number; pathIndex: number }
  | {
      kind: 'move';
      penDown: boolean;
      segments: MotionSegment[];
      ms: number;
      /** -1 for the final travel home. */
      layerIndex: number;
      /** The path this move draws, or travels to. -1 for the final travel home. */
      pathIndex: number;
      /** Absolute step position after the move. */
      to: StepPos;
    };

export type Plan = {
  items: PlanItem[];
  /** Machine time in ms: the sum of every command's time and pen wait. */
  totalMs: number;
  /** Time per layer (in toolpath order); the final travel home is only in the total. */
  layers: { layerId: string; ms: number }[];
  start: StepPos;
  end: StepPos;
};

export type PlanOptions = Partial<PlannerSettings> & {
  /** Where the pen starts, mm. Default home (0, 0). */
  start?: Vec2;
  /** Travel back to home at the end. Default true. */
  returnHome?: boolean;
};

type Limits = { vmax: number; accel: number };

/**
 * Converts mm samples into step commands. Targets are rounded to absolute steps, so rounding
 * never accumulates. Command times round up to whole ms, so nothing runs faster than planned.
 */
class StepEmitter {
  segments: MotionSegment[] = [];
  ms = 0;
  private carryMs = 0;
  constructor(
    private readonly profile: MachineProfile,
    public pos: StepPos,
  ) {}

  /** Move to (x, y) mm, taking `dtMs` ms (exact). */
  emit(x: number, y: number, dtMs: number) {
    const spm = this.profile.stepsPerMm;
    const tx = Math.round(x * spm);
    const ty = Math.round(y * spm);
    const dx = tx - this.pos.x;
    const dy = ty - this.pos.y;
    const dt = dtMs + this.carryMs;
    if (dx === 0 && dy === 0) {
      // Nothing to step yet: fold the time into the next command instead of sending a delay.
      this.carryMs = dt;
      return;
    }
    this.carryMs = 0;
    const motorSteps = Math.max(Math.abs(dx + dy), Math.abs(dx - dy));
    const minMs = Math.ceil((motorSteps * 1000) / this.profile.maxStepRate - 1e-9);
    const ms = Math.max(1, Math.ceil(dt - 1e-6), minMs);
    this.segments.push({ ms, x: dx, y: dy });
    this.ms += ms;
    this.pos = { x: tx, y: ty };
  }
}

/** Pushes timed samples to the emitter, merging ones closer than `minMoveMs`. */
class Sampler {
  private lastT = 0;
  constructor(
    private readonly out: StepEmitter,
    private readonly minMoveMs: number,
  ) {}
  sample(tSec: number, x: number, y: number, last: boolean) {
    const dtMs = (tSec - this.lastT) * 1000;
    if (!last && dtMs < this.minMoveMs) return;
    this.out.emit(x, y, dtMs);
    this.lastT = tSec;
  }
}

/**
 * Corner speed limit (junction deviation model): the speed at which a circle of radius
 * `deviation`-tangent arc through the corner has centripetal acceleration `accel`.
 * `dot` is the dot product of the incoming and outgoing unit directions.
 */
export function junctionSpeed(dot: number, vmax: number, accel: number, deviation: number) {
  const sinHalf = Math.sqrt(Math.max(0, 0.5 * (1 + Math.min(1, Math.max(-1, dot)))));
  // sinHalf: 1 for straight on, 0 for a full reversal.
  if (sinHalf >= 1 - 1e-9) return vmax;
  const v = Math.sqrt((accel * deviation * sinHalf) / (1 - sinHalf));
  return Math.min(vmax, v);
}

/**
 * Plans one polyline from rest to rest with lookahead: corners slow down by angle, straight
 * runs reach full speed. Samples are fed to `sampler` with absolute times in seconds.
 */
function planPolyline(points: Vec2[], lim: Limits, s: PlannerSettings, sampler: Sampler) {
  const pts: Vec2[] = [];
  for (const p of points) {
    const q = pts[pts.length - 1];
    if (!q || Math.hypot(p.x - q.x, p.y - q.y) > 1e-9) pts.push(p);
  }
  const n = pts.length - 1;
  if (n < 1) return;
  const { vmax, accel: a } = lim;

  const len: number[] = [];
  const ux: number[] = [];
  const uy: number[] = [];
  for (let i = 0; i < n; i++) {
    const dx = pts[i + 1]!.x - pts[i]!.x;
    const dy = pts[i + 1]!.y - pts[i]!.y;
    const l = Math.hypot(dx, dy);
    len.push(l);
    ux.push(dx / l);
    uy.push(dy / l);
  }

  // Vertex speeds: 0 at both ends, corner limits inside.
  const v = new Array<number>(n + 1).fill(0);
  for (let i = 1; i < n; i++) {
    const dot = ux[i - 1]! * ux[i]! + uy[i - 1]! * uy[i]!;
    v[i] = junctionSpeed(dot, vmax, a, s.junctionDeviation);
  }
  for (let i = n - 1; i >= 0; i--)
    v[i] = Math.min(v[i]!, Math.sqrt(v[i + 1]! ** 2 + 2 * a * len[i]!));
  for (let i = 0; i < n; i++)
    v[i + 1] = Math.min(v[i + 1]!, Math.sqrt(v[i]! ** 2 + 2 * a * len[i]!));

  const slice = s.sliceMs / 1000;
  const chunk = s.maxChunkMs / 1000;
  let t0 = 0;
  for (let i = 0; i < n; i++) {
    const L = len[i]!;
    const vi = v[i]!;
    const vo = v[i + 1]!;
    const vp = Math.max(vi, vo, Math.min(vmax, Math.sqrt((2 * a * L + vi * vi + vo * vo) / 2)));
    const d1 = Math.max(0, (vp * vp - vi * vi) / (2 * a));
    const d3 = Math.max(0, (vp * vp - vo * vo) / (2 * a));
    const d2 = Math.max(0, L - d1 - d3);
    const t1 = (vp - vi) / a;
    const t2 = d2 / vp;
    const t3 = (vp - vo) / a;
    const p = pts[i]!;
    const at = (d: number) => {
      const dd = Math.min(L, Math.max(0, d));
      return { x: p.x + ux[i]! * dd, y: p.y + uy[i]! * dd };
    };
    const lastSeg = i === n - 1;
    const phases: [number, number, (t: number) => number][] = [
      [t1, slice, (t) => vi * t + 0.5 * a * t * t],
      [t2, chunk, (t) => d1 + vp * t],
      [t3, slice, (t) => d1 + d2 + vp * t - 0.5 * a * t * t],
    ];
    let lastPhase = 0;
    phases.forEach(([dur], phase) => {
      if (dur > 1e-12) lastPhase = phase;
    });
    let tp = t0;
    phases.forEach(([dur, step, dist], phase) => {
      if (dur <= 1e-12) return;
      const k = Math.ceil(dur / step - 1e-9);
      for (let j = 1; j <= k; j++) {
        const t = (dur * j) / k;
        const endOfSeg = phase === lastPhase && j === k;
        // Land exactly on the vertex at the end of the segment.
        const q = endOfSeg ? pts[i + 1]! : at(dist(t));
        sampler.sample(tp + t, q.x, q.y, lastSeg && endOfSeg);
      }
      tp += dur;
    });
    t0 = tp;
  }
}

/** Plans a move along `points` (mm) from the emitter's current step position. */
function planMove(
  profile: MachineProfile,
  from: StepPos,
  points: Vec2[],
  lim: Limits,
  s: PlannerSettings,
) {
  const em = new StepEmitter(profile, from);
  planPolyline(points, lim, s, new Sampler(em, s.minMoveMs));
  return { segments: em.segments, ms: em.ms, to: em.pos };
}

const limitsFor = (profile: MachineProfile, penDown: boolean, speedPct: number): Limits => {
  const pct = Math.min(100, Math.max(1, speedPct)) / 100;
  return penDown
    ? { vmax: profile.motion.maxSpeedPenDown * pct, accel: profile.motion.accelPenDown }
    : { vmax: profile.motion.maxSpeedPenUp * pct, accel: profile.motion.accelPenUp };
};

/** A straight pen-up move from a step position to a point in mm (used for home and jog). */
export function planTravel(
  profile: MachineProfile,
  from: StepPos,
  to: Vec2,
  speedPct: number,
  settings: Partial<PlannerSettings> = {},
) {
  const s = { ...defaultPlannerSettings, ...settings };
  const spm = profile.stepsPerMm;
  const start = { x: from.x / spm, y: from.y / spm };
  return planMove(profile, from, [start, to], limitsFor(profile, false, speedPct), s);
}

const pathPoints = (p: Polyline): Vec2[] =>
  p.closed && p.points.length > 2 ? [...p.points, p.points[0]!] : p.points;

/**
 * Plans a whole plot: per layer, set the servo, then for each path travel (pen up), lower,
 * draw, raise. Ends with a travel home. The plan's time is the time estimate (MOTION-2).
 */
export function planToolpath(
  tp: Toolpath,
  profile: MachineProfile,
  layerSettings: (layerId: string) => LayerMotionSettings,
  options: PlanOptions = {},
): Plan {
  const s: PlannerSettings = { ...defaultPlannerSettings, ...options };
  const spm = profile.stepsPerMm;
  const startMm = options.start ?? { x: 0, y: 0 };
  const start = { x: Math.round(startMm.x * spm), y: Math.round(startMm.y * spm) };
  const items: PlanItem[] = [];
  const layers: Plan['layers'] = [];
  let pos = start;
  let totalMs = 0;

  const travel = (to: Vec2, speed: number, layerIndex: number, pathIndex: number) => {
    const target = { x: Math.round(to.x * spm), y: Math.round(to.y * spm) };
    if (target.x === pos.x && target.y === pos.y) return 0;
    const fromMm = { x: pos.x / spm, y: pos.y / spm };
    const m = planMove(profile, pos, [fromMm, to], limitsFor(profile, false, speed), s);
    items.push({ kind: 'move', penDown: false, layerIndex, pathIndex, ...m });
    pos = m.to;
    return m.ms;
  };

  tp.layers.forEach((layer, li) => {
    const ls = layerSettings(layer.layerId);
    const servo = servoSettings(profile.servo, ls.penPosUp, ls.penPosDown);
    let ms = 0;
    if (layer.paths.length > 0) {
      items.push({ kind: 'servo', layerIndex: li, settings: servo });
      items.push({ kind: 'pen', down: false, ms: servo.raiseMs, layerIndex: li, pathIndex: -1 });
      ms += servo.raiseMs;
    }
    const drawLimits = limitsFor(profile, true, ls.speedPenDown);
    layer.paths.forEach((path, pi) => {
      const pts = pathPoints(path);
      if (pts.length === 0) return;
      ms += travel(pts[0]!, ls.speedPenUp, li, pi);
      items.push({ kind: 'pen', down: true, ms: servo.lowerMs, layerIndex: li, pathIndex: pi });
      const m = planMove(profile, pos, pts, drawLimits, s);
      if (m.segments.length > 0) {
        items.push({ kind: 'move', penDown: true, layerIndex: li, pathIndex: pi, ...m });
        pos = m.to;
      }
      items.push({ kind: 'pen', down: false, ms: servo.raiseMs, layerIndex: li, pathIndex: pi });
      ms += servo.lowerMs + m.ms + servo.raiseMs;
    });
    layers.push({ layerId: layer.layerId, ms });
    totalMs += ms;
  });

  if (options.returnHome ?? true) {
    const lastSpeed = tp.layers.length
      ? layerSettings(tp.layers[tp.layers.length - 1]!.layerId).speedPenUp
      : 75;
    totalMs += travel({ x: 0, y: 0 }, lastSpeed, -1, -1);
  }
  return { items, totalMs, layers, start, end: pos };
}
