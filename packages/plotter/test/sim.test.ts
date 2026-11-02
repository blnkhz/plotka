import { describe, expect, it } from 'vitest';
import type { Toolpath } from '@plotter-studio/core';
import {
  DEFAULT_PROFILE_ID,
  DriverError,
  getProfile,
  planToolpath,
  SimulatedDriver,
  type Plan,
  type PlotterDriver,
} from '../src';

const profile = getProfile(DEFAULT_PROFILE_ID)!;
const settings = { speedPenDown: 25, speedPenUp: 75, penPosUp: 60, penPosDown: 30 };

const drawing: Toolpath = {
  layers: [
    {
      layerId: 'a',
      paths: [
        {
          points: [
            { x: 10, y: 10 },
            { x: 110, y: 10 },
            { x: 110, y: 110 },
            { x: 10, y: 110 },
          ],
          closed: true,
        },
        {
          points: [
            { x: 30, y: 30 },
            { x: 90, y: 90 },
          ],
          closed: false,
        },
      ],
    },
  ],
};

/** Minimal executor for tests; the real plot loop is PLOT-1. */
async function run(driver: PlotterDriver, plan: Plan) {
  await driver.enableMotors('16x');
  for (const it of plan.items) {
    if (it.kind === 'servo') await driver.setServo(it.settings);
    else if (it.kind === 'pen') await (it.down ? driver.penDown(it.ms) : driver.penUp(it.ms));
    else await driver.move(it.segments);
  }
  await driver.waitIdle();
}

/** A fake clock so real-time mode runs instantly but keeps its timing. */
function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

describe('SimulatedDriver (DRIVER-4)', () => {
  it('runs a plan, logs EBB commands, and ends at home with the pen up', async () => {
    const sim = new SimulatedDriver(profile);
    await sim.connect('/dev/cu.sim');
    const plan = planToolpath(drawing, profile, () => settings);
    await run(sim, plan);
    expect(await sim.queryPosition()).toEqual({ a: 0, b: 0 });
    expect(sim.penIsUp).toBe(true);
    const cmds = sim.log.map((l) => l.cmd);
    expect(cmds[0]).toBe('V');
    expect(cmds).toContain('EM,1,1');
    expect(cmds).toContain('SC,4,20641');
    expect(cmds).toContain('SC,5,15248');
    expect(cmds.some((c) => /^XM,\d+,-?\d+,-?\d+$/.test(c))).toBe(true);
    expect(cmds.filter((c) => c.startsWith('SP,0'))).toHaveLength(2);
  });

  it('machine time equals the plan estimate (MOTION-2)', async () => {
    const sim = new SimulatedDriver(profile);
    await sim.connect('sim');
    const plan = planToolpath(drawing, profile, () => settings);
    await run(sim, plan);
    expect(sim.machineMs).toBe(plan.totalMs);
  });

  it('real-time mode takes the planned time and keeps one command queued ahead', async () => {
    const clock = fakeClock();
    const sim = new SimulatedDriver(profile, { speed: 1, clock });
    await sim.connect('sim');
    const plan = planToolpath(drawing, profile, () => settings);
    await run(sim, plan);
    expect(clock.now()).toBeCloseTo(plan.totalMs, 6);
    expect(await sim.queryPosition()).toEqual({ a: 0, b: 0 });
  });

  it('real-time mode at 10x runs ten times faster', async () => {
    const clock = fakeClock();
    const sim = new SimulatedDriver(profile, { speed: 10, clock });
    await sim.connect('sim');
    const plan = planToolpath(drawing, profile, () => settings);
    await run(sim, plan);
    expect(clock.now()).toBeCloseTo(plan.totalMs / 10, 6);
  });

  it('reports position partway through a move in real time', async () => {
    const clock = fakeClock();
    const sim = new SimulatedDriver(profile, { speed: 1, clock });
    await sim.connect('sim');
    await sim.enableMotors('16x');
    await sim.move([{ ms: 1000, x: 8000, y: 0 }]);
    await clock.sleep(500);
    const { a, b } = await sim.queryPosition();
    expect((a + b) / 2).toBe(4000);
  });

  it('home returns from anywhere with the pen up', async () => {
    const sim = new SimulatedDriver(profile);
    await sim.connect('sim');
    await sim.enableMotors('16x');
    await sim.penDown(100);
    await sim.move([{ ms: 1000, x: 4000, y: 1234 }]);
    await sim.home();
    expect(sim.penIsUp).toBe(true);
    expect(await sim.queryPosition()).toEqual({ a: 0, b: 0 });
  });

  it('can disconnect mid-plot and keeps the position it reached', async () => {
    const sim = new SimulatedDriver(profile);
    await sim.connect('sim');
    sim.injectFault('disconnect', 20);
    const plan = planToolpath(drawing, profile, () => settings);
    const err = await run(sim, plan).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DriverError);
    expect((err as DriverError).code).toBe('disconnected');
    expect(sim.connected).toBe(false);
    expect(sim.steps).not.toEqual({ x: 0, y: 0 });
    await expect(sim.penUp(100)).rejects.toMatchObject({ code: 'not-connected' });
  });

  it('can time out once and keep working', async () => {
    const sim = new SimulatedDriver(profile);
    await sim.connect('sim');
    sim.injectFault('timeout');
    await expect(sim.penUp(100)).rejects.toMatchObject({ code: 'timeout' });
    await expect(sim.penUp(100)).resolves.toBeUndefined();
  });

  it('latches the button until it is read', async () => {
    const sim = new SimulatedDriver(profile);
    await sim.connect('sim');
    expect(await sim.queryButton()).toBe(false);
    sim.pressButton();
    expect(await sim.queryButton()).toBe(true);
    expect(await sim.queryButton()).toBe(false);
  });

  it('rejects moves the board would reject', async () => {
    const sim = new SimulatedDriver(profile);
    await sim.connect('sim');
    await expect(sim.move([{ ms: 0, x: 1, y: 0 }])).rejects.toMatchObject({
      code: 'invalid-command',
    });
    await expect(sim.move([{ ms: 10, x: 1.5, y: 0 }])).rejects.toMatchObject({
      code: 'invalid-command',
    });
    await expect(sim.move([{ ms: 1, x: 100, y: 0 }])).rejects.toMatchObject({
      code: 'invalid-command',
    });
  });

  it('enabling the motors clears the step counters, like the EBB', async () => {
    const sim = new SimulatedDriver(profile);
    await sim.connect('sim');
    await sim.move([{ ms: 100, x: 80, y: 0 }]);
    await sim.enableMotors('16x');
    expect(await sim.queryPosition()).toEqual({ a: 0, b: 0 });
  });
});
