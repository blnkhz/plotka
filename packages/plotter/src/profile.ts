import axidrawV3A3 from '../profiles/axidraw-v3-a3.json';

export type MachineProfile = {
  id: string;
  name: string;
  /** False until someone has plotted with this profile and confirmed the values. */
  tested: boolean;
  /** Usable pen travel in mm. Home (0, 0) is the top-left corner. */
  bed: { width: number; height: number };
  motion: {
    /** mm/s at 100% speed. */
    maxSpeedPenDown: number;
    maxSpeedPenUp: number;
    /** mm/s² */
    acceleration: number;
    /** Seconds per pen raise or lower. */
    penLiftDelay: number;
  };
  /** Default pen heights, 0..100. */
  servo: { penPosUp: number; penPosDown: number };
  /** Sections whose values aren't verified yet. */
  provisional?: string[];
  notes?: string;
};

export const BUILTIN_PROFILES: readonly MachineProfile[] = [axidrawV3A3 as MachineProfile];

export const DEFAULT_PROFILE_ID = 'axidraw-v3-a3';

export const getProfile = (id: string): MachineProfile | undefined =>
  BUILTIN_PROFILES.find((p) => p.id === id);
