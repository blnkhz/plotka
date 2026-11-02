import { describe, expect, it } from 'vitest';
import type { Toolpath } from '@plotter-studio/core';
import {
  DEFAULT_PROFILE_ID,
  getProfile,
  Machine,
  planDryRun,
  planToolpath,
  PlotRunner,
  servoPosition,
  SimulatedDriver,
  type RunProgress,
} from '../src';

const profile = getProfile(DEFAULT_PROFILE_ID)!;
const spm = profile.stepsPerMm;
const settings = { speedPenDown: 25, speedPenUp: 75, penPosUp: 60, penPosDown: 30 };
const square = (x: number, y: number, s: number) => ({
  points: [
    { x, y },
    { x: x + s, y },
    { x: x + s, y: y + s },
    { x, y: y + s },
  ],
  closed: true,
});
const drawing: Toolpath = {
  layers: [
    { layerId: 'a', paths: [square(10, 10, 50), square(80, 10, 30)] },
    {
      layerId: 'b',
      paths: [
        {
          points: [
            { x: 20, y: 100 },
            { x: 120, y: 100 },
          ],
          closed: false,
        },
      ],
    },
  ],
};

async function setup() {
  const sim = new SimulatedDriver(profile);
  await sim.connect('sim');
  const machine = new Machine(sim, profile);
  const plan = planToolpath(drawing, profile, () => settings);
  const events: RunProgress[] = [];
  const runner = new PlotRunner(machine, plan, {
    onProgress: (p) => events.push(p),
    buttonPollMs: 0,
    progressMs: 0,
    sleep: async () => undefined,
  });
  return { sim, machine, plan, runner, events };
}

/** Pen-down distance drawn, from the simulator's command log. */
function drawnSteps(sim: SimulatedDriver) {
  let down = false;
  let total = 0;
  for (const { cmd } of sim.log) {
    if (cmd.startsWith('SP,0')) down = true;
    else if (cmd.startsWith('SP,1')) down = false;
    else if (cmd.startsWith('XM') && down) {
      const [, , x, y] = cmd.split(',').map(Number);
      total += Math.hypot(x!, y!);
    }
  }
  return total;
}

type Timers = { setTimeout(f: () => void, ms: number): unknown };
/** Yields to the event loop (a real macrotask), so timers and other work can run. */
const tick = () =>
  new Promise<void>((r) => void (globalThis as unknown as Timers).setTimeout(() => r(), 0));
/** Lets the paused runner's button watcher poll a few times. */
const settle = async (n = 10) => {
  for (let i = 0; i < n; i++) await tick();
};
const active = (r: PlotRunner) => (r as unknown as { active: Promise<void> }).active;

