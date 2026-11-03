import {
  maxWavyAmplitude,
  WAVY_DEFAULTS,
  type FillSettings,
  type FillType,
} from '@plotter-studio/core';
import { applyOverrides, currentLayerSettings, useStore } from '../store';
import { Notice, NumberField, Row, Section } from './controls';
import { PassesSection } from './PassesSection';
import { SpeedSection } from './SpeedSection';
import styles from './FillTab.module.css';

const TYPES: { value: FillType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'lines', label: 'Lines' },
  { value: 'crosshatch', label: 'Crosshatch' },
  { value: 'waves', label: 'Waves' },
  { value: 'noise', label: 'Noise' },
  { value: 'concentric', label: 'Concentric' },
  { value: 'spiral', label: 'Spiral' },
  { value: 'dots', label: 'Dots' },
];

/** Which controls apply to each fill type. */
const USES_ANGLE = new Set<FillType>(['lines', 'crosshatch', 'waves', 'noise', 'spiral', 'dots']);
const USES_CONNECT = new Set<FillType>(['lines', 'crosshatch', 'waves', 'noise', 'concentric']);
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
  const defaultFill = useStore((s) => s.defaultFill);
  const setDefaultFill = useStore((s) => s.setDefaultFill);
  const placing = useStore(
    (s) => s.adjustSpiralId !== null && s.adjustSpiralId === s.selectedLayerId,
  );
  const setAdjustSpiral = useStore((s) => s.setAdjustSpiral);
  if (!doc) return <Notice kind="info">No file open.</Notice>;
  const layers = applyOverrides(doc, overrides).layers;
  const layer = layers.find((l) => l.id === selectedId);
  if (!layer) return <Notice kind="info">Select a layer.</Notice>;

  const fill = layer.settings.fill;
  const drawable = layer.fills.filter((f) => !f.knockout).length;
  const knockouts = layer.fills.length - drawable;
  const type = fill?.type ?? 'none';
  const setFill = (patch: Partial<FillSettings>) => {
    const cur = currentLayerSettings(layer.id)?.fill ?? null;
    const base = cur ?? useStore.getState().defaultFill;
    setLayer(layer.id, { settings: { fill: { ...base, ...patch } } });
  };

  return (
    <>
      <Section title={`Fill · ${layer.name}`} help="fills">
        {drawable === 0 && <p className={styles.muted}>This layer has no filled shapes.</p>}
        <Row label="Type">
          <select
            aria-label="Fill type"
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
            {type === 'spiral' && (
              <>
                <Row label="Center X / Y">
                  <NumberField
                    value={fill.centerX ?? 0}
                    min={-1000}
                    max={1000}
                    step={1}
                    width={52}
                    title="Move where the spiral starts, in mm from the shape's center (right is +)"
                    onChange={(centerX) => setFill({ centerX })}
                  />
                  <NumberField
                    value={fill.centerY ?? 0}
                    min={-1000}
                    max={1000}
                    step={1}
                    width={52}
                    suffix="mm"
                    title="Down is +"
                    onChange={(centerY) => setFill({ centerY })}
                  />
                  {fill.centerX || fill.centerY ? (
                    <button
                      onClick={() => setFill({ centerX: undefined, centerY: undefined })}
                      title="Back to the shape's center"
                    >
                      Reset
                    </button>
                  ) : null}
                </Row>
                <Row label="">
                  <button
                    className={placing ? styles.active : undefined}
                    aria-pressed={placing}
                    onClick={() => setAdjustSpiral(placing ? null : layer.id)}
                    title="Drag the spiral centers in the preview"
                  >
                    {placing ? 'Done placing' : 'Place in preview'}
                  </button>
                </Row>
                <Row label="">
                  <label
                    className={styles.check}
                    title="All shapes in the layer spiral around one point (the center of them all), so the turns continue from shape to shape"
                  >
                    <input
                      type="checkbox"
                      checked={!!fill.sharedCenter}
                      onChange={(e) => setFill({ sharedCenter: e.target.checked })}
                    />
                    Same center for all shapes
                  </label>
                </Row>
              </>
            )}
            {(type === 'waves' || type === 'noise') && (
              <WavyFields fill={fill} type={type} setFill={setFill} />
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
                  title="Join neighboring lines end to end (a zigzag) without lifting the pen, where the join stays inside the shape. Off lifts the pen after every line."
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
      <PassesSection layer={layer} />
      <SpeedSection layer={layer} />
      <Section title="Defaults" help="fills#your-default-fill">
        <p className={styles.muted}>Your default fill: {describeFill(defaultFill)}.</p>
        <div className={styles.buttons}>
          <button
            disabled={!fill || fill.type === 'none' || sameFill(fill, defaultFill)}
            onClick={() => fill && setDefaultFill(fill)}
            title="Use this layer's fill whenever the app fills shapes for you (new files, doodles, Fill them)"
          >
            Save as my default fill
          </button>
          {layers.length > 1 && (
            <button
              onClick={() => {
                for (const l of layers)
                  if (l.id !== layer.id)
                    setLayer(l.id, {
                      settings: {
                        fill: fill ? { ...fill } : null,
                        drawOutline: layer.settings.drawOutline,
                        speedPenDown: layer.settings.speedPenDown,
                        speedPenUp: layer.settings.speedPenUp,
                        hideCovered: layer.settings.hideCovered,
                      },
                    });
              }}
            >
              Use these settings on all layers
            </button>
          )}
        </div>
      </Section>
    </>
  );
}

const TYPE_LABEL = new Map<FillType, string>(TYPES.map((t) => [t.value, t.label]));

/** "Crosshatch, 0.4 mm, 45°" */
function describeFill(f: FillSettings): string {
  const parts = [TYPE_LABEL.get(f.type) ?? f.type, `${Number(f.spacing.toFixed(2))} mm`];
  if (f.type !== 'concentric') parts.push(`${Number(f.angle.toFixed(1))}°`);
  return parts.join(', ');
}

const sameFill = (a: FillSettings, b: FillSettings) => JSON.stringify(a) === JSON.stringify(b);

/** Waves and noise: size and amplitude, with a note when the amplitude is held back. */
function WavyFields({
  fill,
  type,
  setFill,
}: {
  fill: FillSettings;
  type: 'waves' | 'noise';
  setFill: (patch: Partial<FillSettings>) => void;
}) {
  const v = { ...WAVY_DEFAULTS, ...fill };
  const limit = maxWavyAmplitude({ ...v, kind: type });
  const limited = !fill.allowCross && v.amplitude > limit * 0.95;
  return (
    <>
      {type === 'waves' ? (
        <>
          <Row label="Wavelength">
            <NumberField
              value={v.wavelength}
              min={0.5}
              max={500}
              step={0.5}
              suffix="mm"
              title="Length of one wave"
              onChange={(wavelength) => setFill({ wavelength })}
            />
          </Row>
          <Row label="Phase shift">
            <NumberField
              value={v.phase}
              min={-360}
              max={360}
              step={5}
              suffix="° / line"
              title="Shift each line's wave from the one before, for interference patterns. 0 keeps every wave in step."
              onChange={(phase) => setFill({ phase })}
            />
          </Row>
        </>
      ) : (
        <>
          <Row label="Bump size">
            <NumberField
              value={v.noiseScale}
              min={0.5}
              max={500}
              step={0.5}
              suffix="mm"
              title="How big the bumps are: small is busy and wobbly, large is gentle"
              onChange={(noiseScale) => setFill({ noiseScale })}
            />
          </Row>
          <Row label="Seed">
            <NumberField
              value={v.seed}
              min={0}
              max={99999}
              step={1}
              digits={0}
              title="Picks the pattern. The same seed always gives the same lines."
              onChange={(seed) => setFill({ seed: Math.round(seed) })}
            />
          </Row>
        </>
      )}
      <Row label="Amplitude">
        <NumberField
          value={v.amplitude}
          min={0}
          max={100}
          step={0.1}
          suffix="mm"
          title="How far the lines move sideways, at most"
          onChange={(amplitude) => setFill({ amplitude })}
        />
      </Row>
      <Row label="">
        <label
          className={styles.check}
          title="Allow amplitudes where neighboring lines cross each other"
        >
          <input
            type="checkbox"
            checked={!!fill.allowCross}
            onChange={(e) => setFill({ allowCross: e.target.checked })}
          />
          Let lines cross
        </label>
      </Row>
      {limited && (
        <p className={styles.muted}>
          Held to {(limit * 0.95).toFixed(1)} mm so lines don't cross. Tick Let lines cross for
          more.
        </p>
      )}
    </>
  );
}
