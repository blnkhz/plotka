import { useProcessed, useProfile } from '../lib/useProcessed';
import { defaultFillSettings, undrawnFillCount } from '@plotter-studio/core';
import { applyOverrides, useStore, type Tab } from '../store';
import { Notice, Section } from './controls';
import { FillTab } from './FillTab';
import { MachineTab } from './MachineTab';
import { PlotSection } from './PlotSection';
import { exportPlot } from '../lib/exportPlot';
import { OptimizeSection } from './OptimizeSection';
import { PageTab } from './PageTab';
import { StatsTable } from './StatsTable';
import styles from './RightPanel.module.css';

const TABS: { id: Tab; label: string }[] = [
  { id: 'page', label: 'Page' },
  { id: 'fill', label: 'Fill' },
  { id: 'machine', label: 'Machine' },
  { id: 'plot', label: 'Plot' },
];

export function RightPanel() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  return (
    <div className={styles.panel}>
      <nav className={styles.tabs} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === tab}
            className={t.id === tab ? styles.active : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className={styles.body}>
        <PlacementWarnings />
        {tab === 'page' && <PageTab />}
        {tab === 'fill' && <FillTab />}
        {tab === 'machine' && <MachineTab />}
        {tab === 'plot' && <PlotTab />}
      </div>
    </div>
  );
}

function PlacementWarnings() {
  const processed = useProcessed();
  const profile = useProfile();
  if (!processed) return null;
  const clipped = [...processed.outside.values()].some((l) => l.length > 0);
  return (
    <>
      {processed.paperExceedsBed && (
        <Notice kind="error">
          The paper is larger than the {profile.name} can reach ({profile.bed.width} ×{' '}
          {profile.bed.height} mm). Plotting is blocked until the paper fits.
        </Notice>
      )}
      <UndrawnFillsNotice />
      {clipped && (
        <Notice kind="warn">
          Some of the drawing is outside the printable area and will be cut off (shown in red).
        </Notice>
      )}
    </>
  );
}

/** Filled shapes that won't be drawn, with one-click ways to draw them. */
function UndrawnFillsNotice() {
  const doc = useStore((s) => s.doc);
  const overrides = useStore((s) => s.layerOverrides);
  const setLayer = useStore((s) => s.setLayer);
  const hidden = useStore((s) => s.undrawnNoticeHidden);
  if (!doc || hidden) return null;
  const layers = applyOverrides(doc, overrides).layers.filter(
    (l) => l.visible && l.plot && undrawnFillCount(l) > 0,
  );
  if (!layers.length) return null;
  const count = layers.reduce((n, l) => n + undrawnFillCount(l), 0);
  const where = layers.length === 1 ? ` in ${layers[0]!.name}` : ` in ${layers.length} layers`;
  return (
    <Notice kind="info">
      <p className={styles.noticeText}>
        {count} filled {count === 1 ? 'shape' : 'shapes'}
        {where} won’t be drawn: a pen can’t paint an area. They show faintly in the preview.
      </p>
      <div className={styles.noticeButtons}>
        <button
          onClick={() => {
            for (const l of layers) setLayer(l.id, { settings: { fill: defaultFillSettings() } });
          }}
          title="Fill them with parallel lines (change the type in the Fill tab)"
        >
          Fill them with lines
        </button>
        <button
          onClick={() => {
            for (const l of layers) setLayer(l.id, { settings: { drawOutline: true } });
          }}
        >
          Draw their outlines
        </button>
        <button
          className={styles.noticeDismiss}
          onClick={() => useStore.setState({ undrawnNoticeHidden: true })}
          title="Hide this message for this file"
        >
          Leave them
        </button>
      </div>
    </Notice>
  );
}

function PlotTab() {
  const doc = useStore((s) => s.doc);
  return (
    <>
      <PlotSection />
      <Section title="Stats" help="plotting#time-and-distance">
        {doc ? <StatsTable /> : <p className={styles.muted}>No file open.</p>}
        {doc && (
          <div className={styles.exportRow}>
            <button
              onClick={() => void exportPlot('svg')}
              title="Save what will be plotted as an SVG (⌘E)"
            >
              Export SVG…
            </button>
            <button
              onClick={() => void exportPlot('json')}
              title="Save the planned paths as JSON, in mm (⇧⌘E)"
            >
              Export JSON…
            </button>
          </div>
        )}
      </Section>
      <OptimizeSection />
    </>
  );
}
