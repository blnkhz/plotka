import { useMemo } from 'react';
import {
  processDocument,
  toolpathStats,
  type ProcessResult,
  type Toolpath,
  type ToolpathStats,
} from '@plotter-studio/core';
import {
  getProfile,
  planToolpath,
  type LayerMotionSettings,
  type MachineProfile,
} from '@plotter-studio/plotter';
import { applyOverrides, useStore } from '../store';

export type Processed = ProcessResult & { stats: ToolpathStats; statsBefore: ToolpathStats };

export function useProfile(): MachineProfile {
  const profileId = useStore((s) => s.profileId);
  return getProfile(profileId)!;
}

/**
 * Distances from the toolpath, times from the motion planner (MOTION-2): the same plan the
 * plotter will run, so the estimate matches the plot.
 */
function statsWithPlan(
  tp: Toolpath,
  profile: MachineProfile,
  settings: (id: string) => LayerMotionSettings,
): ToolpathStats {
  const stats = toolpathStats(tp);
  const plan = planToolpath(tp, profile, settings);
  for (const l of plan.layers) {
    const s = stats.layers.get(l.layerId);
    if (s) s.estimatedTime = l.ms / 1000;
  }
  stats.total.estimatedTime = plan.totalMs / 1000;
  return stats;
}

/** Runs the pipeline on the current document. Memoized on its inputs. */
export function useProcessed(): Processed | null {
  const doc = useStore((s) => s.doc);
  const overrides = useStore((s) => s.layerOverrides);
  const page = useStore((s) => s.page);
  const optimize = useStore((s) => s.optimize);
  const transforms = useStore((s) => s.pipeline);
  const penHeights = useStore((s) => s.penHeights);
  const profile = useProfile();

  return useMemo(() => {
    if (!doc) return null;
    const effective = applyOverrides(doc, overrides);
    const result = processDocument({
      doc: effective,
      page,
      bed: profile.bed,
      optimize,
      transforms,
    });
    // From the processed layers, so pass layers (made by the pipeline) are included.
    const byId = new Map(result.clipped.layers.map((l) => [l.id, l.settings]));
    const settings = (id: string): LayerMotionSettings => {
      const s = byId.get(id);
      return {
        speedPenDown: s?.speedPenDown ?? 25,
        speedPenUp: s?.speedPenUp ?? 75,
        // The plot uses the machine's pen heights for every layer, so the estimate does too.
        penPosUp: penHeights.up,
        penPosDown: penHeights.down,
      };
    };
    const stats = statsWithPlan(result.toolpath, profile, settings);
    const statsBefore = statsWithPlan(result.unoptimized, profile, settings);
    return { ...result, stats, statsBefore };
  }, [doc, overrides, page, optimize, profile, transforms, penHeights]);
}
