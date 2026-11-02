import { describe, expect, it } from 'vitest';
import type { Polyline, Toolpath, Vec2 } from '@plotter-studio/core';
import {
  DEFAULT_PROFILE_ID,
  getProfile,
  junctionSpeed,
  penMoveMs,
  planToolpath,
  planTravel,
  servoPosition,
  servoRate,
  servoSettings,
  toMotors,
  type LayerMotionSettings,
  type Plan,
} from '../src';

const profile = getProfile(DEFAULT_PROFILE_ID)!;
const spm = profile.stepsPerMm;
const settings: LayerMotionSettings = {
  speedPenDown: 25,
  speedPenUp: 75,
  penPosUp: 60,
  penPosDown: 30,
};
const tp = (...paths: Polyline[]): Toolpath => ({ layers: [{ layerId: 'a', paths }] });
const open = (...pts: [number, number][]): Polyline => ({
  points: pts.map(([x, y]) => ({ x, y })),
  closed: false,
});
const plan = (t: Toolpath, s = settings, opts = {}) => planToolpath(t, profile, () => s, opts);

/** Sum of every move's steps, starting from the plan start. */
function endSteps(p: Plan) {
  let { x, y } = p.start;
  for (const it of p.items)
    if (it.kind === 'move')
      for (const s of it.segments) {
        x += s.x;
        y += s.y;
      }
  return { x, y };
}

const moves = (p: Plan) => p.items.flatMap((i) => (i.kind === 'move' ? [i] : []));

describe('servo math', () => {
  it('maps % to the vendor servo range and rates', () => {
    expect(servoPosition(profile.servo, 0)).toBe(9855);
    expect(servoPosition(profile.servo, 100)).toBe(27831);
    // Same values the DRIVER-0 spike sent and verified on hardware.
    expect(servoPosition(profile.servo, 60)).toBe(20641);
    expect(servoPosition(profile.servo, 30)).toBe(15248);
    expect(servoRate(profile.servo, 75)).toBe(1618);
    expect(servoRate(profile.servo, 50)).toBe(1079);
  });
  it('pen move time grows with distance and slower rates', () => {
    const s = servoSettings(profile.servo);
    expect(s.raiseMs).toBeGreaterThan(125);
    expect(s.lowerMs).toBeGreaterThan(s.raiseMs); // lowering is slower (50% vs 75%)
    expect(penMoveMs(profile.servo, 0, 50)).toBe(0);
    expect(penMoveMs(profile.servo, 60, 50)).toBeGreaterThan(penMoveMs(profile.servo, 30, 50));
  });
});

describe('junctionSpeed', () => {
  it('is full speed straight on, zero on reversal, and lower for sharper turns', () => {
    expect(junctionSpeed(1, 100, 1000, 0.05)).toBe(100);
    expect(junctionSpeed(-1, 100, 1000, 0.05)).toBe(0);
    const right = junctionSpeed(0, 100, 1000, 0.05);
    const shallow = junctionSpeed(Math.cos(Math.PI / 8), 100, 1000, 0.05);
    expect(right).toBeGreaterThan(0);
    expect(shallow).toBeGreaterThan(right);
  });
});

