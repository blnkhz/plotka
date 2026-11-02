import { useState } from 'react';
import { canContinue, continuePlot } from '../lib/plotter';
import { useStore } from '../store';
import { NumberField, Row } from './controls';
import styles from './PlotSection.module.css';

/**
 * PLOT-5: after a plot was stopped (pen ran dry, paper moved…), continue it from the path where
 * it stopped, starting a little before the stop point so there's no gap, or from any other path.
 */
export function ContinueSection({ layerName }: { layerName: (id: string) => string }) {
  const checkpoint = useStore((s) => s.checkpoint);
  const connected = useStore((s) => s.plotter?.connection.connected ?? false);
  const [path, setPath] = useState<number | null>(null);
  const [backup, setBackup] = useState(1);
  if (!checkpoint || !canContinue()) return null;

  const stopPath = checkpoint.pathIndex + 1;
  const chosen = path ?? stopPath;
  const midPath = chosen === stopPath && checkpoint.offset > 0;
  const offset = midPath ? Math.max(0, checkpoint.offset - backup) : 0;

  return (
    <div className={styles.continue}>
      <p className={styles.note}>
        Stopped at path {stopPath} of {checkpoint.pathCount} in {layerName(checkpoint.layerId)}
        {checkpoint.offset > 0 ? `, ${checkpoint.offset.toFixed(1)} mm along it` : ''}.
      </p>
      <Row label="From path">
        <NumberField
          value={chosen}
          min={1}
          max={checkpoint.pathCount}
          step={1}
          onChange={(v) => setPath(Math.round(v))}
          title="Continue from this path (paths before it are skipped)"
        />
        <span className={styles.muted}>of {checkpoint.pathCount}</span>
      </Row>
      {midPath && (
        <Row label="Back up">
          <NumberField
            value={backup}
            min={0}
            max={50}
            step={0.5}
            suffix="mm"
            onChange={setBackup}
            title="Start this far before where it stopped, so the line has no gap"
          />
        </Row>
      )}
      <div className={styles.buttons}>
        <button
          className={styles.primary}
          disabled={!connected}
          onClick={() =>
            void continuePlot({ layerId: checkpoint.layerId, pathIndex: chosen - 1, offset })
          }
        >
          Continue plot
        </button>
        <button onClick={() => useStore.setState({ checkpoint: null })}>Forget</button>
      </div>
    </div>
  );
}
