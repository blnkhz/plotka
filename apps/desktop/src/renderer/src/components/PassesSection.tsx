import {
  DEFAULT_PASS_COLORS,
  defaultPassSettings,
  MAX_PASSES,
  type Layer,
  type PassSettings,
} from '@plotter-studio/core';
import { currentLayerSettings, useStore } from '../store';
import { NumberField, Row, Section } from './controls';
import styles from './FillTab.module.css';

/** Repeat the layer with slight shifts, one pen color per pass. */
export function PassesSection({ layer }: { layer: Layer }) {
  const setLayer = useStore((s) => s.setLayer);
  const passes = layer.settings.passes;
  const on = !!passes && passes.count >= 2;
  const set = (patch: Partial<PassSettings>) => {
    const cur = currentLayerSettings(layer.id)?.passes ?? null;
    setLayer(layer.id, { settings: { passes: { ...(cur ?? defaultPassSettings()), ...patch } } });
  };

  return (
    <Section title="Passes" help="passes">
      <Row label="">
        <label
          className={styles.check}
          title="Plot this layer several times, each pass shifted or turned slightly, usually with a different pen. Overlapping inks mix and make moiré patterns."
        >
          <input
            type="checkbox"
            checked={on}
            // Turning off keeps the other settings (count 1), so turning back on restores them.
            onChange={(e) => set({ count: e.target.checked ? defaultPassSettings().count : 1 })}
          />
          Repeat with slight shifts
        </label>
      </Row>
      {on && passes && (
        <>
          <Row label="Passes">
            <NumberField
              value={passes.count}
              min={2}
              max={MAX_PASSES}
              step={1}
              onChange={(count) => set({ count: Math.round(count) })}
            />
          </Row>
          <Row label="Shift X">
            <NumberField
              value={passes.offsetX}
              min={-20}
              max={20}
              step={0.05}
              suffix="mm"
              onChange={(offsetX) => set({ offsetX })}
              title="Horizontal shift between one pass and the next"
            />
          </Row>
          <Row label="Shift Y">
            <NumberField
              value={passes.offsetY}
              min={-20}
              max={20}
              step={0.05}
              suffix="mm"
              onChange={(offsetY) => set({ offsetY })}
              title="Vertical shift between one pass and the next"
            />
          </Row>
          <Row label="Turn">
            <NumberField
              value={passes.rotate}
              min={-45}
              max={45}
              step={0.05}
              suffix="°"
              onChange={(rotate) => set({ rotate })}
              title="Rotation between one pass and the next, around the layer's center. Small values make color gradients."
            />
          </Row>
          <Row label="Scale">
            <NumberField
              value={passes.scale}
              min={-20}
              max={20}
              step={0.1}
              suffix="%"
              onChange={(scale) => set({ scale })}
              title="Size change between one pass and the next, around the layer's center"
            />
          </Row>
          <Row label="Pens">
            <span className={styles.swatches}>
              {Array.from({ length: passes.count }, (_, k) => {
                const colors = passes.colors.length ? passes.colors : DEFAULT_PASS_COLORS;
                const value = colors[k % colors.length]!;
                return (
                  <input
                    key={k}
                    type="color"
                    value={value}
                    title={`Pen color for pass ${k + 1}`}
                    onChange={(e) => {
                      const next = Array.from(
                        { length: Math.max(passes.count, colors.length) },
                        (_, i) => colors[i % colors.length]!,
                      );
                      next[k] = e.target.value;
                      set({ colors: next });
                    }}
                  />
                );
              })}
            </span>
          </Row>
          <p className={styles.muted}>
            Each pass is plotted as its own layer, so you can change pens between them.
          </p>
        </>
      )}
    </Section>
  );
}
