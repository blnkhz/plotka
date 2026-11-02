import { fmtDuration } from '../lib/format';
import { control, plotLayers, startPlot } from '../lib/plotter';
import { useProcessed } from '../lib/useProcessed';
import { useStore } from '../store';
import { Notice, Section } from './controls';
import styles from './PlotSection.module.css';

const STATE_LABEL: Record<string, string> = {
  ready: 'Starting…',
  running: 'Plotting',
  pausing: 'Pausing after this move…',
  paused: 'Paused',
  stopping: 'Stopping…',
  stopped: 'Stopped',
  done: 'Done',
  error: 'Interrupted',
};

/** PLOT-1 to PLOT-3: choose layers, start / pause / resume / stop, and live progress. */
export function PlotSection() {
  const processed = useProcessed();
  const status = useStore((s) => s.plotter);
  const error = useStore((s) => s.plotterError);
  const skip = useStore((s) => s.plotSkip);
  const toggle = useStore((s) => s.togglePlotLayer);
  const setTab = useStore((s) => s.setTab);

  const connected = status?.connection.connected ?? false;
  const plot = status?.plot ?? null;
  const state = plot?.state;
  const active =
    state === 'running' ||
    state === 'pausing' ||
    state === 'paused' ||
    state === 'stopping' ||
    state === 'error';
  const names = new Map(processed?.clipped.layers.map((l) => [l.id, l]) ?? []);
  const candidates = processed?.toolpath.layers.filter((l) => l.paths.length > 0) ?? [];
  const chosen = processed ? plotLayers(processed, skip) : [];
  const blocked = !processed || processed.paperExceedsBed || chosen.length === 0;
  const pct = plot && plot.totalMs > 0 ? Math.min(100, (plot.doneMs / plot.totalMs) * 100) : 0;

  return (
    <Section title="Plot">
      {!connected && !active && (
        <p className={styles.muted}>
          Connect the plotter in the{' '}
          <button className={styles.link} onClick={() => setTab('machine')}>
            Machine
          </button>{' '}
          tab to plot.
        </p>
      )}
      {candidates.length > 0 && (
        <fieldset className={styles.layers} disabled={active}>
          <legend>Layers, in order</legend>
          {candidates.map((l) => {
            const layer = names.get(l.layerId);
            return (
              <label key={l.layerId} className={styles.layer}>
                <input
                  type="checkbox"
                  checked={!skip[l.layerId]}
                  onChange={() => toggle(l.layerId)}
                />
                <span className={styles.swatch} style={{ background: layer?.color }} />
                {layer?.name ?? l.layerId}
              </label>
            );
          })}
        </fieldset>
      )}

      {connected && !active && status?.machine && !status.machine.motorsOn && (
        <p className={styles.note}>
          Before starting: slide the carriage by hand to the top-left corner of the paper. The plot
          is drawn from there.
        </p>
      )}

      {plot && state !== 'ready' && (
        <div className={styles.progress} aria-label="Plot progress">
          <div className={styles.status}>
            <strong>{STATE_LABEL[state ?? ''] ?? state}</strong>
            {plot.layerId && state !== 'done' && state !== 'stopped' && (
              <span className={styles.muted}>{names.get(plot.layerId)?.name ?? plot.layerId}</span>
            )}
          </div>
          <div
            className={styles.bar}
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div style={{ width: `${pct}%` }} />
          </div>
          <div className={styles.times}>
            <span>{fmtDuration(plot.elapsedMs / 1000)} elapsed</span>
            {state !== 'done' && state !== 'stopped' && (
              <span>≈ {fmtDuration(Math.max(0, plot.totalMs - plot.doneMs) / 1000)} left</span>
            )}
          </div>
        </div>
      )}
      {state === 'error' && plot?.message && <Notice kind="error">{plot.message}</Notice>}
      {error && !active && <Notice kind="error">{error}</Notice>}

      <div className={styles.buttons}>
        {!active && (
          <button
            className={styles.primary}
            disabled={!connected || blocked}
            onClick={() => processed && void startPlot(processed)}
            title={
              processed?.paperExceedsBed
                ? 'The paper is larger than the machine can reach'
                : chosen.length === 0
                  ? 'Nothing selected to plot'
                  : undefined
            }
          >
            Start plot
          </button>
        )}
        {state === 'running' && (
          <button
            onClick={() => void control('pause')}
            title="Pause (Space, or the button on the plotter)"
          >
            Pause
          </button>
        )}
        {(state === 'paused' || state === 'error') && (
          <button
            className={styles.primary}
            disabled={!connected}
            onClick={() => void control('resume')}
            title="Resume (Space, or the button on the plotter)"
          >
            Resume
          </button>
        )}
        {active && (
          <button
            disabled={state === 'stopping'}
            onClick={() => void control('stop')}
            title="Raise the pen and go home"
          >
            Stop
          </button>
        )}
      </div>
      {state === 'paused' && (
        <p className={styles.muted}>
          You can swap or fix the pen, or jog in the Machine tab. Resume goes back to the same spot.
        </p>
      )}
    </Section>
  );
}
