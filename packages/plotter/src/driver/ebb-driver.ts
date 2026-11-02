import { ebb, fromMotors, toMotors, type MotionSegment } from '../ebb';
import { planTravel } from '../motion/plan';
import type { MachineProfile } from '../profile';
import { servoSettings } from '../servo';
import { DriverError, type DeviceInfo, type PlotterDriver } from './types';

/** A byte stream to the board (USB serial in the app, a fake in tests). */
export interface Transport {
  write(data: string): Promise<void>;
  onData(listener: (chunk: string) => void): void;
  /** Called once when the connection goes away (unplugged, closed). */
  onClose(listener: (error?: Error) => void): void;
  close(): Promise<void>;
}

export type OpenTransport = (portPath: string) => Promise<Transport>;

export type EbbDriverOptions = {
  /** Base reply timeout, ms. Queued motion time is added on top. */
  replyTimeoutMs?: number;
  /** For tests. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
  /** Called when the board disconnects unexpectedly. */
  onDisconnect?: (error?: Error) => void;
};

type Timers = { setTimeout(f: () => void, ms: number): unknown; clearTimeout(t: unknown): void };
const timers = globalThis as unknown as Timers;

/** Oldest firmware with everything we use (XM 2.3.0, QG 2.6.2). */
export const MIN_FIRMWARE = [2, 6, 2] as const;

type Expect = 'ok' | 'line' | 'line+ok';

/** QG bits (fw 2.6.2+): 0 FIFO not empty, 1–2 motors moving, 3 command executing, 5 button. */
const QG_BUSY = 0x0f;
const QG_BUTTON = 0x20;

