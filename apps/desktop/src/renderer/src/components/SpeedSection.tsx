import type { Layer } from '@plotter-studio/core';
import { useProfile } from '../lib/useProcessed';
import { useStore } from '../store';
import { NumberField, Row, Section } from './controls';
import styles from './FillTab.module.css';

/** MOTION-3: drawing and moving speed for the selected layer, in % of the machine's maximum. */
export function SpeedSection({ layer }: { layer: Layer }) {
  const setLayer = useStore((s) => s.setLayer);
  const profile = useProfile();
  const { speedPenDown, speedPenUp } = layer.settings;
  const mm = (pct: number, max: number) => `${Math.round((max * pct) / 100)} mm/s`;
  return (
    <Section title="Speed" help="plotting#speed">
      <Row label="Drawing">
        <NumberField
          value={speedPenDown}
          min={1}
          max={100}
          step={5}
          suffix="%"
          onChange={(v) => setLayer(layer.id, { settings: { speedPenDown: Math.round(v) } })}
          title="Speed with the pen down. Slower gives darker, cleaner lines with thin or dry pens."
        />
        <span className={styles.muted}>{mm(speedPenDown, profile.motion.maxSpeedPenDown)}</span>
      </Row>
      <Row label="Moving">
        <NumberField
          value={speedPenUp}
          min={1}
          max={100}
          step={5}
          suffix="%"
          onChange={(v) => setLayer(layer.id, { settings: { speedPenUp: Math.round(v) } })}
          title="Speed with the pen up, between lines."
        />
        <span className={styles.muted}>{mm(speedPenUp, profile.motion.maxSpeedPenUp)}</span>
      </Row>
      {speedPenDown > 50 && (
        <p className={styles.muted}>
          Fast drawing can make thin pens skip. Try a small test first.
        </p>
      )}
    </Section>
  );
}
