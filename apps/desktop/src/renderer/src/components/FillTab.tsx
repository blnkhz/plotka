import { defaultFillSettings, type FillSettings, type FillType } from '@plotter-studio/core';
import { applyOverrides, useStore } from '../store';
import { Notice, NumberField, Row, Section } from './controls';
import styles from './FillTab.module.css';

const TYPES: { value: FillType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'lines', label: 'Lines' },
  { value: 'crosshatch', label: 'Crosshatch' },
  { value: 'zigzag', label: 'Zigzag' },
  { value: 'concentric', label: 'Concentric' },
  { value: 'spiral', label: 'Spiral' },
  { value: 'dots', label: 'Dots' },
];

/** Which controls apply to each fill type. */
const USES_ANGLE = new Set<FillType>(['lines', 'crosshatch', 'zigzag', 'spiral', 'dots']);
const USES_CONNECT = new Set<FillType>(['lines', 'crosshatch', 'concentric']);
const SPACING_LABEL: Partial<Record<FillType, string>> = {
  concentric: 'Ring spacing',
  spiral: 'Turn spacing',
  dots: 'Dot spacing',
};

export function FillTab() {
  const doc = useStore((s) => s.doc);
  const overrides = useStore((s) => s.layerOverrides);
  const selectedId = useStore((s) => s.selectedLayerId);
  const setLayer = useStore((s) => s.setLayer);
  if (!doc) return <Notice kind="info">No file open.</Notice>;
  const layers = applyOverrides(doc, overrides).layers;
  const layer = layers.find((l) => l.id === selectedId);
  if (!layer) return <Notice kind="info">Select a layer.</Notice>;

  const fill = layer.settings.fill;
  const drawable = layer.fills.filter((f) => !f.knockout).length;
  const knockouts = layer.fills.length - drawable;
  const type = fill?.type ?? 'none';
  const setFill = (patch: Partial<FillSettings>) =>
    setLayer(layer.id, { settings: { fill: { ...(fill ?? defaultFillSettings()), ...patch } } });

  return (
    <>
      <Section title={`Fill · ${layer.name}`}>
        {drawable === 0 && <p className={styles.muted}>This layer has no filled shapes.</p>}
        <Row label="Type">
          <select
            value={type}
            onChange={(e) => {
              const t = e.target.value as FillType;
              if (t === 'none') setLayer(layer.id, { settings: { fill: null } });
              else setFill({ type: t });
            }}
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Row>
        {fill && type !== 'none' && (
          <>
            <Row label={SPACING_LABEL[type] ?? 'Spacing'}>
              <NumberField
                value={fill.spacing}
                min={0.05}
                max={50}
                step={0.05}
                suffix="mm"
                onChange={(spacing) => setFill({ spacing })}
              />
              <span className={styles.muted} title="Per centimeter">
                {(10 / fill.spacing).toFixed(1)} /cm
              </span>
            </Row>
            {USES_ANGLE.has(type) && (
              <Row label={type === 'spiral' ? 'Start angle' : 'Angle'}>
                <NumberField
                  value={fill.angle}
                  min={-360}
                  max={360}
                  step={5}
                  suffix="°"
                  onChange={(angle) => setFill({ angle })}
                />
              </Row>
            )}
            {type === 'dots' && (
              <Row label="Jitter">
                <NumberField
                  value={Math.round((fill.jitter ?? 0) * 100)}
                  min={0}
                  max={100}
                  step={5}
                  suffix="%"
                  onChange={(j) => setFill({ jitter: j / 100 })}
                  title="Move each dot randomly by up to this share of the spacing"
                />
              </Row>
            )}
            {type === 'crosshatch' && (
              <Row label="Second angle">
                <NumberField
                  value={fill.crossAngle ?? fill.angle + 90}
                  min={-360}
                  max={450}
                  step={5}
                  suffix="°"
                  onChange={(crossAngle) => setFill({ crossAngle })}
                />
                {fill.crossAngle !== undefined && (
                  <button
                    onClick={() => setFill({ crossAngle: undefined })}
                    title="Back to angle + 90°"
                  >
                    Reset
                  </button>
                )}
              </Row>
            )}
            <Row label="Inset">
              <NumberField
                value={fill.inset}
                min={0}
                max={20}
                step={0.05}
                suffix="mm"
                onChange={(inset) => setFill({ inset })}
                title="Pull the fill in from the outline"
              />
            </Row>
            <Row label="">
              <label
                className={styles.check}
                title="Darker shapes get tighter spacing, lighter ones wider (up to 10×). Very light shapes are left empty."
              >
                <input
                  type="checkbox"
                  checked={!!fill.densityFromColor}
                  onChange={(e) => setFill({ densityFromColor: e.target.checked })}
                />
                Spacing from fill color
              </label>
            </Row>
            {USES_CONNECT.has(type) && (
              <Row label="">
                <label
                  className={styles.check}
                  title="Join neighboring lines without lifting the pen, where the join stays inside the shape"
                >
                  <input
                    type="checkbox"
                    checked={fill.connect}
                    onChange={(e) => setFill({ connect: e.target.checked })}
                  />
                  Keep pen down between lines
                </label>
              </Row>
            )}
          </>
        )}
        <Row label="">
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={layer.settings.drawOutline}
              onChange={(e) => setLayer(layer.id, { settings: { drawOutline: e.target.checked } })}
            />
            Draw outlines of filled shapes
          </label>
        </Row>
        <Row label="">
          <label
            className={styles.check}
            title="Shapes on top hide the parts of shapes under them, like in the file. White shapes hide what's under them without being drawn."
          >
            <input
              type="checkbox"
              checked={layer.settings.hideCovered ?? true}
              onChange={(e) => setLayer(layer.id, { settings: { hideCovered: e.target.checked } })}
            />
            Hide parts covered by shapes on top
          </label>
        </Row>
        {knockouts > 0 && (
          <p className={styles.muted}>
            {knockouts} white {knockouts === 1 ? 'shape is' : 'shapes are'} not drawn but hide
            what's under them.
          </p>
        )}
      </Section>
      {layers.length > 1 && (
        <Section title="All layers">
          <button
            onClick={() => {
              for (const l of layers)
                if (l.id !== layer.id)
                  setLayer(l.id, {
                    settings: {
                      fill: fill ? { ...fill } : null,
                      drawOutline: layer.settings.drawOutline,
                      hideCovered: layer.settings.hideCovered,
                    },
                  });
            }}
          >
            Use these fill settings on all layers
          </button>
        </Section>
      )}
    </>
  );
}
