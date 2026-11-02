/**
 * EBB command encoders (legacy reply syntax, firmware 2.x and 3.x). Shared by the simulator's
 * command log and the serial driver. See docs/hardware-notes.md for the protocol notes.
 */

/** One pre-planned motion command: duration and step deltas on the X / Y step axes. */
export type MotionSegment = {
  /** Duration in whole ms, ≥ 1. */
  ms: number;
  /** Steps along X and Y. Motor 1 moves x + y, motor 2 moves x − y (mixed-axis). */
  x: number;
  y: number;
};

export const ebb = {
  version: () => 'V',
  /** Motors: 1 = 16x microstepping, 2 = 8x, 0 = off. */
  enableMotors: (mode: 0 | 1 | 2) => `EM,${mode},${mode}`,
  move: (s: MotionSegment) => `XM,${s.ms},${s.x},${s.y}`,
  /**
   * Pen up (1) or down (0); `ms` delays the next queued command. `pin` picks the port B pin of
   * the servo (sent only when it isn't the default, 1).
   */
  pen: (up: boolean, ms: number, pin?: number) =>
    `SP,${up ? 1 : 0},${Math.min(65535, Math.max(1, Math.round(ms)))}${pin !== undefined && pin !== 1 ? `,${pin}` : ''}`,
  servoUp: (v: number) => `SC,4,${v}`,
  servoDown: (v: number) => `SC,5,${v}`,
  servoRateUp: (v: number) => `SC,11,${v}`,
  servoRateDown: (v: number) => `SC,12,${v}`,
  queryGeneral: () => 'QG',
  querySteps: () => 'QS',
  stop: () => 'ES',
} as const;

/** Motor steps from X/Y steps. */
export const toMotors = (x: number, y: number) => ({ a: x + y, b: x - y });
/** X/Y steps from motor steps. */
export const fromMotors = (a: number, b: number) => ({ x: (a + b) / 2, y: (a - b) / 2 });