describe('planToolpath (MOTION-1)', () => {
  it('a 100 mm square returns exactly to its start in steps', () => {
    const square: Polyline = {
      points: [
        { x: 20, y: 20 },
        { x: 120, y: 20 },
        { x: 120, y: 120 },
        { x: 20, y: 120 },
      ],
      closed: true,
    };
    const p = plan(tp(square), settings, { returnHome: false });
    const draw = moves(p).find((m) => m.penDown)!;
    let x = 0;
    let y = 0;
    for (const s of draw.segments) {
      x += s.x;
      y += s.y;
    }
    expect({ x, y }).toEqual({ x: 0, y: 0 });
    expect(draw.to).toEqual({ x: 20 * spm, y: 20 * spm });
  });

  it('a random walk with odd coordinates returns home exactly', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 200;
    const paths = Array.from({ length: 30 }, () =>
      open(...Array.from({ length: 8 }, () => [rnd(), rnd()] as [number, number])),
    );
    const p = plan(tp(...paths));
    expect(endSteps(p)).toEqual({ x: 0, y: 0 });
    expect(p.end).toEqual({ x: 0, y: 0 });
  });

  it('every move lands on the rounded target of its path end', () => {
    const p = plan(tp(open([0.0063, 0], [10.0187, 3.3333])), settings, { returnHome: false });
    const draw = moves(p).find((m) => m.penDown)!;
    expect(draw.to).toEqual({ x: Math.round(10.0187 * spm), y: Math.round(3.3333 * spm) });
  });

  it('never exceeds the speed limit or the motor step rate', () => {
    const zigzag = open(
      ...Array.from({ length: 40 }, (_, i) => [i * 3, (i % 2) * 40] as [number, number]),
    );
    const circle = open(
      ...Array.from({ length: 361 }, (_, i) => {
        const a = (i * Math.PI) / 180;
        return [150 + 50 * Math.cos(a), 150 + 50 * Math.sin(a)] as [number, number];
      }),
    );
    const fast = { ...settings, speedPenDown: 100, speedPenUp: 100 };
    const p = plan(tp(zigzag, circle, open([0, 0], [400, 290])), fast);
    for (const m of moves(p)) {
      const vmax = m.penDown ? profile.motion.maxSpeedPenDown : profile.motion.maxSpeedPenUp;
      for (const s of m.segments) {
        expect(Number.isInteger(s.ms) && s.ms >= 1).toBe(true);
        const mm = Math.hypot(s.x, s.y) / spm;
        // Allow for each axis landing up to one step past the ideal sample.
        const allowance = (Math.SQRT2 / spm) * 1000;
        expect(mm * 1000).toBeLessThanOrEqual(vmax * s.ms + allowance + 1e-6);
        const { a, b } = toMotors(s.x, s.y);
        expect(Math.max(Math.abs(a), Math.abs(b)) * 1000).toBeLessThanOrEqual(
          profile.maxStepRate * s.ms,
        );
      }
    }
  });

  it('a long straight line reaches full speed and matches the trapezoid time', () => {
    const p = plan(tp(open([0, 0], [300, 0])), settings, { returnHome: false });
    const draw = moves(p).find((m) => m.penDown)!;
    const v = (profile.motion.maxSpeedPenDown * 25) / 100;
    const a = profile.motion.accelPenDown;
    const ideal = (300 / v + v / a) * 1000;
    expect(draw.ms).toBeGreaterThanOrEqual(ideal - 1);
    expect(draw.ms).toBeLessThan(ideal * 1.03);
    const peak = Math.max(...draw.segments.map((s) => Math.abs(s.x) / spm / (s.ms / 1000)));
    expect(peak).toBeGreaterThan(v * 0.97);
  });

  it('corners slow a path down compared to a straight line of the same length', () => {
    const straight = plan(tp(open([0, 0], [200, 0])), settings, { returnHome: false });
    const zig = plan(
      tp(
        open(
          ...Array.from({ length: 21 }, (_, i) => [i * 7.07, (i % 2) * 7.07] as [number, number]),
        ),
      ),
      settings,
      { returnHome: false },
    );
    const t = (p: Plan) => moves(p).find((m) => m.penDown)!.ms;
    expect(t(zig)).toBeGreaterThan(t(straight) * 1.1);
  });

  it('gentle curves keep more speed than sharp corners', () => {
    const pts = (n: number, turnDeg: number): [number, number][] => {
      let x = 0,
        y = 0,
        h = 0;
      const out: [number, number][] = [[0, 0]];
      for (let i = 0; i < n; i++) {
        x += 4 * Math.cos(h);
        y += 4 * Math.sin(h);
        h += (turnDeg * Math.PI) / 180;
        out.push([x, y]);
      }
      return out;
    };
    const fast = { ...settings, speedPenDown: 100 };
    const gentle = plan(tp(open(...pts(50, 3))), fast, { returnHome: false });
    const sharp = plan(tp(open(...pts(50, 60))), fast, { returnHome: false });
    const t = (p: Plan) => moves(p).find((m) => m.penDown)!.ms;
    expect(t(sharp)).toBeGreaterThan(t(gentle) * 1.5);
  });

  it('merges tiny segments so commands are not shorter than the minimum', () => {
    const fine = open(...Array.from({ length: 2001 }, (_, i) => [i * 0.05, 0] as [number, number]));
    const p = plan(tp(fine), { ...settings, speedPenDown: 100 }, { returnHome: false });
    const draw = moves(p).find((m) => m.penDown)!;
    const short = draw.segments.filter((s) => s.ms < 5);
    expect(short.length).toBeLessThanOrEqual(1); // only the final landing may be short
    expect(draw.segments.length).toBeLessThanOrEqual(Math.ceil(draw.ms / 5) + 1);
    expect(draw.segments.length).toBeLessThan(2000 / 10);
  });

  it('orders items: servo, pen up, travel, pen down, draw, pen up, travel home', () => {
    const p = plan(tp(open([10, 10], [20, 10])));
    expect(
      p.items.map((i) =>
        i.kind === 'pen'
          ? i.down
            ? 'down'
            : 'up'
          : i.kind === 'move'
            ? i.penDown
              ? 'draw'
              : 'travel'
            : i.kind,
      ),
    ).toEqual(['servo', 'up', 'travel', 'down', 'draw', 'up', 'travel']);
  });

  it('skips the travel when a path starts where the pen already is', () => {
    const p = plan(tp(open([0, 0], [10, 0])), settings, { returnHome: false });
    expect(moves(p).filter((m) => !m.penDown)).toHaveLength(0);
  });

  it('total time is the sum of command times and pen waits, split by layer', () => {
    const t: Toolpath = {
      layers: [
        { layerId: 'a', paths: [open([10, 10], [50, 10])] },
        { layerId: 'b', paths: [open([50, 50], [50, 90])] },
      ],
    };
    const p = plan(t);
    let sum = 0;
    for (const it of p.items)
      if (it.kind === 'pen') sum += it.ms;
      else if (it.kind === 'move') sum += it.segments.reduce((s, x) => s + x.ms, 0);
    expect(p.totalMs).toBe(sum);
    expect(p.layers.map((l) => l.layerId)).toEqual(['a', 'b']);
    expect(p.layers[0]!.ms + p.layers[1]!.ms).toBeLessThan(p.totalMs); // home travel extra
  });

  it('slower pen-down speed takes longer', () => {
    const t = tp(open([0, 0], [100, 0], [100, 100]));
    const slow = plan(t, { ...settings, speedPenDown: 10 });
    const fast = plan(t, { ...settings, speedPenDown: 80 });
    expect(slow.totalMs).toBeGreaterThan(fast.totalMs);
  });

  it('closed paths draw back to their first point', () => {
    const tri: Polyline = {
      points: [
        { x: 10, y: 10 },
        { x: 40, y: 10 },
        { x: 25, y: 40 },
      ],
      closed: true,
    };
    const p = plan(tp(tri), settings, { returnHome: false });
    expect(moves(p).find((m) => m.penDown)!.to).toEqual({ x: 10 * spm, y: 10 * spm });
  });
});

describe('planTravel', () => {
  it('moves from any step position to an exact mm target', () => {
    const from = { x: 12345, y: -321 };
    const to: Vec2 = { x: 0, y: 0 };
    const m = planTravel(profile, from, to, 75);
    let { x, y } = from;
    for (const s of m.segments) {
      x += s.x;
      y += s.y;
    }
    expect({ x, y }).toEqual({ x: 0, y: 0 });
  });
});
