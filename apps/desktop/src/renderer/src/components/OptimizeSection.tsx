import { fmtDistance, fmtDuration } from '../lib/format';
import { useProcessed } from '../lib/useProcessed';
import { useStore } from '../store';
import { NumberField, Row, Section } from './controls';
import styles from './OptimizeSection.module.css';

export function OptimizeSection() {
  const optimize = useStore((s) => s.optimize);
  const setOptimize = useStore((s) => s.setOptimize);
  const processed = useProcessed();

  return (
    <Section title="Optimize" help="optimizing">
      <Row label="">
        <label
          className={styles.check}
          title="Join paths whose ends touch, so the pen doesn't lift"
        >
          <input
            type="checkbox"
            checked={optimize.merge}
            onChange={(e) => setOptimize({ merge: e.target.checked })}
          />
          Join touching paths
        </label>
      </Row>
      {optimize.merge && (
        <Row label="Within">
          <NumberField
            value={optimize.mergeTolerance}
            min={0.001}
            max={5}
            step={0.05}
            digits={3}
            suffix="mm"
            onChange={(mergeTolerance) => setOptimize({ mergeTolerance })}
          />
        </Row>
      )}
      <Row label="">
        <label className={styles.check} title="Reorder and reverse paths to cut pen-up travel">
          <input
            type="checkbox"
            checked={optimize.order}
            onChange={(e) => setOptimize({ order: e.target.checked })}
          />
          Reorder to cut travel
        </label>
      </Row>
      {optimize.order && (
        <Row label="">
          <label className={styles.check} title="A second pass that untangles the order a bit more">
            <input
              type="checkbox"
              checked={optimize.twoOpt}
              onChange={(e) => setOptimize({ twoOpt: e.target.checked })}
            />
            Extra pass
          </label>
        </Row>
      )}
      <Row label="">
        <label
          className={styles.check}
          title="Skip line segments the pen has already drawn in the layer, so they don't soak the paper"
        >
          <input
            type="checkbox"
            checked={optimize.dedupe}
            onChange={(e) => setOptimize({ dedupe: e.target.checked })}
          />
          Remove lines drawn twice
        </label>
      </Row>
      <Row label="">
        <label
          className={styles.check}
          title="Drop detail smaller than 0.01 mm (less than one motor step) and paths shorter than 0.05 mm. Dots are kept."
        >
          <input
            type="checkbox"
            checked={optimize.simplify}
            onChange={(e) => setOptimize({ simplify: e.target.checked })}
          />
          Simplify tiny details
        </label>
      </Row>
      <Row label="">
        <label
          className={styles.check}
          title="Begin each closed shape at its corner closest to where the pen is"
        >
          <input
            type="checkbox"
            checked={optimize.closedStart}
            onChange={(e) => setOptimize({ closedStart: e.target.checked })}
          />
          Start shapes nearest the pen
        </label>
      </Row>
      {processed && (
        <table className={styles.compare}>
          <thead>
            <tr>
              <th></th>
              <th>File order</th>
              <th>Optimized</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Travel</td>
              <td>{fmtDistance(processed.statsBefore.total.travelDistance)}</td>
              <td>{fmtDistance(processed.stats.total.travelDistance)}</td>
            </tr>
            <tr>
              <td>Pen lifts</td>
              <td>{processed.statsBefore.total.penLifts}</td>
              <td>{processed.stats.total.penLifts}</td>
            </tr>
            <tr>
              <td>Time</td>
              <td>{fmtDuration(processed.statsBefore.total.estimatedTime)}</td>
              <td>{fmtDuration(processed.stats.total.estimatedTime)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </Section>
  );
}
