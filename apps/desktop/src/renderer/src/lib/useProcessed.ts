import { getProfile, type MachineProfile } from '@plotter-studio/plotter';
import { useStore } from '../store';
import type { Processed } from './pipeline';

export type { Processed } from './pipeline';

export function useProfile(): MachineProfile {
  const profileId = useStore((s) => s.profileId);
  return getProfile(profileId)!;
}

/**
 * The processed document (placed, filled, clipped, optimized, with stats). Computed once per
 * change in a background worker (lib/pipelineRunner.ts); this just reads the latest result.
 */
export function useProcessed(): Processed | null {
  return useStore((s) => s.processed);
}

/** True while a newer result is being computed (the current one is still shown). */
export function useProcessing(): boolean {
  return useStore((s) => s.processing);
}