describe('PlotRunner (PLOT-1)', () => {
  it('runs a whole plot and ends at home with the pen up', async () => {
    const { sim, machine, plan, runner, events } = await setup();
    await runner.start();
    expect(runner.state).toBe('done');
    expect(machine.state.position).toEqual({ x: 0, y: 0 });
    expect(sim.penIsUp).toBe(true);
    expect(sim.machineMs).toBe(plan.totalMs);
    const last = events[events.length - 1]!;
    expect(last.doneMs).toBe(plan.totalMs);
    expect(events.some((e) => e.layerId === 'b')).toBe(true);
  });

  it('pause raises the pen and resume finishes the same drawing', async () => {
    const ref = await setup();
    await ref.runner.start();
    const fullDrawn = drawnSteps(ref.sim);

    const { sim, machine, runner, plan } = await setup();
    let paused = false;
    const r = new PlotRunner(machine, plan, {
      buttonPollMs: 0,
      progressMs: 0,
      sleep: async () => undefined,
      onProgress: (p) => {
        if (!paused && p.state === 'running' && p.penDown && p.doneMs > plan.totalMs / 3) {
          paused = true;
          r.pause();
        }
      },
    });
    void runner;
    await r.start();
    expect(r.state).toBe('paused');
    expect(sim.penIsUp).toBe(true);
    const spot = machine.state.position!;
    // Jog away while paused; resume must come back.
    await machine.jog(25, 15);
    expect(machine.state.position).not.toEqual(spot);
    await r.resume();
    expect(r.state).toBe('done');
    expect(machine.state.position).toEqual({ x: 0, y: 0 });
    // Same ink as an uninterrupted run (the travel back is pen-up).
    expect(drawnSteps(sim)).toBeCloseTo(fullDrawn, 6);
  });

  it('the machine button pauses, and a second press (after letting go) resumes', async () => {
    const { sim, machine, plan } = await setup();
    let pressed = false;
    const r = new PlotRunner(machine, plan, {
      buttonPollMs: 0,
      buttonGuardMs: 0,
      progressMs: 0,
      sleep: tick,
      onProgress: (p) => {
        if (!pressed && p.doneMs > plan.totalMs / 2) {
          pressed = true;
          sim.pressButton();
        }
      },
    });
    await r.start();
    expect(r.state).toBe('paused');
    await settle(); // button released: the watcher sees no press
    expect(r.state).toBe('paused');
    sim.pressButton();
    await settle();
    await active(r);
    expect(r.state).toBe('done');
    expect(machine.state.position).toEqual({ x: 0, y: 0 });
  });

  it('a held or bouncing button pauses once and does not resume by itself', async () => {
    const { sim, machine, plan } = await setup();
    let held = 0;
    let started = false;
    const r = new PlotRunner(machine, plan, {
      buttonPollMs: 0,
      buttonGuardMs: 0,
      progressMs: 0,
      // Every check while "held" sees another press, as the real board reports.
      sleep: async () => {
        if (held > 0) {
          held--;
          sim.pressButton();
        }
        await tick();
      },
      onProgress: (p) => {
        if (!started && p.doneMs > plan.totalMs / 2) {
          started = true;
          held = 6;
          sim.pressButton();
        }
      },
    });
    await r.start();
    expect(r.state).toBe('paused');
    await settle(30);
    expect(held).toBe(0);
    expect(r.state).toBe('paused'); // the hold didn't resume it
    expect(sim.penIsUp).toBe(true);
    await r.stop();
  });

  it('ignores presses within the guard time after acting (contact bounce)', async () => {
    const { sim, machine, plan } = await setup();
    let t = 0;
    let pressed = false;
    const r = new PlotRunner(machine, plan, {
      buttonPollMs: 0,
      buttonGuardMs: 750,
      progressMs: 0,
      now: () => t,
      sleep: tick, // time only moves when the test moves it
      onProgress: (p) => {
        if (!pressed && p.doneMs > plan.totalMs / 2) {
          pressed = true;
          sim.pressButton();
        }
      },
    });
    await r.start();
    expect(r.state).toBe('paused');
    await settle(); // released
    sim.pressButton(); // a bounce right after the pause
    await settle();
    expect(r.state).toBe('paused');
    t += 1000;
    await settle(); // released again
    sim.pressButton(); // a real second press, after the guard time
    await settle();
    await active(r);
    expect(r.state).toBe('done');
    expect(machine.state.position).toEqual({ x: 0, y: 0 });
  });

  it('stop raises the pen and goes home without finishing', async () => {
    const { sim, machine, plan } = await setup();
    let stopped = false;
    const r = new PlotRunner(machine, plan, {
      buttonPollMs: 0,
      progressMs: 0,
      sleep: async () => undefined,
      onProgress: (p) => {
        if (!stopped && p.state === 'running' && p.penDown) {
          stopped = true;
          void r.stop();
        }
      },
    });
    await r.start();
    expect(r.state).toBe('stopped');
    expect(sim.penIsUp).toBe(true);
    expect(machine.state.position).toEqual({ x: 0, y: 0 });
    expect(r.progress.doneMs).toBeLessThan(plan.totalMs);
  });

  it('a disconnect mid-plot keeps the spot; after reconnecting, resume finishes the drawing', async () => {
    const ref = await setup();
    await ref.runner.start();
    const fullDrawn = drawnSteps(ref.sim);

    const { sim, machine, plan } = await setup();
    const r = new PlotRunner(machine, plan, {
      buttonPollMs: 1e9,
      progressMs: 0,
      sleep: async () => undefined,
    });
    sim.injectFault('disconnect', 60);
    await r.start();
    expect(r.state).toBe('error');
    expect(r.progress.message).toMatch(/disconnected/);
    const spot = machine.state.position!;
    expect(spot).not.toBeNull();

    // Reconnect: the board restarts with motors off; the app keeps its position.
    await sim.connect('sim');
    machine.connected();
    expect(machine.state.position).toEqual(spot);
    await r.resume();
    expect(r.state).toBe('done');
    // The ink drawn before and after the disconnect adds up to the whole drawing, give or take
    // the one segment that was being sent when the cable went.
    expect(drawnSteps(sim)).toBeGreaterThan(fullDrawn * 0.97);
    expect(drawnSteps(sim)).toBeLessThanOrEqual(fullDrawn + 1e-6);
  });
});

