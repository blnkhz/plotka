import { useMemo } from 'react';
import {
  processDocument,
  toolpathStats,
  type ProcessResult,
  type ToolpathStats,
} from '@plotter-studio/core';
import { getProfile, type MachineProfile } from '@plotter-studio/plotter';
import { applyOverrides, useStore } from '../store';

export type Processed = ProcessResult & { stats: ToolpathStats };

export function useProfile(): MachineProfile {
  const profileId = useStore((s) => s.profileId);
  return getProfile(profileId)!;
}

/** Runs the pipeline on the current document. Memoized on its inputs. */
export function useProcessed(): Processed | null {
  const doc = useStore((s) => s.doc);
  const overrides = useStore((s) => s.layerOverrides);
  const page = useStore((s) => s.page);
  const profile = useProfile();

  return useMemo(() => {
    if (!doc) return null;
    const effective = applyOverrides(doc, overrides);
    const result = processDocument({ doc: effective, page, bed: profile.bed });
    const byId = new Map(effective.layers.map((l) => [l.id, l.settings]));
    const stats = toolpathStats(result.toolpath, profile.motion, (id) => {
      const s = byId.get(id);
      return { penDown: s?.speedPenDown ?? 25, penUp: s?.speedPenUp ?? 75 };
    });
    return { ...result, stats };
  }, [doc, overrides, page, profile]);
}
