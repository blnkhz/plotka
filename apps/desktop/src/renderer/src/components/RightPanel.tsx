import { useProcessed, useProfile } from '../lib/useProcessed';
import { useStore, type Tab } from '../store';
import { Notice, Row, Section } from './controls';
import { FillTab } from './FillTab';
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
      {clipped && (
        <Notice kind="warn">
          Some of the drawing is outside the printable area and will be cut off (shown in red).
        </Notice>
      )}
    </>
  );
}

function MachineTab() {
  const profile = useProfile();
  return (
    <Section title="Machine">
      <Row label="Profile">{profile.name}</Row>
      <Row label="Travel">
        {profile.bed.width} × {profile.bed.height} mm
      </Row>
      <Row label="Home">Top left of the paper</Row>
      {profile.provisional?.length ? (
        <p className={styles.muted}>
          Speed and pen values are estimates until the plotter has been tested.
        </p>
      ) : null}
      <p className={styles.muted}>Connecting to the plotter comes in a later step.</p>
    </Section>
  );
}

function PlotTab() {
  const doc = useStore((s) => s.doc);
  return (
    <>
      <Section title="Stats">
        {doc ? <StatsTable /> : <p className={styles.muted}>No file open.</p>}
      </Section>
      <OptimizeSection />
    </>
  );
}
