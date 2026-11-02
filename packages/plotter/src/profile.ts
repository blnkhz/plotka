import axidrawMiniKit from '../profiles/axidraw-minikit.json';
import axidrawSeA1 from '../profiles/axidraw-se-a1.json';
import axidrawSeA2 from '../profiles/axidraw-se-a2.json';
import axidrawV3A3 from '../profiles/axidraw-v3-a3.json';
import axidrawV3A4 from '../profiles/axidraw-v3-a4.json';
import axidrawV3B6 from '../profiles/axidraw-v3-b6.json';
import axidrawV3Xlx from '../profiles/axidraw-v3-xlx.json';
import nextdraw1117 from '../profiles/nextdraw-1117.json';
import nextdraw2234 from '../profiles/nextdraw-2234.json';
import nextdraw8511 from '../profiles/nextdraw-8511.json';

export type ServoProfile = {
  /** Servo pulse range for 0% and 100%, in EBB units of 83.3 ns. */
  min: number;
  max: number;
  /** ms for a full 0–100% sweep at 100% rate. */
  sweepMs: number;
  /** Servo travel time: moveMinMs + moveSlopeMs per % of height change. */
  moveMinMs: number;
  moveSlopeMs: number;
  /** Raise / lower speed, % of full rate. */
  rateRaise: number;
  rateLower: number;
  /** Default pen heights, 0..100. Layers can override them. */
  penPosUp: number;
  penPosDown: number;
  /** EBB port B pin driving the pen-lift servo (SP's optional pin). Default 1 (RB1). */
  pin?: number;
};

export type MachineProfile = {
  id: string;
  name: string;
  /** False until someone has plotted with this profile and confirmed the values. */
  tested: boolean;
  /** Usable pen travel in mm. Home (0, 0) is the top-left corner. */
  bed: { width: number; height: number };
  /** Motor steps per mm at 16x microstepping. */
  stepsPerMm: number;
  /** Max steps per second on either motor. */
  maxStepRate: number;
  motion: {
    /** mm/s at 100% speed. */
    maxSpeedPenDown: number;
    maxSpeedPenUp: number;
    /** mm/s² */
    accelPenDown: number;
    accelPenUp: number;
  };
  servo: ServoProfile;
  /** Sections whose values aren't verified yet. */
  provisional?: string[];
  notes?: string;
};

/** Built-in profiles: the tested V3/A3 first, then the other models (untested). */
export const BUILTIN_PROFILES: readonly MachineProfile[] = [
  axidrawV3A3,
  axidrawV3A4,
  axidrawV3Xlx,
  axidrawV3B6,
  axidrawMiniKit,
  axidrawSeA2,
  axidrawSeA1,
  nextdraw8511,
  nextdraw1117,
  nextdraw2234,
] as MachineProfile[];

export const DEFAULT_PROFILE_ID = 'axidraw-v3-a3';

export const getProfile = (id: string): MachineProfile | undefined =>
  BUILTIN_PROFILES.find((p) => p.id === id);

export class ProfileError extends Error {}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Checks a profile from outside the app's own code (a user's edited copy, a saved file, IPC):
 * every value present, numeric, and in a sensible range. Throws ProfileError with a plain message.
 */
export function validateProfile(v: unknown): MachineProfile {
  if (!isObj(v)) throw new ProfileError('A machine profile must be an object.');
  const num = (o: unknown, key: string, min: number, max: number, label: string): number => {
    const x = isObj(o) ? o[key] : undefined;
    if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max)
      throw new ProfileError(`${label} must be a number from ${min} to ${max}.`);
    return x;
  };
  const str = (key: string, label: string, max = 80): string => {
    const x = v[key];
    if (typeof x !== 'string' || !x.trim() || x.length > max)
      throw new ProfileError(`${label} must be text (up to ${max} characters).`);
    return x;
  };
  const bed = v['bed'];
  const motion = v['motion'];
  const servo = v['servo'];
  const servoMin = num(servo, 'min', 1, 65535, 'Servo 0% position');
  const servoMax = num(servo, 'max', 1, 65535, 'Servo 100% position');
  if (servoMax <= servoMin) throw new ProfileError('Servo 100% must be above servo 0%.');
  const pin = isObj(servo) ? servo['pin'] : undefined;
  if (pin !== undefined && !(Number.isInteger(pin) && (pin as number) >= 0 && (pin as number) <= 7))
    throw new ProfileError('Servo pin must be a whole number from 0 to 7.');
  return {
    id: str('id', 'Profile id', 64),
    name: str('name', 'Profile name'),
    tested: v['tested'] === true,
    bed: {
      width: num(bed, 'width', 10, 5000, 'Travel X'),
      height: num(bed, 'height', 10, 5000, 'Travel Y'),
    },
    stepsPerMm: num(v, 'stepsPerMm', 1, 10000, 'Steps per mm'),
    maxStepRate: num(v, 'maxStepRate', 100, 25000, 'Max step rate'),
    motion: {
      maxSpeedPenDown: num(motion, 'maxSpeedPenDown', 1, 2000, 'Max drawing speed'),
      maxSpeedPenUp: num(motion, 'maxSpeedPenUp', 1, 2000, 'Max moving speed'),
      accelPenDown: num(motion, 'accelPenDown', 10, 100000, 'Drawing acceleration'),
      accelPenUp: num(motion, 'accelPenUp', 10, 100000, 'Moving acceleration'),
    },
    servo: {
      min: servoMin,
      max: servoMax,
      sweepMs: num(servo, 'sweepMs', 1, 5000, 'Servo sweep time'),
      moveMinMs: num(servo, 'moveMinMs', 0, 5000, 'Servo minimum move time'),
      moveSlopeMs: num(servo, 'moveSlopeMs', 0, 100, 'Servo time per %'),
      rateRaise: num(servo, 'rateRaise', 1, 100, 'Raise speed'),
      rateLower: num(servo, 'rateLower', 1, 100, 'Lower speed'),
      penPosUp: num(servo, 'penPosUp', 0, 100, 'Pen up height'),
      penPosDown: num(servo, 'penPosDown', 0, 100, 'Pen down height'),
      ...(pin === undefined ? {} : { pin: pin as number }),
    },
    ...(Array.isArray(v['provisional'])
      ? { provisional: v['provisional'].filter((x): x is string => typeof x === 'string') }
      : {}),
    ...(typeof v['notes'] === 'string' ? { notes: v['notes'].slice(0, 2000) } : {}),
  };
}
