import type { LayerMotionSettings } from '@plotter-studio/plotter';
import type { ActionResult, ManualCommand } from '@shared/ipc';
import type { Processed } from './useProcessed';
import { useStore } from '../store';

/** Runs a plotter action and records its error (if any) for the UI. */
async function run(p: Promise<ActionResult>): Promise<boolean> {
  const r = await p;
  useStore.setState({ plotterError: r.ok ? null : r.error });
  return r.ok;
}

/** Listens for status pushes from the main process. Call once at startup. */
export function subscribePlotter(): () => void {
  void window.api.invoke('plotter:status').then((plotter) => useStore.setState({ plotter }));
  return window.api.on('plotter:changed', (plotter) => useStore.setState({ plotter }));
}

export const listPorts = () => window.api.invoke('plotter:listPorts');

export async function connect(port: string) {
  const { profileId, penHeights } = useStore.getState();
  const ok = await run(window.api.invoke('plotter:connect', port, profileId));
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

export function startPlot(processed: Processed) {
  const { plotSkip, penHeights, profileId } = useStore.getState();
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
  return run(window.api.invoke('plot:start', { profileId, toolpath: { layers }, settings }));
}
