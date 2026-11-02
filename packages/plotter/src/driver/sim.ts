import { ebb, toMotors, type MotionSegment } from '../ebb';
import { planTravel } from '../motion/plan';
import type { MachineProfile } from '../profile';
import { servoSettings } from '../servo';
import { DriverError, type DeviceInfo, type PlotterDriver } from './types';

export type SimFault = 'disconnect' | 'timeout';

export type SimOptions = {
  /** 0 = instant (default). 1 = real time, 10 = ten times faster. */
  speed?: number;
  /** Firmware string to report. */
  firmware?: string;
  /** Called for every command, in EBB syntax. */
  onCommand?: (cmd: string, machineMs: number) => void;
  /** Max log entries kept (oldest dropped). Default 100 000. */
  logLimit?: number;
  /** For tests: replaces the wall clock and sleep in real-time mode. */
  clock?: { now(): number; sleep(ms: number): Promise<void> };
};

type Scheduled = { start: number; end: number; x: number; y: number };

const defaultClock = {
  now: () => Date.now(),
  sleep: (ms: number) =>
    new Promise<void>((resolve) =>
      (globalThis as unknown as { setTimeout(f: () => void, ms: number): unknown }).setTimeout(
        resolve,
        ms,
      ),
    ),
};

/**
 * A plotter that only exists in memory (DRIVER-4). Logs commands, tracks position, pen and
 * motor state, and can fail on purpose. Real-time mode models the EBB's one-command FIFO:
 * `move` returns once its last segment is queued, like the real board.
 */
export class SimulatedDriver implements PlotterDriver {
  readonly log: { ms: number; cmd: string }[] = [];
  /** Machine time spent on queued commands (moves and pen waits), ms. */
  machineMs = 0;
  /** Commands sent since connect. */
  commandCount = 0;
  penIsUp = true;
  motorsOn = false;
  servo = { up: 0, down: 0, rateUp: 0, rateDown: 0 };
  private _connected = false;
  private port = '';
  /** Completed step position (X/Y steps). */
  private x = 0;
  private y = 0;
  private schedule: Scheduled[] = [];
  private buttonLatched = false;
  private fault: { kind: SimFault; after: number } | null = null;
  private readonly clock: NonNullable<SimOptions['clock']>;

  constructor(
    private readonly profile: MachineProfile,
    private readonly options: SimOptions = {},
  ) {
    this.clock = options.clock ?? defaultClock;
  }

  get connected() {
    return this._connected;
  }

  /** Make the command after the next `after` commands fail. */
  injectFault(kind: SimFault, after = 0) {
    this.fault = { kind, after };
  }

  /** Simulate a press of the physical button. */
  pressButton() {
    this.buttonLatched = true;
  }

  /** Current X/Y step position, including the part of the move in progress. */
  get steps() {
    this.settle();
    const now = this.clock.now();
    let { x, y } = this;
    for (const s of this.schedule) {
      if (s.start >= now) break;
      const f = Math.min(1, (now - s.start) / (s.end - s.start));
      x += Math.round(s.x * f);
      y += Math.round(s.y * f);
    }
    return { x, y };
  }

  async connect(portPath: string): Promise<DeviceInfo> {
    this._connected = true;
    this.port = portPath;
    this.commandCount = 0;
    const firmware = this.options.firmware ?? 'EBBv13_and_above EB Firmware Version 2.8.1';
    this.record(ebb.version());
    return { port: portPath, firmware, firmwareVersion: /(\d+\.\d+\.\d+)/.exec(firmware)?.[1] };
  }

  async disconnect() {
    this._connected = false;
    this.schedule = [];
  }

  async penUp(ms: number) {
    this.send(ebb.pen(true, ms, this.profile.servo.pin));
    this.penIsUp = true;
    await this.queue(ms, 0, 0);
  }

  async penDown(ms: number) {
    this.send(ebb.pen(false, ms, this.profile.servo.pin));
    this.penIsUp = false;
    await this.queue(ms, 0, 0);
  }

  async setServo(s: { up: number; down: number; rateUp: number; rateDown: number }) {
    this.send(ebb.servoUp(s.up));
    this.send(ebb.servoDown(s.down));
    this.send(ebb.servoRateUp(s.rateUp));
    this.send(ebb.servoRateDown(s.rateDown));
    this.servo = { ...s };
  }

