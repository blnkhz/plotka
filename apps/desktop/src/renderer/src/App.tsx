import { useEffect, useRef, useState } from 'react';
import { DoodlePad } from './components/DoodlePad';
import { HelpPanel } from './components/HelpPanel';
import { AutoReload } from './components/AutoReload';
import { startWatching } from './lib/watch';
import { exportPlot } from './lib/exportPlot';
import { LayersPanel } from './components/LayersPanel';
import { TransformsPanel } from './components/TransformsPanel';
import { Preview } from './components/Preview';
import { RightPanel } from './components/RightPanel';
import { openDroppedFile, openWithDialog } from './lib/openFile';
import { command, control, subscribePlotter } from './lib/plotter';
import { redo, saveProject, trackProject, undo } from './lib/projectActions';
import { startPipeline } from './lib/pipelineRunner';
import { startAutosave } from './lib/autosave';
import { RecoveryBanner } from './components/RecoveryBanner';
import { openFromOutside } from './lib/openFile';
import { fmtDistance } from './lib/format';
import { useProcessed, useProcessing } from './lib/useProcessed';
import { fmtDuration } from './lib/format';
import { useStore } from './store';
import styles from './App.module.css';

export function App() {
  const [dragging, setDragging] = useState(false);
  const doodleOpen = useStore((s) => s.doodle.open);
  const helpOpen = useStore((s) => s.help.open);
  useShortcuts();
  useEffect(() => subscribePlotter(), []);
  useEffect(() => trackProject(), []);
  useEffect(() => startPipeline(), []);
  useEffect(() => startAutosave(), []);
  useEffect(() => startWatching(), []);
  useEffect(() => {
    const off = window.api.on('file:opened', (f) => void openFromOutside(f));
    // Files opened from Finder before the window was ready arrive now.
    void window.api.invoke('app:rendererReady');
    return off;
  }, []);
  useEffect(() => window.api.on('app:menu', ({ action }) => void menuAction(action)), []);

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
      <RecoveryBanner />
      <ResizableMain>
        <aside className={styles.left}>
          <LayersPanel />
          <TransformsPanel />
        </aside>
        <Preview />
        <RightPanel />
      </ResizableMain>
      {dragging && <div className={styles.dropHint}>Drop to open</div>}
      {doodleOpen && <DoodlePad />}
      {helpOpen && <HelpPanel />}
    </div>
  );
}

function Toolbar() {
  const source = useStore((s) => s.source);
  const doc = useStore((s) => s.doc);
  const error = useStore((s) => s.error);
  const loading = useStore((s) => s.loading);
  const processed = useProcessed();
  const processing = useProcessing();
  const setDoodle = useStore((s) => s.setDoodle);
  const hasDoodle = useStore((s) => s.doodle.strokes.length > 0);
  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);

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
      <button onClick={() => void undo()} disabled={!canUndo} title="Undo (⌘Z)" aria-label="Undo">
        ↶
      </button>
      <button onClick={() => void redo()} disabled={!canRedo} title="Redo (⇧⌘Z)" aria-label="Redo">
        ↷
      </button>
      <button
        onClick={() => setDoodle({ open: true })}
        title="Draw something and turn it into vectors"
      >
        {hasDoodle ? 'Edit doodle…' : 'Doodle…'}
      </button>
      <button onClick={() => useStore.getState().openHelp()} title="Help (⌘?)">
        Help
      </button>
      <span className={styles.file}>{loading ? 'Loading…' : (source?.name ?? 'No file')}</span>
      <AutoReload />
      {error && <span className={styles.error}>{error}</span>}
      {doc?.warnings.map((w) => (
        <span key={w} className={styles.warning}>
          {w}
        </span>
      ))}
      <span className={styles.spacer} />
      {processing && (
        <span className={styles.updating} role="status">
          Updating…
        </span>
      )}
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

/** Text fields where Undo should undo typing rather than settings. */
function editingText(): boolean {
  const el = document.activeElement;
  if (el instanceof HTMLTextAreaElement) return true;
  return (
    el instanceof HTMLInputElement && /^(text|number|search|url|email|password)$/.test(el.type)
  );
}

