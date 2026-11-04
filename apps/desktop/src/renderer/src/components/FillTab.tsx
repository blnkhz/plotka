import {
  CENTERED_FILLS,
  maxWavyAmplitude,
  WAVY_DEFAULTS,
  type FillSettings,
  type FillType,
  type LayerPlacement,
  type NibFont,
  type TextItem,
  BLACKLETTER_NIB_ANGLE,
  isNibFont,
  nibProportions,
  nibTextSize,
  TEXT_FONTS,
} from '@plotka/core';
import { applyOverrides, currentLayerSettings, useStore } from '../store';
import { Notice, NumberField, Row, Section, Segmented } from './controls';
import { NibTextPreview } from './NibTextPreview';
import { PassesSection } from './PassesSection';
import { NibAngle, NibWidth } from './Preview';
import { SpeedSection } from './SpeedSection';
import styles from './FillTab.module.css';

const TYPES: { value: FillType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'lines', label: 'Lines' },
  { value: 'crosshatch', label: 'Crosshatch' },
  { value: 'triangles', label: 'Triangles' },
  { value: 'hexagons', label: 'Hexagons' },
  { value: 'waves', label: 'Waves' },
  { value: 'noise', label: 'Noise' },
  { value: 'flow', label: 'Flow' },
  { value: 'concentric', label: 'Concentric' },
  { value: 'spiral', label: 'Spiral' },
  { value: 'ripples', label: 'Ripples' },
  { value: 'dots', label: 'Dots' },
  { value: 'stipple', label: 'Stipple' },
];

/** Which controls apply to each fill type. */
const USES_ANGLE = new Set<FillType>([
  'lines',
  'crosshatch',
  'triangles',
  'hexagons',
  'waves',
  'noise',
  'flow',
  'spiral',
  'dots',
]);
const USES_CONNECT = new Set<FillType>([
  'lines',
  'crosshatch',
  'triangles',
  'waves',
  'noise',
  'concentric',
]);
const SPACING_LABEL: Partial<Record<FillType, string>> = {
  concentric: 'Ring spacing',
  ripples: 'Ring spacing',
  spiral: 'Turn spacing',
  dots: 'Dot spacing',
  stipple: 'Dot spacing',
  hexagons: 'Cell size',
  flow: 'Line spacing',
};
/**
 * Fill types that look best a bit sparser than line hatching: switching to them raises the
 * spacing to this if it's lower (0.6 mm hexagons or stipple would be nearly solid black).
 */
