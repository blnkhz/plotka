import type { Vec2 } from '@plotter-studio/core';
import type { MotionSegment } from '../ebb';
import { planTravel, type StepPos } from '../motion/plan';
import type { MachineProfile } from '../profile';
import { servoSettings, type ServoSettings } from '../servo';
import type { PlotterDriver } from '../driver/types';

export type MachineState = {
  connected: boolean;
  motorsOn: boolean;
  /** null until the pen has been raised or lowered by us. */
  penUp: boolean | null;
  /** Pen position from home, mm. null = unknown (motors were off). */
  position: Vec2 | null;
  /** Pen heights in use, %. */
  penPosUp: number;
  penPosDown: number;
};

/** Speed for manual moves (jog, home), % of the pen-up maximum. */
export const MANUAL_SPEED = 50;

/**
 * The machine as the app sees it: where the pen is (from home), whether the motors hold that
 * position, the pen state and heights. Wraps a driver; the plot runner and manual controls both
 * go through it so the position is always known.
 *
 * Home is where the carriage is when the motors switch on (the AxiDraw has no limit switches).
 * Turning the motors off forgets the position. A disconnect keeps it, assuming the carriage
 * wasn't moved, so a plot can resume.
 */
export class Machine {
  private pos: StepPos | null = null;
  private motors = false;
  private pen: boolean | null = null;
  private servo: ServoSettings;
  private heights: { up: number; down: number };
  private listeners = new Set<() => void>();

  constructor(
    readonly driver: PlotterDriver,
    readonly profile: MachineProfile,
  ) {
    this.heights = { up: profile.servo.penPosUp, down: profile.servo.penPosDown };
    this.servo = servoSettings(profile.servo, this.heights.up, this.heights.down);
  }

  get state(): MachineState {
    const spm = this.profile.stepsPerMm;
    return {
      connected: this.driver.connected,
      motorsOn: this.motors,
      penUp: this.pen,
      position: this.pos ? { x: this.pos.x / spm, y: this.pos.y / spm } : null,
      penPosUp: this.heights.up,
      penPosDown: this.heights.down,
    };
  }

  /** Current position in steps from home, or null if unknown. */
  get steps(): StepPos | null {
    return this.pos ? { ...this.pos } : null;
  }

  get servoSettings(): ServoSettings {
    return this.servo;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed() {
    for (const l of this.listeners) l();
  }

  /** After (re)connecting: the board starts with motors off and an unknown pen. */
  connected() {
    this.motors = false;
    this.pen = null;
    this.changed();
  }

  /** The board went away. Keep the position (for resuming); the motors are off now. */
  disconnected() {
    this.motors = false;
    this.pen = null;
    this.changed();
  }

  /** Switch the motors on. If the position is unknown, this spot becomes home. */
  async ensureMotors() {
    if (this.motors) return;
    await this.driver.enableMotors('16x');
    this.motors = true;
    if (!this.pos) this.pos = { x: 0, y: 0 };
    this.changed();
  }

  async motorsOff() {
    await this.driver.disableMotors();
    this.motors = false;
    this.pos = null;
    this.changed();
  }

  /** Pen heights (%), sent to the servo. Optionally moves the pen to show the new height. */
  async setPenHeights(up: number, down: number, show?: 'up' | 'down') {
    this.heights = { up, down };
    this.servo = servoSettings(this.profile.servo, up, down);
    await this.applyServo(this.servo);
    if (show === 'up') await this.penUp();
    if (show === 'down') await this.penDown();
    this.changed();
  }

  async applyServo(s: ServoSettings) {
    this.servo = s;
    await this.driver.setServo(s);
  }

  async penUp(ms = this.servo.raiseMs) {
    await this.driver.penUp(ms);
    this.pen = true;
    this.changed();
  }

  async penDown(ms = this.servo.lowerMs) {
    await this.driver.penDown(ms);
    this.pen = false;
    this.changed();
  }

  /** Sends pre-planned moves and tracks the position. */
  async move(segments: MotionSegment[]) {
    await this.ensureMotors();
    for (const s of segments) {
      await this.driver.move([s]);
      this.pos = { x: this.pos!.x + s.x, y: this.pos!.y + s.y };
    }
    this.changed();
  }

  /** One segment, without the change notification (the plot loop reports progress itself). */
  async step(s: MotionSegment) {
    await this.driver.move([s]);
    this.pos = { x: this.pos!.x + s.x, y: this.pos!.y + s.y };
  }

  /** Straight pen-up move to a point (mm from home). */
  async travelTo(target: Vec2, speedPct = MANUAL_SPEED) {
    await this.ensureMotors();
    if (this.pen !== true) await this.penUp();
    const m = planTravel(this.profile, this.pos!, target, speedPct);
    await this.move(m.segments);
  }

  /** Jog by (dx, dy) mm, kept inside the machine's travel. Returns the actual target. */
  async jog(dx: number, dy: number): Promise<Vec2> {
    await this.ensureMotors();
    const spm = this.profile.stepsPerMm;
    const { width, height } = this.profile.bed;
    const target = {
      x: Math.min(width, Math.max(0, this.pos!.x / spm + dx)),
      y: Math.min(height, Math.max(0, this.pos!.y / spm + dy)),
    };
    await this.travelTo(target);
    return target;
  }

  async home() {
    await this.travelTo({ x: 0, y: 0 });
    await this.driver.waitIdle();
  }

  async waitIdle() {
    await this.driver.waitIdle();
  }
}
