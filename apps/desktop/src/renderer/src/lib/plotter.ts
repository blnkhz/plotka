import type { LayerMotionSettings } from '@plotter-studio/plotter';
import type { ActionResult, ManualCommand, PlotRequest, PlotterStatus } from '@shared/ipc';
import { distanceAlong, toolpathFrom, type ResumePoint } from '@plotter-studio/core';
import type { Processed } from './useProcessed';
import { resolveProfile, useStore } from '../store';

const currentProfile = () => {
  const { profileId, customProfiles } = useStore.getState();
  return resolveProfile(profileId, customProfiles);
};

/** Runs a plotter action and records its error (if any) for the UI. */
async function run(p: Promise<ActionResult>): Promise<boolean> {
  const r = await p;
  useStore.setState({ plotterError: r.ok ? null : r.error });
  return r.ok;
}

/** Listens for status pushes from the main process. Call once at startup. */
export function subscribePlotter(): () => void {
  void window.api.invoke('plotter:status').then((plotter) => useStore.setState({ plotter }));
  return window.api.on('plotter:changed', (plotter) => {
    noteCheckpoint(useStore.getState().plotter, plotter);
    useStore.setState({ plotter });
  });
}

// --- PLOT-5: where a stopped plot got to, and continuing from there ---

/** What the last plot was asked to draw, so it can be continued with the same paths. */
let lastPlot: PlotRequest | null = null;

/**
 * When a plot starts stopping (or fails), remember where the pen was: the path, and how far
 * along it the pen got if it was drawing. Stop then lifts the pen and goes home.
 */
function noteCheckpoint(prev: PlotterStatus | null, next: PlotterStatus) {
  const was = prev?.plot?.state;
  const p = next.plot;
  if (!p || !lastPlot || next.plotKind !== 'plot' || was === p.state) return;
  if (p.state !== 'stopping' && p.state !== 'error') return;
  if (p.state === 'stopping' && was !== 'running' && was !== 'pausing' && was !== 'paused') return;
  const layer = lastPlot.toolpath.layers.find((l) => l.layerId === p.layerId);
  if (!layer) return;
  const pathIndex = Math.max(0, p.pathIndex);
  const path = layer.paths[pathIndex];
  const offset = path && p.penDown && p.position ? distanceAlong(path, p.position) : 0;
  useStore.setState({
    checkpoint: { layerId: layer.layerId, pathIndex, offset, pathCount: layer.paths.length },
  });
}

/** Continues the last plot from a path (and offset along it), with the same settings. */
export function continuePlot(from: ResumePoint) {
  if (!lastPlot) return Promise.resolve(false);
  const req = { ...lastPlot, toolpath: toolpathFrom(lastPlot.toolpath, from) };
  useStore.setState({ checkpoint: null });
  return run(window.api.invoke('plot:start', req));
}

export const canContinue = () => lastPlot !== null;

export const listPorts = () => window.api.invoke('plotter:listPorts');

export async function connect(port: string) {
  const { penHeights } = useStore.getState();
  const ok = await run(window.api.invoke('plotter:connect', port, currentProfile()));
  // Send the saved pen heights right away so the first pen move uses them.
  if (ok) await command({ kind: 'penHeights', up: penHeights.up, down: penHeights.down });
  return ok;
}

export const disconnect = () => run(window.api.invoke('plotter:disconnect'));
export const command = (cmd: ManualCommand) => run(window.api.invoke('plotter:command', cmd));
export const control = (action: 'pause' | 'resume' | 'stop' | 'toggle') =>
  run(window.api.invoke('plot:control', action));

/** The layers that will be plotted: in order, with paths, not unticked (PLOT-3). */
export function plotLayers(processed: Processed, skip: Record<string, true>) {
  return processed.toolpath.layers.filter((l) => l.paths.length > 0 && !skip[l.layerId]);
}

/** PLOT-6: trace the bounds of the layers that would be plotted, with the pen up. */
export function dryRun(processed: Processed) {
  const { plotSkip } = useStore.getState();
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const l of plotLayers(processed, plotSkip))
    for (const p of l.paths)
      for (const q of p.points) {
        b.minX = Math.min(b.minX, q.x);
        b.minY = Math.min(b.minY, q.y);
        b.maxX = Math.max(b.maxX, q.x);
        b.maxY = Math.max(b.maxY, q.y);
      }
  return run(window.api.invoke('plot:dryRun', currentProfile(), b));
}

export function startPlot(processed: Processed) {
  const { plotSkip, penHeights } = useStore.getState();
  const layers = plotLayers(processed, plotSkip);
  const byId = new Map(processed.clipped.layers.map((l) => [l.id, l.settings]));
  const settings: Record<string, LayerMotionSettings> = {};
  for (const l of layers) {
    const s = byId.get(l.layerId);
    settings[l.layerId] = {
      speedPenDown: s?.speedPenDown ?? 25,
      speedPenUp: s?.speedPenUp ?? 75,
      penPosUp: penHeights.up,
      penPosDown: penHeights.down,
    };
  }
  lastPlot = { profile: currentProfile(), toolpath: { layers }, settings };
  useStore.setState({ checkpoint: null });
  return run(window.api.invoke('plot:start', lastPlot));
}
