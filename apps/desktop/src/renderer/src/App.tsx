import { useEffect, useState } from 'react';
import { DoodlePad } from './components/DoodlePad';
import { LayersPanel } from './components/LayersPanel';
import { TransformsPanel } from './components/TransformsPanel';
import { Preview } from './components/Preview';
import { RightPanel } from './components/RightPanel';
import { openDroppedFile, openWithDialog } from './lib/openFile';
import { command, control, subscribePlotter } from './lib/plotter';
import { saveProject, trackProject } from './lib/projectActions';
import { fmtDistance } from './lib/format';
import { useProcessed } from './lib/useProcessed';
import { fmtDuration } from './lib/format';
import { useStore } from './store';
import styles from './App.module.css';

export function App() {
  const [dragging, setDragging] = useState(false);
  const doodleOpen = useStore((s) => s.doodle.open);
  useShortcuts();
  useEffect(() => subscribePlotter(), []);
  useEffect(() => trackProject(), []);

  return (
    <div
      className={styles.app}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node))
          setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) void openDroppedFile(file);
      }}
    >
      <Toolbar />
      <div className={styles.main}>
        <aside className={styles.left}>
          <LayersPanel />
          <TransformsPanel />
        </aside>
        <Preview />
        <RightPanel />
      </div>
      {dragging && <div className={styles.dropHint}>Drop to open</div>}
      {doodleOpen && <DoodlePad />}
    </div>
  );
}

function Toolbar() {
  const source = useStore((s) => s.source);
  const doc = useStore((s) => s.doc);
  const error = useStore((s) => s.error);
  const loading = useStore((s) => s.loading);
  const processed = useProcessed();
  const setDoodle = useStore((s) => s.setDoodle);
  const hasDoodle = useStore((s) => s.doodle.strokes.length > 0);

  return (
    <header className={styles.toolbar}>
      <button onClick={() => void openWithDialog()} title="Open (⌘O)">
        Open…
      </button>
      <button
        onClick={() => void saveProject(false)}
        disabled={!doc && !hasDoodle}
        title="Save project (⌘S). ⇧⌘S saves a copy under a new name."
      >
        Save
      </button>
      <button
        onClick={() => setDoodle({ open: true })}
        title="Draw something and turn it into vectors"
      >
        {hasDoodle ? 'Edit doodle…' : 'Doodle…'}
      </button>
      <span className={styles.file}>{loading ? 'Loading…' : (source?.name ?? 'No file')}</span>
      {error && <span className={styles.error}>{error}</span>}
      {doc?.warnings.map((w) => (
        <span key={w} className={styles.warning}>
          {w}
        </span>
      ))}
      <span className={styles.spacer} />
      {processed && (
        <span className={styles.summary}>
          {processed.stats.total.pathCount} paths · draw{' '}
          {fmtDistance(processed.stats.total.penDownDistance)} · travel{' '}
          {fmtDistance(processed.stats.total.travelDistance)} · ≈{' '}
          {fmtDuration(processed.stats.total.estimatedTime)}
        </span>
      )}
    </header>
  );
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.closest('input, select, textarea') !== null;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void openWithDialog();
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveProject(e.shiftKey);
      } else if (!mod && !typing && e.key.toLowerCase() === 'f') {
        useStore.getState().requestFit();
      } else if (!mod && !typing && !useStore.getState().doodle.open) {
        // Plot shortcuts: Space pauses / resumes; U / D raise / lower the pen when not plotting.
        const plotter = useStore.getState().plotter;
        const state = plotter?.plot?.state;
        const plotting = state === 'running' || state === 'paused' || state === 'pausing';
        if (e.key === ' ' && plotting) {
          e.preventDefault();
          void control('toggle');
        } else if (plotter?.connection.connected && !plotting && state !== 'stopping') {
          if (e.key.toLowerCase() === 'u') void command({ kind: 'penUp' });
          if (e.key.toLowerCase() === 'd') void command({ kind: 'penDown' });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
