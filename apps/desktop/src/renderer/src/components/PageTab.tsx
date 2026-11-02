import { PAPER_PRESETS, type Alignment, type FitMode, type Margins } from '@plotter-studio/core';
import { useState } from 'react';
import { useStore } from '../store';
import { NumberField, Row, Section, Segmented } from './controls';
import { PagePresets } from './PagePresets';
import styles from './PageTab.module.css';

const IN = 25.4;

const ANCHORS: Alignment[] = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
];

export function PageTab() {
  const page = useStore((s) => s.page);
  const setPage = useStore((s) => s.setPage);
  const m = page.margins;
  const [uniform, setUniform] = useState(
    m.top === m.right && m.right === m.bottom && m.bottom === m.left,
  );
  const setMargins = (patch: Partial<Margins>) => setPage({ margins: { ...m, ...patch } });

  const unit = page.customUnit;
  const k = unit === 'in' ? IN : 1;

  return (
    <>
      <PagePresets />
      <Section title="Paper" help="page-setup#paper">
        <Row label="Size">
          <select
            aria-label="Paper"
            value={page.paper}
            onChange={(e) => setPage({ paper: e.target.value })}
          >
            {PAPER_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
        </Row>
        {page.paper === 'custom' && (
          <Row label="Custom">
            <NumberField
              value={page.customWidth / k}
              min={1}
              step={unit === 'in' ? 0.25 : 1}
              onChange={(v) => setPage({ customWidth: v * k })}
              width={56}
            />
            ×
            <NumberField
              value={page.customHeight / k}
              min={1}
              step={unit === 'in' ? 0.25 : 1}
              onChange={(v) => setPage({ customHeight: v * k })}
              width={56}
            />
            <Segmented
              value={unit}
              options={[
                { value: 'mm', label: 'mm' },
                { value: 'in', label: 'in' },
              ]}
              onChange={(customUnit) => setPage({ customUnit })}
            />
          </Row>
        )}
        <Row label="Orientation">
          <Segmented
            value={page.orientation}
            options={[
              { value: 'portrait', label: 'Portrait' },
              { value: 'landscape', label: 'Landscape' },
            ]}
            onChange={(orientation) => setPage({ orientation })}
          />
        </Row>
      </Section>

      <Section title="Margins">
        <Row label="">
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={uniform}
              onChange={(e) => {
                setUniform(e.target.checked);
                if (e.target.checked) setMargins({ right: m.top, bottom: m.top, left: m.top });
              }}
            />
            Same on all sides
          </label>
        </Row>
        {uniform ? (
          <Row label="Margin">
            <NumberField
              value={m.top}
              min={0}
              suffix="mm"
              onChange={(v) => setMargins({ top: v, right: v, bottom: v, left: v })}
            />
          </Row>
        ) : (
          <>
            <Row label="Top / bottom">
              <NumberField
                value={m.top}
                min={0}
                width={52}
                onChange={(top) => setMargins({ top })}
              />
              <NumberField
                value={m.bottom}
                min={0}
                width={52}
                suffix="mm"
                onChange={(bottom) => setMargins({ bottom })}
              />
            </Row>
            <Row label="Left / right">
              <NumberField
                value={m.left}
                min={0}
                width={52}
                onChange={(left) => setMargins({ left })}
              />
              <NumberField
                value={m.right}
                min={0}
                width={52}
                suffix="mm"
                onChange={(right) => setMargins({ right })}
              />
            </Row>
          </>
        )}
      </Section>

      <Section title="Position" help="page-setup#position">
        <Row label="Fit">
          <Segmented<FitMode>
            value={page.fit}
            options={[
              { value: 'original', label: 'Original', title: '100% of the file size' },
              { value: 'fit', label: 'Fit', title: 'Fit inside the margins' },
              { value: 'fill', label: 'Fill', title: 'Cover the margins and crop' },
            ]}
            onChange={(fit) => setPage({ fit })}
          />
        </Row>
        <Row label="Align">
          <div className={styles.anchors}>
            {ANCHORS.map((a) => (
              <button
                key={a}
                title={a}
                className={page.align === a ? styles.anchorOn : styles.anchor}
                onClick={() => setPage({ align: a })}
              />
            ))}
          </div>
          <label
            className={styles.check}
            title="Keep the artwork where the file's artboard puts it"
          >
            <input
              type="checkbox"
              checked={page.align === 'file'}
              onChange={(e) => setPage({ align: e.target.checked ? 'file' : 'center' })}
            />
            As in file
          </label>
        </Row>
        <Row label="Scale">
          <NumberField
            value={page.scale}
            min={1}
            max={10000}
            suffix="%"
            onChange={(scale) => setPage({ scale })}
          />
        </Row>
        <Row label="Rotation">
          <Segmented
            value={String(page.rotation)}
            options={[0, 90, 180, 270].map((r) => ({ value: String(r), label: `${r}°` }))}
            onChange={(r) => setPage({ rotation: Number(r) })}
          />
          <NumberField
            value={page.rotation}
            min={-360}
            max={360}
            width={52}
            suffix="°"
            onChange={(rotation) => setPage({ rotation })}
          />
        </Row>
        <Row label="Offset X / Y">
          <NumberField
            value={page.offsetX}
            width={52}
            onChange={(offsetX) => setPage({ offsetX })}
          />
          <NumberField
            value={page.offsetY}
            width={52}
            suffix="mm"
            onChange={(offsetY) => setPage({ offsetY })}
          />
        </Row>
      </Section>
    </>
  );
}