  async enableMotors(resolution: '16x' | '8x') {
    await this.waitIdle();
    this.send(ebb.enableMotors(resolution === '16x' ? 1 : 2));
    // Like the EBB, changing the motor mode clears the step counters.
    this.motorsOn = true;
    this.x = 0;
    this.y = 0;
  }

  async disableMotors() {
    await this.waitIdle();
    this.send(ebb.enableMotors(0));
    this.motorsOn = false;
    this.x = 0;
    this.y = 0;
  }

  async move(segments: MotionSegment[]) {
    for (const seg of segments) {
      this.validate(seg);
      this.send(ebb.move(seg));
      this.motorsOn = true;
      await this.queue(seg.ms, seg.x, seg.y);
    }
  }

  async home() {
    if (!this.penIsUp) {
      const s = servoSettings(this.profile.servo);
      await this.penUp(s.raiseMs);
    }
    await this.waitIdle();
    const m = planTravel(this.profile, this.steps, { x: 0, y: 0 }, 75);
    await this.move(m.segments);
    await this.waitIdle();
  }

  async queryButton() {
    this.send(ebb.queryGeneral());
    const pressed = this.buttonLatched;
    this.buttonLatched = false;
    return pressed;
  }

  async queryPosition() {
    this.send(ebb.querySteps());
    const { x, y } = this.steps;
    return toMotors(x, y);
  }

  async waitIdle() {
    const last = this.schedule[this.schedule.length - 1];
    if (last) {
      const wait = last.end - this.clock.now();
      if (wait > 0) await this.clock.sleep(wait);
    }
    this.settle();
  }

  // --- internals ---

  private send(cmd: string) {
    if (!this._connected) throw new DriverError('not-connected', 'The plotter is not connected.');
    const f = this.fault;
    if (f) {
      if (f.after > 0) f.after--;
      else {
        this.fault = null;
        if (f.kind === 'disconnect') {
          this._connected = false;
          this.schedule = [];
          throw new DriverError('disconnected', 'The plotter was disconnected.');
        }
        throw new DriverError('timeout', `The plotter didn't answer "${cmd}".`);
      }
    }
    this.commandCount++;
    this.record(cmd);
  }

  private record(cmd: string) {
    this.log.push({ ms: this.machineMs, cmd });
    const limit = this.options.logLimit ?? 100_000;
    if (this.log.length > limit) this.log.splice(0, this.log.length - limit);
    this.options.onCommand?.(cmd, this.machineMs);
  }

  private validate(s: MotionSegment) {
    const bad = (why: string) => {
      throw new DriverError('invalid-command', `Invalid move ${ebb.move(s)}: ${why}.`);
    };
    if (!Number.isInteger(s.ms) || s.ms < 1) bad('time must be a whole number of ms, at least 1');
    if (!Number.isInteger(s.x) || !Number.isInteger(s.y)) bad('steps must be whole numbers');
    const { a, b } = toMotors(s.x, s.y);
    const rate = (Math.max(Math.abs(a), Math.abs(b)) * 1000) / s.ms;
    if (rate > this.profile.maxStepRate) bad(`step rate ${Math.round(rate)}/s is too high`);
  }

  /** Adds a queued command to the machine timeline, waiting for FIFO space in real time. */
  private async queue(ms: number, x: number, y: number) {
    this.machineMs += ms;
    const speed = this.options.speed ?? 0;
    if (speed <= 0) {
      this.x += x;
      this.y += y;
      return;
    }
    // One command executing plus one waiting in the FIFO; the next has to wait.
    for (;;) {
      this.settle();
      const now = this.clock.now();
      const pending = this.schedule.filter((s) => s.end > now);
      if (pending.length < 2) break;
      await this.clock.sleep(pending[0]!.end - now);
    }
    const now = this.clock.now();
    const prev = this.schedule[this.schedule.length - 1];
    const start = Math.max(now, prev ? prev.end : now);
    this.schedule.push({ start, end: start + ms / speed, x, y });
  }

  /** Folds finished commands into the position. */
  private settle() {
    const now = this.clock.now();
    while (this.schedule.length && this.schedule[0]!.end <= now) {
      const s = this.schedule.shift()!;
      this.x += s.x;
      this.y += s.y;
    }
  }
}
