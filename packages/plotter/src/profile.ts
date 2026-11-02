import axidrawV3A3 from '../profiles/axidraw-v3-a3.json';

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

export const BUILTIN_PROFILES: readonly MachineProfile[] = [axidrawV3A3 as MachineProfile];

export const DEFAULT_PROFILE_ID = 'axidraw-v3-a3';

export const getProfile = (id: string): MachineProfile | undefined =>
  BUILTIN_PROFILES.find((p) => p.id === id);
