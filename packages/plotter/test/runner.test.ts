import { describe, expect, it } from 'vitest';
import type { Toolpath } from '@plotter-studio/core';
import {
  DEFAULT_PROFILE_ID,
  getProfile,
  Machine,
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

  it('the machine button pauses, and pressing it again resumes', async () => {
    const { sim, machine, plan } = await setup();
    let pressed = false;
    const r = new PlotRunner(machine, plan, {
      buttonPollMs: 0,
      progressMs: 0,
      sleep: async () => undefined,
      onProgress: (p) => {
        if (!pressed && p.doneMs > plan.totalMs / 2) {
          pressed = true;
          sim.pressButton();
        }
      },
    });
    await r.start();
    expect(r.state).toBe('paused');
    sim.pressButton();
    // The paused runner polls the button and resumes on its own.
    for (let i = 0; i < 1000 && r.state === 'paused'; i++) await Promise.resolve();
    await (r as unknown as { active: Promise<void> }).active;
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
