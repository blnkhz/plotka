import type { ServoProfile } from './profile';

/** EBB servo cycle: rates are applied once per 24 ms. */
const SERVO_CYCLE_MS = 24;

/** Pen height 0..100 % → EBB servo position (SC,4 / SC,5 value). */
export function servoPosition(servo: ServoProfile, pct: number): number {
  const p = Math.min(100, Math.max(0, pct));
  return Math.round(servo.min + ((servo.max - servo.min) * p) / 100);
}

/** Rate % → EBB servo rate (SC,11 / SC,12 value): position units per 24 ms cycle. */
export function servoRate(servo: ServoProfile, ratePct: number): number {
  const fullRate = ((servo.max - servo.min) * SERVO_CYCLE_MS) / servo.sweepMs;
  return Math.max(1, Math.round((fullRate * ratePct) / 100));
}

/**
 * ms to wait after a pen move of `distPct` (% of the servo range) at `ratePct`.
 * The servo needs at least moveMin + slope·dist; the rate limit sweeps the distance in
 * sweep·dist/rate. The slower one dominates; a 4-norm blends them where they're close, the same
 * model the vendor software uses (see docs/hardware-notes.md).
 */
export function penMoveMs(servo: ServoProfile, distPct: number, ratePct: number): number {
  const d = Math.abs(distPct);
  if (d === 0) return 0;
  const travel = servo.moveMinMs + servo.moveSlopeMs * d;
  const sweep = (servo.sweepMs * d) / Math.max(1, ratePct);
  return Math.round((travel ** 4 + sweep ** 4) ** 0.25);
}

export type ServoSettings = {
  /** EBB positions and rates, as sent with SC,4 / SC,5 / SC,11 / SC,12. */
  up: number;
  down: number;
  rateUp: number;
  rateDown: number;
  /** Wait after raising / lowering, ms. */
  raiseMs: number;
  lowerMs: number;
};

/** Servo commands and timings for a pair of pen heights. */
export function servoSettings(
  servo: ServoProfile,
  penPosUp = servo.penPosUp,
  penPosDown = servo.penPosDown,
): ServoSettings {
  const dist = penPosUp - penPosDown;
  return {
    up: servoPosition(servo, penPosUp),
    down: servoPosition(servo, penPosDown),
    rateUp: servoRate(servo, servo.rateRaise),
    rateDown: servoRate(servo, servo.rateLower),
    raiseMs: penMoveMs(servo, dist, servo.rateRaise),
    lowerMs: penMoveMs(servo, dist, servo.rateLower),
  };
}