describe('Machine', () => {
  it('home is where the motors switch on; motors off forgets the position', async () => {
    const sim = new SimulatedDriver(profile);
    await sim.connect('sim');
    const m = new Machine(sim, profile);
    expect(m.state.position).toBeNull();
    await m.jog(10, 5);
    expect(m.state.position).toEqual({ x: 10, y: 5 });
    await m.home();
    expect(m.state.position).toEqual({ x: 0, y: 0 });
    await m.motorsOff();
    expect(m.state.position).toBeNull();
  });

  it('jogs stay inside the machine travel', async () => {
    const sim = new SimulatedDriver(profile);
    await sim.connect('sim');
    const m = new Machine(sim, profile);
    await m.jog(-50, -50);
    expect(m.state.position).toEqual({ x: 0, y: 0 });
    await m.jog(1000, 1000);
    expect(m.state.position).toEqual({ x: profile.bed.width, y: profile.bed.height });
    expect(m.steps).toEqual({ x: profile.bed.width * spm, y: profile.bed.height * spm });
  });

  it('pen heights go to the servo and can be shown live', async () => {
    const sim = new SimulatedDriver(profile);
    await sim.connect('sim');
    const m = new Machine(sim, profile);
    await m.setPenHeights(70, 20, 'down');
    expect(sim.log.map((l) => l.cmd)).toEqual(
      expect.arrayContaining([
        `SC,4,${servoPosition(profile.servo, 70)}`,
        `SC,5,${servoPosition(profile.servo, 20)}`,
      ]),
    );
    expect(sim.penIsUp).toBe(false);
    expect(m.state.penPosUp).toBe(70);
  });
});

describe('planDryRun (PLOT-6)', () => {
  it('traces the bounds with the pen up and ends at home', async () => {
    const sim = new SimulatedDriver(profile);
    await sim.connect('sim');
    const machine = new Machine(sim, profile);
    const plan = planDryRun(profile, { minX: 20, minY: 30, maxX: 120, maxY: 90 }, { x: 0, y: 0 });
    expect(plan.items.every((i) => i.kind === 'move' && !i.penDown)).toBe(true);
    const corners = plan.items.map((i) => (i.kind === 'move' ? i.to : null));
    expect(corners.slice(0, 4)).toEqual([
      { x: 20 * spm, y: 30 * spm },
      { x: 120 * spm, y: 30 * spm },
      { x: 120 * spm, y: 90 * spm },
      { x: 20 * spm, y: 90 * spm },
    ]);
    const r = new PlotRunner(machine, plan, { buttonPollMs: 1e9, sleep: async () => undefined });
    await r.start();
    expect(r.state).toBe('done');
    expect(sim.log.some((l) => l.cmd.startsWith('SP,0'))).toBe(false); // never lowered
    expect(machine.state.position).toEqual({ x: 0, y: 0 });
  });

  it('stays inside the machine travel', () => {
    const plan = planDryRun(
      profile,
      { minX: -10, minY: -5, maxX: 1000, maxY: 1000 },
      { x: 0, y: 0 },
    );
    for (const i of plan.items)
      if (i.kind === 'move') {
        expect(i.to.x).toBeLessThanOrEqual(profile.bed.width * spm);
        expect(i.to.y).toBeLessThanOrEqual(profile.bed.height * spm);
        expect(Math.min(i.to.x, i.to.y)).toBeGreaterThanOrEqual(0);
      }
  });
});
