import {
  processDocument,
  toolpathStats,
  type OptimizeSettings,
  type PageSetup,
  type PipelineStep,
  type PlotDocument,
  type ProcessResult,
  type Toolpath,
  type ToolpathStats,
} from '@plotter-studio/core';
import {
  planToolpath,
  type LayerMotionSettings,
  type MachineProfile,
  type Plan,
} from '@plotter-studio/plotter';

/** Everything the pipeline needs. Plain data, so it can be sent to a worker. */
export type PipelineInput = {
  /** The document with the user's layer overrides already applied. */
  doc: PlotDocument;
  page: PageSetup;
  optimize: OptimizeSettings;
  transforms: PipelineStep[];
  profile: MachineProfile;
  penHeights: { up: number; down: number };
};

/**
 * PREVIEW-4: when each path is drawn, from the motion plan, for playback. Entry i is the i-th path
 * drawn (plot order); times in ms from the start of the plot.
 */
export type Timeline = {
  totalMs: number;
  layer: Int32Array;
  path: Int32Array;
  start: Float64Array;
  end: Float64Array;
};

export type Processed = ProcessResult & {
  stats: ToolpathStats;
  statsBefore: ToolpathStats;
  timeline: Timeline;
};

/** Draw start / end time of every path in the plan, in plot order. */
function timelineOf(plan: Plan): Timeline {
  const layer: number[] = [];
  const path: number[] = [];
  const start: number[] = [];
  const end: number[] = [];
  let t = 0;
  for (const it of plan.items) {
    if (it.kind === 'servo') continue;
    if (it.kind === 'pen') {
      t += it.ms;
      // Pen down: the path's drawing starts now (a dot ends right away, at the pen up).
      if (it.down) {
        layer.push(it.layerIndex);
        path.push(it.pathIndex);
        start.push(t);
        end.push(t);
      }
      continue;
    }
    t += it.ms;
    if (it.penDown) end[end.length - 1] = t;
  }
  return {
    totalMs: plan.totalMs,
    layer: Int32Array.from(layer),
    path: Int32Array.from(path),
    start: Float64Array.from(start),
    end: Float64Array.from(end),
  };
}

/**
 * Distances from the toolpath, times from the motion planner (MOTION-2): the same plan the
 * plotter will run, so the estimate matches the plot.
 */
function statsWithPlan(
  tp: Toolpath,
  profile: MachineProfile,
  settings: (id: string) => LayerMotionSettings,
): { stats: ToolpathStats; plan: Plan } {
  const stats = toolpathStats(tp);
  const plan = planToolpath(tp, profile, settings);
  for (const l of plan.layers) {
    const s = stats.layers.get(l.layerId);
    if (s) s.estimatedTime = l.ms / 1000;
  }
  stats.total.estimatedTime = plan.totalMs / 1000;
  return { stats, plan };
}

/** The whole pipeline: place, fill, repeat, clip, optimize, and stats with the plan's times. */
export function computeProcessed(input: PipelineInput): Processed {
  const profile = input.profile;
  const result = processDocument({
    doc: input.doc,
    page: input.page,
    bed: profile.bed,
    optimize: input.optimize,
    transforms: input.transforms,
  });
  // From the processed layers, so pass layers (made by the pipeline) are included.
  const byId = new Map(result.clipped.layers.map((l) => [l.id, l.settings]));
  const settings = (id: string): LayerMotionSettings => {
    const s = byId.get(id);
    return {
      speedPenDown: s?.speedPenDown ?? 25,
      speedPenUp: s?.speedPenUp ?? 75,
      // The plot uses the machine's pen heights for every layer, so the estimate does too.
      penPosUp: input.penHeights.up,
      penPosDown: input.penHeights.down,
    };
  };
  const { stats, plan } = statsWithPlan(result.toolpath, profile, settings);
  const { stats: statsBefore } = statsWithPlan(result.unoptimized, profile, settings);
  return { ...result, stats, statsBefore, timeline: timelineOf(plan) };
}