const MIN_START_SPACING: Partial<Record<FillType, number>> = {
  hexagons: 4,
  triangles: 3,
  stipple: 1,
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
      {layer.text ? (
        <TextSection item={layer.text} color={layer.color} />
      ) : (
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
                  else {
                    const start = MIN_START_SPACING[t];
                    const spacing = fill?.spacing ?? useStore.getState().defaultFill.spacing;
                    setFill(start && spacing < start ? { type: t, spacing: start } : { type: t });
                  }
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
                {CENTERED_FILLS.includes(type) && (
                  <>
                    <Row label="Center X / Y">
                      <NumberField
                        value={fill.centerX ?? 0}
                        min={-1000}
                        max={1000}
                        step={1}
                        width={52}
                        title="Move the center, in mm from the shape's center (right is +)"
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
                        title="Drag the centers in the preview"
                      >
                        {placing ? 'Done placing' : 'Place in preview'}
                      </button>
                    </Row>
                    <Row label="">
                      <label
                        className={styles.check}
                        title="All shapes in the layer share one center (the center of them all), so the pattern continues from shape to shape"
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
                {type === 'flow' && <FlowFields fill={fill} setFill={setFill} />}
                {(type === 'dots' || type === 'stipple') && (
                  <Row label="Dash length">
                    <NumberField
                      value={fill.dashLength ?? 0}
                      min={0}
                      max={50}
                      step={0.25}
                      suffix="mm"
                      title="Draw each dot as a short line this long, along the angle. 0: dots."
                      onChange={(dashLength) => setFill({ dashLength })}
                    />
                  </Row>
                )}
                {(type === 'dots' || type === 'stipple') && (fill.dashLength ?? 0) > 0 && (
                  <Row label="Dash angle">
                    <NumberField
                      value={fill.dashAngle ?? fill.angle}
                      min={-360}
                      max={360}
                      step={5}
                      suffix="°"
                      title="Which way the dashes point"
                      onChange={(dashAngle) => setFill({ dashAngle })}
                    />
                  </Row>
                )}
                {type === 'stipple' && (
                  <>
                    <SeedField fill={fill} setFill={setFill} />
                    {!fill.densityFromColor && (
                      <p className={styles.muted}>
                        Tick Spacing from fill color below to stipple by tone: darker shapes get
                        more dots.
                      </p>
                    )}
                  </>
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
              <label
                className={styles.check}
                title="Draw the outline around each filled shape. Outlines that came with the file (or a doodle) are on this switch too."
              >
                <input
                  type="checkbox"
                  checked={layer.settings.drawOutline}
                  onChange={(e) =>
                    setLayer(layer.id, { settings: { drawOutline: e.target.checked } })
                  }
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
                  onChange={(e) =>
                    setLayer(layer.id, { settings: { hideCovered: e.target.checked } })
                  }
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
        </>
      )}
      <PositionSection layerId={layer.id} placement={layer.settings.placement ?? null} />
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
  const limit = maxWavyAmplitude({ ...v, kind: type, shape: fill.waveShape ?? 'sine' });
  const limited = !fill.allowCross && v.amplitude > limit * 0.95;
  return (
    <>
      {type === 'waves' ? (
        <>
          <Row label="Shape">
            <select
              aria-label="Wave shape"
              value={fill.waveShape ?? 'sine'}
              onChange={(e) =>
                setFill({ waveShape: e.target.value as 'sine' | 'triangle' | 'square' })
              }
            >
              <option value="sine">Smooth</option>
              <option value="triangle">Zigzag</option>
              <option value="square">Square</option>
            </select>
          </Row>
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

/** Where the layer sits, relative to where the page setup put it (set by dragging in Arrange). */
function PositionSection({
  layerId,
  placement,
}: {
  layerId: string;
  placement: LayerPlacement | null;
}) {
  const setLayer = useStore((s) => s.setLayer);
  const p = placement ?? { dx: 0, dy: 0, sx: 1, sy: 1 };
  const set = (patch: Partial<LayerPlacement>) =>
    setLayer(layerId, { settings: { placement: { ...p, ...patch } } });
  const moved = p.dx !== 0 || p.dy !== 0 || p.sx !== 1 || p.sy !== 1 || !!p.rot;
  return (
    <Section title="Position" help="page-setup#moving-and-resizing-layers">
      <Row label="Move X / Y">
        <NumberField
          value={p.dx}
          min={-2000}
          max={2000}
          step={1}
          width={62}
          title="mm to the right of where the page setup puts it"
          onChange={(dx) => set({ dx })}
        />
        <NumberField
          value={p.dy}
          min={-2000}
          max={2000}
          step={1}
          width={62}
          suffix="mm"
          title="mm down"
          onChange={(dy) => set({ dy })}
        />
      </Row>
      <Row label="Size W / H">
        <NumberField
          value={p.sx * 100}
          min={1}
          max={2000}
          step={5}
          width={62}
          digits={1}
          title="Width, % of its size from the page setup"
          onChange={(v) => set({ sx: v / 100 })}
        />
        <NumberField
          value={p.sy * 100}
          min={1}
          max={2000}
          step={5}
          width={62}
          digits={1}
          suffix="%"
          title="Height"
          onChange={(v) => set({ sy: v / 100 })}
        />
      </Row>
      <Row label="Rotation">
        <NumberField
          value={p.rot ?? 0}
          min={-360}
          max={360}
          step={15}
          width={62}
          digits={1}
          suffix="°"
          title="Turn around its center, clockwise"
          onChange={(rot) => set({ rot })}
        />
      </Row>
      <Row label="">
        <button
          disabled={!moved}
          onClick={() => setLayer(layerId, { settings: { placement: null } })}
          title="Back to where the page setup puts it"
        >
          Reset position
        </button>
        <span className={styles.muted}>Or drag it with ✥ Arrange.</span>
      </Row>
    </Section>
  );
}

function SeedField({
  fill,
  setFill,
}: {
  fill: FillSettings;
  setFill: (patch: Partial<FillSettings>) => void;
}) {
  return (
    <Row label="Seed">
      <NumberField
        value={fill.seed ?? WAVY_DEFAULTS.seed}
        min={0}
        max={99999}
        step={1}
        digits={0}
        title="Picks the pattern. The same seed always gives the same result."
        onChange={(seed) => setFill({ seed: Math.round(seed) })}
      />
    </Row>
  );
}

/** Flow: lines following smooth noise, kept a spacing apart. */
function FlowFields({
  fill,
  setFill,
}: {
  fill: FillSettings;
  setFill: (patch: Partial<FillSettings>) => void;
}) {
  return (
    <>
      <Row label="Bump size">
        <NumberField
          value={fill.noiseScale ?? WAVY_DEFAULTS.noiseScale}
          min={0.5}
          max={500}
          step={0.5}
          suffix="mm"
          title="How big the bends are: small is busy and curly, large is gentle"
          onChange={(noiseScale) => setFill({ noiseScale })}
        />
      </Row>
      <Row label="Stroke length">
        <NumberField
          value={fill.strokeLength ?? 0}
          min={0}
          max={1000}
          step={1}
          suffix="mm"
          title="Longest a line runs. 0: as long as it can, for long flowing lines; a few mm gives short strokes, like a field of hairs or grass."
          onChange={(strokeLength) => setFill({ strokeLength })}
        />
      </Row>
      <SeedField fill={fill} setFill={setFill} />
    </>
  );
}

/** LATER-6: a text layer's text and style (it has no fill). */
function TextSection({ item, color }: { item: TextItem; color: string }) {
  const updateText = useStore((s) => s.updateText);
  const nib = useStore((s) => s.view.nib);
  const setView = useStore((s) => s.setView);
  const set = (patch: Partial<TextItem>) => updateText(item.id, patch);
  const nibFont = isNibFont(item.font) ? item.font : null;
  const blackletter = nibFont !== null;
  const fromNib = blackletter && !!item.matchNib;
  const caps = nibFont ? nibProportions(nibFont) : null;
  return (
    <Section title="Text" help="text">
      <textarea
        className={styles.text}
        aria-label="Text"
        value={item.text}
        rows={Math.min(8, Math.max(2, item.text.split('\n').length + 1))}
        onChange={(e) => set({ text: e.target.value })}
      />
      <Row label="Style">
        <select
          aria-label="Text style"
          value={item.font}
          onChange={(e) => {
            const font = e.target.value;
            // Your own size stays yours; Hershey fonts aren't sized from a nib.
            if (!isNibFont(font) || (blackletter && !item.matchNib)) return set({ font });
            // Drawn for the parallel pen: size it from the nib (each font its own proportion)
            // and show the nib.
            set({ font, matchNib: true, size: nibTextSize(nib.width, font) });
            if (!nib.on) setView({ nib: { ...nib, on: true } });
          }}
        >
          {TEXT_FONTS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </Row>
      {blackletter && (
        <>
          <Row label="Nib">
            <span className={styles.nib}>
              <NibWidth />
            </span>
          </Row>
          <Row label="Angle">
            <span className={styles.nib}>
              <NibAngle />
            </span>
          </Row>
        </>
      )}
      <Row label="Size">
        <NumberField
          value={item.size}
          min={0.5}
          max={1000}
          step={0.5}
          suffix="mm"
          title={
            fromNib
              ? `Capitals ${caps?.capNibs} nib widths tall. Clear From nib to choose your own size.`
              : 'Height of capital letters'
          }
          disabled={fromNib}
          onChange={(size) => set({ size })}
        />
        {blackletter && (
          <label
            className={styles.check}
            title={`Capitals ${caps?.capNibs} nib widths tall and the x-height ${caps?.xNibs}, the classic proportion for this hand; follows the nib width`}
          >
            <input
              type="checkbox"
              checked={fromNib}
              onChange={(e) =>
                set(
                  e.target.checked
                    ? { matchNib: true, size: nibTextSize(nib.width, nibFont!) }
                    : { matchNib: false },
                )
              }
            />
            From nib
          </label>
        )}
      </Row>
      {blackletter && <NibTextPreview item={item} nib={nib} color={color} />}
      {nibFont && <NibNotes item={item} font={nibFont} />}
      <Row label="Line spacing">
        <NumberField
          value={item.lineSpacing * 100}
          min={10}
          max={1000}
          step={5}
          suffix="%"
          digits={0}
          onChange={(v) => set({ lineSpacing: v / 100 })}
        />
      </Row>
      <Row label="Letter spacing">
        <NumberField
          value={item.letterSpacing}
          min={-100}
          max={100}
          step={0.1}
          suffix="mm"
          title="Extra space between letters"
          onChange={(letterSpacing) => set({ letterSpacing })}
        />
      </Row>
      <Row label="Align">
        <Segmented
          value={item.align}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right', label: 'Right' },
          ]}
          onChange={(align) => set({ align })}
        />
      </Row>
      <p className={styles.muted}>
        {blackletter
          ? 'Every stroke is one pass of a flat nib: the thick stems, diamonds and hairlines come from the pen, not from outlines. Move it with ✥ Arrange, but don’t turn it: the nib stays at its angle.'
          : 'Single-stroke Hershey lettering: each letter is drawn once with the pen. Move, resize or turn it with ✥ Arrange.'}
      </p>
    </Section>
  );
}

/** Parallel-pen fonts: how the size relates to the nib, and when the nib angle won't suit it. */
function NibNotes({ item, font }: { item: TextItem; font: NibFont }) {
  const { capNibs, xNibs } = nibProportions(font);
  const nib = useStore((s) => s.view.nib);
  const setView = useStore((s) => s.setView);
  const nibs = item.size / nib.width;
  // The angle as the letters see it: a flat nib is the same turned by 180°.
  const angle = ((nib.angle % 180) + 180) % 180;
  const offAngle = Math.abs(angle - BLACKLETTER_NIB_ANGLE) > 15;
  return (
    <>
      <p className={styles.muted}>
        {nib.width} mm nib: capitals {nibs.toFixed(1)} nib widths tall, x-height{' '}
        {((item.size * xNibs) / capNibs).toFixed(1)} mm.
        {!item.matchNib && Math.abs(nibs - capNibs) > 1.5 && (
          <>
            {' '}
            {nibs < capNibs ? 'Heavy and crowded' : 'Light and open'}: {capNibs} nib widths is the
            classic.
          </>
        )}
      </p>
      {offAngle && (
        <Notice kind="warn">
          The letters are drawn for a nib at about {BLACKLETTER_NIB_ANGLE}°; at {nib.angle}° the
          stems and hairlines come out wrong.{' '}
          <button onClick={() => setView({ nib: { ...nib, angle: BLACKLETTER_NIB_ANGLE } })}>
            Use {BLACKLETTER_NIB_ANGLE}°
          </button>
        </Notice>
      )}
      {!nib.on && (
        <p className={styles.muted}>
          <button onClick={() => setView({ nib: { ...nib, on: true } })}>
            Show the parallel pen in the preview
          </button>
        </p>
      )}
    </>
  );
}