async function menuAction(
  action: 'open' | 'save' | 'saveAs' | 'undo' | 'redo' | 'help' | 'exportSvg' | 'exportJson',
) {
  const doodleOpen = useStore.getState().doodle.open;
  switch (action) {
    case 'exportSvg':
      return exportPlot('svg');
    case 'exportJson':
      return exportPlot('json');
    case 'help':
      return useStore.getState().openHelp();
    case 'open':
      return openWithDialog();
    case 'save':
    case 'saveAs':
      return void (await saveProject(action === 'saveAs'));
    case 'undo':
    case 'redo':
      if (editingText()) {
        // execCommand is the way to reach the field's own undo stack.
        document.execCommand(action);
        return;
      }
      if (doodleOpen) {
        const s = useStore.getState();
        return action === 'undo' ? s.doodleUndo() : s.doodleRedo();
      }
      return action === 'undo' ? undo() : redo();
  }
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.closest('input, select, textarea') !== null;
      const mod = e.metaKey || e.ctrlKey;
      // ⌘O, ⌘S, ⌘Z, ⌘? come through the app menu (menuAction), not here.
      if (e.key === 'F1') {
        e.preventDefault();
        useStore.getState().openHelp();
      } else if (useStore.getState().help.open) {
        // Typing in the help window shouldn't move the plotter.
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

const LEFT_WIDTH = 240;
const RIGHT_DEFAULT = 300;
const RIGHT_MIN = 260;
/** The preview always keeps at least this much room. */
const PREVIEW_MIN = 320;
const RIGHT_WIDTH_KEY = 'plotter-studio:right-panel-width';

function savedRightWidth(): number {
  try {
    const v = Number(localStorage.getItem(RIGHT_WIDTH_KEY));
    return Number.isFinite(v) && v >= RIGHT_MIN ? v : RIGHT_DEFAULT;
  } catch {
    return RIGHT_DEFAULT;
  }
}

/**
 * The three columns, with a handle on the right panel's left edge: drag to resize it, arrow keys
 * to nudge, double-click to reset. The width is remembered; the preview never gets squeezed
 * below PREVIEW_MIN.
 */
function ResizableMain({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState(savedRightWidth);
  const [resizing, setResizing] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const maxWidth = () =>
    Math.max(RIGHT_MIN, (mainRef.current?.clientWidth ?? 1e6) - LEFT_WIDTH - PREVIEW_MIN);
  const apply = (w: number) => {
    const next = Math.round(Math.min(maxWidth(), Math.max(RIGHT_MIN, w)));
    setWidth(next);
    try {
      localStorage.setItem(RIGHT_WIDTH_KEY, String(next));
    } catch {
      // Only a convenience: the width just won't be remembered.
    }
  };
  return (
    <div
      ref={mainRef}
      className={`${styles.main} ${resizing ? styles.resizing : ''}`}
      style={{
        // The panel shrinks with the window rather than squeezing the preview away.
        gridTemplateColumns: `${LEFT_WIDTH}px minmax(0, 1fr) min(${width}px, max(${RIGHT_MIN}px, calc(100% - ${LEFT_WIDTH + PREVIEW_MIN}px)))`,
      }}
    >
      {children}
      <div
        className={styles.resizer}
        style={{
          right: `min(${width}px, max(${RIGHT_MIN}px, calc(100% - ${LEFT_WIDTH + PREVIEW_MIN}px)))`,
        }}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the side panel"
        aria-valuenow={width}
        aria-valuemin={RIGHT_MIN}
        tabIndex={0}
        title="Drag to resize · double-click to reset"
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          setResizing(true);
        }}
        onPointerMove={(e) => {
          if (!resizing || !mainRef.current) return;
          apply(mainRef.current.getBoundingClientRect().right - e.clientX);
        }}
        onPointerUp={() => setResizing(false)}
        onPointerCancel={() => setResizing(false)}
        onDoubleClick={() => apply(RIGHT_DEFAULT)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 50 : 10;
          // The handle sits on the panel's left edge: left makes the panel wider.
          if (e.key === 'ArrowLeft') apply(width + step);
          else if (e.key === 'ArrowRight') apply(width - step);
          else return;
          e.preventDefault();
        }}
      />
    </div>
  );
}