export function parseFirmware(v: string): [number, number, number] | null {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

const atLeast = (v: readonly number[], min: readonly number[]) => {
  for (let i = 0; i < min.length; i++) {
    if ((v[i] ?? 0) > min[i]!) return true;
    if ((v[i] ?? 0) < min[i]!) return false;
  }
  return true;
};

/** Duration of a queued command (XM, SM, SP with a delay), in ms; 0 for immediate ones. */
export function queuedMs(cmd: string): number {
  const p = cmd.split(',');
  const c = p[0]!.toUpperCase();
  if (c === 'XM' || c === 'SM') return Number(p[1]) || 0;
  if (c === 'SP') return Number(p[2]) || 0;
  return 0;
}

/**
 * The EiBotBoard driver (legacy reply syntax). Commands go out one at a time and replies are
 * matched in order. See docs/hardware-notes.md for the protocol details this relies on.
 */
export class EbbDriver implements PlotterDriver {
  private transport: Transport | null = null;
  private buffer = '';
  private lines: string[] = [];
  private waiter: ((line: string | Error) => void) | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  /** Machine time (ms, our clock) when the queued motion is expected to finish. */
  private busyUntil = 0;
  private lastQueuedMs = 0;
  private needsResync = false;
  private buttonLatched = false;
  private _connected = false;
  /** Commanded position, X/Y steps. */
  private x = 0;
  private y = 0;
  private penIsUp = true;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly timeoutMs: number;

  constructor(
    private readonly profile: MachineProfile,
    private readonly open: OpenTransport,
    private readonly options: EbbDriverOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.sleep =
      options.sleep ?? ((ms) => new Promise((r) => void timers.setTimeout(() => r(), ms)));
    this.timeoutMs = options.replyTimeoutMs ?? 2000;
  }

  get connected() {
    return this._connected;
  }

  /** Commanded position in X/Y steps. */
  get steps() {
    return { x: this.x, y: this.y };
  }

  get penUpState() {
    return this.penIsUp;
  }

  async connect(portPath: string): Promise<DeviceInfo> {
    if (this.transport) await this.disconnect();
    const t = await this.open(portPath);
    this.transport = t;
    this.buffer = '';
    this.lines = [];
    this.needsResync = false;
    t.onData((chunk) => this.receive(chunk));
    t.onClose((err) => this.lost(err));
    this._connected = true;
    try {
      const firmware = await this.exec(ebb.version(), 'line');
      const v = parseFirmware(firmware);
      if (!/EBB/i.test(firmware) || !v)
        throw new DriverError(
          'protocol',
          `This doesn't look like an EBB plotter board ("${firmware}").`,
        );
      if (!atLeast(v, MIN_FIRMWARE))
        throw new DriverError(
          'protocol',
          `The plotter's firmware (${v.join('.')}) is too old. Version ${MIN_FIRMWARE.join('.')} or newer is needed.`,
        );
      // The pen state and position are unknown until we set them.
      return { port: portPath, firmware, firmwareVersion: v.join('.') };
    } catch (e) {
      await this.disconnect();
      throw e;
    }
  }

  async disconnect() {
    const t = this.transport;
    this.transport = null;
    this._connected = false;
    this.fail(new DriverError('not-connected', 'Disconnected.'));
    if (t) await t.close().catch(() => undefined);
  }

  async penUp(ms: number) {
    await this.exec(ebb.pen(true, ms, this.profile.servo.pin), 'ok');
    this.penIsUp = true;
  }

  async penDown(ms: number) {
    await this.exec(ebb.pen(false, ms, this.profile.servo.pin), 'ok');
    this.penIsUp = false;
  }

  async setServo(s: { up: number; down: number; rateUp: number; rateDown: number }) {
    await this.exec(ebb.servoUp(s.up), 'ok');
    await this.exec(ebb.servoDown(s.down), 'ok');
    await this.exec(ebb.servoRateUp(s.rateUp), 'ok');
    await this.exec(ebb.servoRateDown(s.rateDown), 'ok');
  }

  async enableMotors(resolution: '16x' | '8x') {
    await this.waitIdle();
    await this.exec(ebb.enableMotors(resolution === '16x' ? 1 : 2), 'ok');
    // Changing the motor mode clears the board's step counters: this spot is now (0, 0).
    this.x = 0;
    this.y = 0;
  }

  async disableMotors() {
    await this.waitIdle();
    await this.exec(ebb.enableMotors(0), 'ok');
    this.x = 0;
    this.y = 0;
  }

  async move(segments: MotionSegment[]) {
    for (const s of segments) {
      const { a, b } = toMotors(s.x, s.y);
      const rate = (Math.max(Math.abs(a), Math.abs(b)) * 1000) / s.ms;
      if (
        !(s.ms >= 1) ||
        rate > this.profile.maxStepRate ||
        !Number.isInteger(s.x) ||
        !Number.isInteger(s.y)
      )
        throw new DriverError('invalid-command', `Refusing an invalid move ${ebb.move(s)}.`);
      await this.exec(ebb.move(s), 'ok');
      this.x += s.x;
      this.y += s.y;
    }
  }

  async home() {
    if (!this.penIsUp) await this.penUp(servoSettings(this.profile.servo).raiseMs);
    const m = planTravel(this.profile, this.steps, { x: 0, y: 0 }, 75);
    await this.move(m.segments);
    await this.waitIdle();
  }

  async queryButton() {
    await this.status();
    const pressed = this.buttonLatched;
    this.buttonLatched = false;
    return pressed;
  }

  async queryPosition() {
    const line = await this.exec(ebb.querySteps(), 'line+ok');
    const [a, b] = line.split(',').map((n) => Number(n.trim()));
    if (!Number.isFinite(a) || !Number.isFinite(b))
      throw new DriverError('protocol', `Unexpected step counter reply "${line}".`);
    return { a: a!, b: b! };
  }

  /** QG status byte. Remembers a button press for queryButton. */
  async status(): Promise<number> {
    const line = await this.exec(ebb.queryGeneral(), 'line');
    const g = parseInt(line.trim(), 16);
    if (!Number.isFinite(g))
      throw new DriverError('protocol', `Unexpected status reply "${line}".`);
    if (g & QG_BUTTON) this.buttonLatched = true;
    return g;
  }

  async waitIdle() {
    const deadline = () => Math.max(this.busyUntil, this.now()) + this.lastQueuedMs + 3000;
    const end = deadline();
    for (;;) {
      const g = await this.status();
      if ((g & QG_BUSY) === 0) {
        this.busyUntil = 0;
        return;
      }
      if (this.now() > Math.max(end, deadline()))
        throw new DriverError('timeout', 'The plotter is still busy after the expected time.');
      await this.sleep(Math.min(50, Math.max(5, this.busyUntil - this.now())));
    }
  }

  /** Stops motion now and empties the queue (emergency stop). */
  async emergencyStop() {
    await this.exec(ebb.stop(), 'line+ok');
    this.busyUntil = 0;
  }

  /** Commanded position, mm. */
  positionMm() {
    const spm = this.profile.stepsPerMm;
    return { x: this.x / spm, y: this.y / spm };
  }

  /** Board counters converted to X/Y steps (for checks). */
  async boardSteps() {
    const { a, b } = await this.queryPosition();
    return fromMotors(a, b);
  }

  // --- protocol plumbing ---

  /** Sends a command and waits for its reply. Commands never overlap. */
  private exec(cmd: string, expect: Expect): Promise<string> {
    const run = async () => {
      if (!this.transport || !this._connected)
        throw new DriverError('not-connected', 'The plotter is not connected.');
      if (this.needsResync) await this.resync();
      this.lines = [];
      await this.transport.write(`${cmd}\r`);
      const ms = queuedMs(cmd);
      const wait = this.timeoutMs + Math.max(0, this.busyUntil - this.now()) + this.lastQueuedMs;
      const first = await this.nextLine(wait, cmd);
      if (first.startsWith('!'))
        throw new DriverError(
          'protocol',
          `The plotter rejected "${cmd}": ${first.slice(1).trim()}`,
        );
      let data = '';
      if (expect === 'ok') {
        if (first !== 'OK')
          throw new DriverError('protocol', `Expected OK for "${cmd}", got "${first}".`);
      } else {
        data = first;
        if (expect === 'line+ok') {
          const ok = await this.nextLine(this.timeoutMs, cmd);
          if (ok !== 'OK')
            throw new DriverError('protocol', `Expected OK after "${cmd}", got "${ok}".`);
        }
      }
      if (ms > 0) {
        // The reply means the command is in the queue; it runs after whatever is ahead of it.
        this.busyUntil = Math.max(this.busyUntil, this.now()) + ms;
        this.lastQueuedMs = ms;
      }
      return data;
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }

  private nextLine(timeoutMs: number, cmd: string): Promise<string> {
    const queued = this.lines.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const set = this.options.setTimer ?? ((f, ms) => timers.setTimeout(f, ms));
      const clear = this.options.clearTimer ?? ((t) => timers.clearTimeout(t));
      const timer = set(() => {
        this.waiter = null;
        this.needsResync = true;
        reject(new DriverError('timeout', `The plotter didn't answer "${cmd}".`));
      }, timeoutMs);
      this.waiter = (line) => {
        clear(timer);
        this.waiter = null;
        if (line instanceof Error) reject(line);
        else resolve(line);
      };
    });
  }

  private receive(chunk: string) {
    this.buffer += chunk;
    const parts = this.buffer.split(/[\r\n]+/);
    this.buffer = parts.pop() ?? '';
    for (const raw of parts) {
      const line = raw.trim();
      if (!line) continue;
      if (this.waiter) this.waiter(line);
      else this.lines.push(line);
    }
  }

  /** After a timeout: let queued motion finish and drop any late replies. */
  private async resync() {
    this.needsResync = false;
    const wait = Math.max(0, this.busyUntil - this.now()) + this.lastQueuedMs + 200;
    await this.sleep(wait);
    this.lines = [];
    this.buffer = '';
    this.busyUntil = 0;
  }

  private fail(err: Error) {
    const w = this.waiter;
    this.waiter = null;
    w?.(err);
  }

  private lost(err?: Error) {
    if (!this.transport) return; // we closed it ourselves
    this.transport = null;
    this._connected = false;
    this.fail(new DriverError('disconnected', 'The plotter was disconnected.'));
    this.options.onDisconnect?.(err);
  }
}
