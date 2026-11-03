import type { PathStats } from '@plotka/core';
import { fmtDistance, fmtDuration } from '../lib/format';
import { useProcessed } from '../lib/useProcessed';
import styles from './StatsTable.module.css';

export function StatsTable() {
  const processed = useProcessed();
  if (!processed) return null;
  // Processed layers include the pass layers the pipeline makes.
  const names = new Map(processed.clipped.layers.map((l) => [l.id, l]));
  const rows: [string, string, PathStats][] = [...processed.stats.layers].map(([id, s]) => [
    id,
    names.get(id)?.name ?? id,
    s,
  ]);
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th></th>
          <th title="Pen-down distance">Draw</th>
          <th title="Pen-up travel distance">Travel</th>
          <th title="Pen lifts">Lifts</th>
          <th title="Estimated time">Time</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([id, name, s]) => (
          <tr key={id}>
            <td className={styles.name}>
              <span className={styles.swatch} style={{ background: names.get(id)?.color }} />
              {name}
            </td>
            <StatCells s={s} />
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <StatCells s={processed.stats.total} />
        </tr>
      </tfoot>
    </table>
  );
}

function StatCells({ s }: { s: PathStats }) {
  return (
    <>
      <td>{fmtDistance(s.penDownDistance)}</td>
      <td>{fmtDistance(s.travelDistance)}</td>
      <td>{s.penLifts}</td>
      <td>{fmtDuration(s.estimatedTime)}</td>
    </>
  );
}
