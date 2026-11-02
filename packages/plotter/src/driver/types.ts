import type { MotionSegment } from '../ebb';
import type { ServoSettings } from '../servo';

export type DeviceInfo = {
  port: string;
  /** Version line from `V`, e.g. "EBBv13_and_above EB Firmware Version 2.8.1". */
  firmware: string;
  /** Parsed "2.8.1", if recognized. */
  firmwareVersion?: string;
};

export type DriverErrorCode =
  'not-connected' | 'disconnected' | 'timeout' | 'port-busy' | 'protocol' | 'invalid-command';

export class DriverError extends Error {
  constructor(
    readonly code: DriverErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DriverError';
  }
}

/**
 * What the app needs from a plotter. The EBB serial driver and the simulator implement it.
 * Differs from the spec sketch in two places: pen moves take the servo wait from the plan, and
 * `move` takes pre-planned step segments (see motion/plan.ts).
 */
export interface PlotterDriver {
  connect(portPath: string): Promise<DeviceInfo>;
  disconnect(): Promise<void>;
  readonly connected: boolean;
  /** Raise / lower the pen, then wait `ms` before the next queued command. */
  penUp(ms: number): Promise<void>;
  penDown(ms: number): Promise<void>;
  /** Pen heights and speeds, in EBB units (see servo.ts). Takes effect on the next pen move. */
  setServo(servo: Pick<ServoSettings, 'up' | 'down' | 'rateUp' | 'rateDown'>): Promise<void>;
  enableMotors(resolution: '16x' | '8x'): Promise<void>;
  /** Motors off, so the carriage can be moved by hand. Loses the position. */
  disableMotors(): Promise<void>;
  /** Queues pre-planned moves. Resolves once the last one is queued, not finished. */
  move(segments: MotionSegment[]): Promise<void>;
  /** Pen up, travel back to (0, 0). */
  home(): Promise<void>;
  /** True if the physical button was pressed since the last query. */
  queryButton(): Promise<boolean>;
  /** Motor step counters (motor 1, motor 2). X = (a + b) / 2, Y = (a − b) / 2. */
  queryPosition(): Promise<{ a: number; b: number }>;
  /** Resolves when all queued motion has finished. */
  waitIdle(): Promise<void>;
}
