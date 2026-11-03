import type { Vec2 } from '@plotka/core';
import { DriverError } from '../driver/types';
import type { Plan, StepPos } from '../motion/plan';
import type { ServoSettings } from '../servo';
import type { Machine } from './machine';

export type RunState =
  'ready' | 'running' | 'pausing' | 'paused' | 'stopping' | 'stopped' | 'done' | 'error';

export type RunProgress = {
  state: RunState;
  /** Planned machine time completed and in total, ms. */
  doneMs: number;
  totalMs: number;
  /** Wall time spent plotting (pauses excluded), ms. */
  elapsedMs: number;
  /** Index into the plan's layers, and that layer's id. */
  layerIndex: number;
  layerId: string | null;
  pathIndex: number;
  /** Pen position from home, mm. */
  position: Vec2 | null;
  penDown: boolean;
  /** Why it stopped, for errors; or a note for the user. */
  message?: string;
};

export type RunnerOptions = {
  onProgress?: (p: RunProgress) => void;
  /** How often to check the physical button while plotting / paused, ms. */
  buttonPollMs?: number;
  /**
   * After the button pauses or resumes, ignore it until it has been seen released and this many
   * ms have passed. One press can register more than once (held, contact bounce).
   */
  buttonGuardMs?: number;
  /** Minimum time between progress events while running, ms. */
  progressMs?: number;
  /** Speed for the travel back after a pause, % of pen-up max. */
  resumeSpeed?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

type Timers = { setTimeout(f: () => void, ms: number): unknown };
const timers = globalThis as unknown as Timers;

/**
 * Runs a plan on the machine (PLOT-1). One move segment is sent at a time, so the board has at
 * most one command queued and pause takes effect within one segment.
 *
 * - pause(): finish the queued segment, raise the pen, remember the spot.
 * - resume(): travel back to the spot if the carriage moved, lower the pen if it was down, go on.
 * - stop(): raise the pen and go home.
 * - The machine's button toggles pause / resume.
 * - A driver error (e.g. unplugged) ends in 'error' with the spot kept; resume() continues after
 *   reconnecting.
 */
export class PlotRunner {
  private _state: RunState = 'ready';
  private item = 0;
  private seg = 0;
  private doneMs = 0;
  private elapsed = 0;
  private runSince = 0;
  private lastEmit = -Infinity;
  private lastPoll = -Infinity;
  private pauseRequested = false;
  private stopRequested = false;
  private resumeNeeded = false;
  private pausedAt: StepPos | null = null;
  private penDown = false;
  private servo: ServoSettings | null = null;
  private layerIndex = -1;
  private pathIndex = -1;
  private message: string | undefined;
  private active: Promise<void> | null = null;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly pollMs: number;
  private readonly guardMs: number;
  /** False after the button acted, until a reading shows it released. */
  private buttonArmed = true;
  private lastButtonAction = -Infinity;
  private readonly progressMs: number;

  constructor(
    private readonly machine: Machine,
    readonly plan: Plan,
    private readonly options: RunnerOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.sleep =
      options.sleep ?? ((ms) => new Promise((r) => void timers.setTimeout(() => r(), ms)));
    this.pollMs = options.buttonPollMs ?? 200;
    this.guardMs = options.buttonGuardMs ?? 750;
    this.progressMs = options.progressMs ?? 100;
  }

  get state(): RunState {
    return this._state;
  }

  get progress(): RunProgress {
    const running = this._state === 'running' || this._state === 'pausing';
    return {
      state: this._state,
      doneMs: this.doneMs,
      totalMs: this.plan.totalMs,
      elapsedMs: this.elapsed + (running ? this.now() - this.runSince : 0),
      layerIndex: this.layerIndex,
      layerId: this.plan.layers[this.layerIndex]?.layerId ?? null,
      pathIndex: this.pathIndex,
      position: this.machine.state.position,
      penDown: this.penDown,
      ...(this.message ? { message: this.message } : {}),
    };
  }

  /** Starts the plot. Resolves when it finishes, pauses, stops or fails. */
  start(): Promise<void> {
    if (this._state !== 'ready') return this.active ?? Promise.resolve();
    return this.launch();
  }

  pause() {
    if (this._state !== 'running') return;
    this.pauseRequested = true;
    this.setState('pausing');
  }

  /** Continues after a pause, or after an error once the plotter is connected again. */
  resume(): Promise<void> {
    if (this._state !== 'paused' && this._state !== 'error')
      return this.active ?? Promise.resolve();
    return this.launch();
  }

  toggle(): Promise<void> | void {
    if (this._state === 'running') return this.pause();
    if (this._state === 'paused') return this.resume();
  }

  /** Raises the pen and goes home. */
  async stop(): Promise<void> {
    if (this._state === 'running' || this._state === 'pausing') {
      this.stopRequested = true;
      this.setState('stopping');
      await this.active;
      return;
    }
    if (this._state === 'paused' || this._state === 'error' || this._state === 'ready') {
      await this.finishStop();
    }
  }

  // --- loop ---

  private launch(): Promise<void> {
    this.active = this.run();
    return this.active;
  }

  private async run() {
    this.message = undefined;
    this.pauseRequested = false;
    this.stopRequested = false;
    this.runSince = this.now();
    this.setState('running');
    const items = this.plan.items;
    try {
      if (this.resumeNeeded) await this.returnToSpot();
      while (this.item < items.length) {
        const it = items[this.item]!;
        if (it.kind === 'servo') {
          await this.machine.applyServo(it.settings);
          this.servo = it.settings;
          this.layerIndex = it.layerIndex;
          this.item++;
          continue;
        }
        this.layerIndex = it.layerIndex >= 0 ? it.layerIndex : this.layerIndex;
        this.pathIndex = it.pathIndex;
        if (it.kind === 'pen') {
          if (it.down) await this.machine.penDown(it.ms);
          else await this.machine.penUp(it.ms);
          this.penDown = it.down;
          this.doneMs += it.ms;
          this.item++;
          if (await this.interrupted()) return;
          continue;
        }
        await this.machine.ensureMotors();
        while (this.seg < it.segments.length) {
          const s = it.segments[this.seg]!;
          await this.machine.step(s);
          this.seg++;
          this.doneMs += s.ms;
          this.emit();
          if (await this.interrupted()) return;
        }
        this.seg = 0;
        this.item++;
      }
      await this.machine.waitIdle();
      this.penDown = false;
      this.stopClock();
      this.setState('done');
    } catch (e) {
      this.fail(e);
    }
  }

  /** Checks for pause / stop requests and the button. True if the loop should end. */
  private async interrupted(): Promise<boolean> {
    if (!this.pauseRequested && !this.stopRequested && this.now() - this.lastPoll >= this.pollMs) {
      this.lastPoll = this.now();
      if (await this.buttonPressed()) {
        this.pauseRequested = true;
        this.setState('pausing');
      }
    }
    if (this.stopRequested) {
      await this.finishStop();
      return true;
    }
    if (this.pauseRequested) {
      await this.finishPause();
      return true;
    }
    return false;
  }

  private async finishPause() {
    await this.machine.waitIdle();
    if (this.penDown) {
      await this.machine.penUp(this.servo?.raiseMs);
      await this.machine.waitIdle();
    }
    this.pausedAt = this.machine.steps;
    this.resumeNeeded = true;
    this.pauseRequested = false;
    this.stopClock();
    this.setState('paused');
    void this.watchButton();
  }

  /** While paused, a press of the machine's button resumes. */
  private async watchButton() {
    while (this._state === 'paused') {
      await this.sleep(this.pollMs);
      if (this._state !== 'paused') return;
      try {
        if (await this.buttonPressed()) {
          void this.resume();
          return;
        }
      } catch {
        return;
      }
    }
  }

  /**
   * A fresh press of the machine's button. The board only reports "pressed since the last
   * reading", so a held or bouncing button keeps reporting presses: after acting on one, wait
   * for a reading without a press and for the guard time before acting again.
   */
  private async buttonPressed(): Promise<boolean> {
    const pressed = await this.machine.driver.queryButton();
    if (!pressed) {
      this.buttonArmed = true;
      return false;
    }
    if (!this.buttonArmed || this.now() - this.lastButtonAction < this.guardMs) return false;
    this.buttonArmed = false;
    this.lastButtonAction = this.now();
    return true;
  }

  /** After a pause or reconnect: back to where we stopped, pen down if it was. */
  private async returnToSpot() {
    await this.machine.ensureMotors();
    if (this.servo) await this.machine.applyServo(this.servo);
    const here = this.machine.steps;
    const spot = this.pausedAt;
    if (spot && here && (here.x !== spot.x || here.y !== spot.y)) {
      const spm = this.machine.profile.stepsPerMm;
      await this.machine.travelTo(
        { x: spot.x / spm, y: spot.y / spm },
        this.options.resumeSpeed ?? 50,
      );
    }
    if (this.penDown) await this.machine.penDown(this.servo?.lowerMs);
    this.resumeNeeded = false;
  }

  private async finishStop() {
    this.stopClock();
    this.setState('stopping');
    try {
      if (this.machine.driver.connected) {
        await this.machine.waitIdle().catch(() => undefined);
        await this.machine.penUp(this.servo?.raiseMs);
        this.penDown = false;
        if (this.machine.steps) await this.machine.home();
      }
      this.resumeNeeded = false;
      this.setState('stopped');
    } catch (e) {
      this.fail(e);
    }
  }

  private fail(e: unknown) {
    this.stopClock();
    this.message =
      e instanceof DriverError
        ? e.code === 'disconnected'
          ? 'The plotter was disconnected. Reconnect it, then Resume to continue from the same spot (if the carriage wasn’t moved), or Stop.'
          : e.message
        : e instanceof Error
          ? e.message
          : String(e);
    this.pausedAt = this.machine.steps;
    this.resumeNeeded = true;
    this.setState('error');
  }

  private stopClock() {
    if (this._state === 'running' || this._state === 'pausing' || this._state === 'stopping') {
      this.elapsed += this.now() - this.runSince;
      this.runSince = this.now();
    }
  }

  private setState(s: RunState) {
    this._state = s;
    this.emit(true);
  }

  private emit(force = false) {
    const t = this.now();
    if (!force && t - this.lastEmit < this.progressMs) return;
    this.lastEmit = t;
    this.options.onProgress?.(this.progress);
  }
}
