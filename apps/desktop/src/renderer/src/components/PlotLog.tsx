import { useEffect, useState } from 'react';
import type { PlotLogEntry } from '@shared/ipc';
import { fmtDistance, fmtDuration } from '../lib/format';
import { openProject } from '../lib/projectActions';
import { useStore } from '../store';
import { Section } from './controls';
import styles from './PlotLog.module.css';

const SHOWN = 5;

/** PLOT-7: past plots, newest first, with their settings to open again. */
export function PlotLog() {
  const [entries, setEntries] = useState<PlotLogEntry[]>([]);
  const [all, setAll] = useState(false);
  useEffect(() => {
    void window.api.invoke('plotLog:list').then(setEntries);
    return window.api.on('plotLog:changed', setEntries);
  }, []);
  const shown = all ? entries : entries.slice(0, SHOWN);
  return (
    <Section title="Plot log" help="plotting#plot-log">
      {entries.length === 0 && (
        <p className={styles.muted}>Plots you make are listed here, with their settings.</p>
      )}
      <ul className={styles.list}>
        {shown.map((e) => (
          <Entry key={e.id} entry={e} />
        ))}
      </ul>
      {entries.length > SHOWN && (
        <button className={styles.link} onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${entries.length}`}
        </button>
      )}
    </Section>
  );
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

function outcome(e: PlotLogEntry): { text: string; kind: 'ok' | 'warn' | 'muted' } {
  const pct = `${Math.round(e.done * 100)}%`;
  switch (e.outcome) {
    case 'done':
      return { text: 'Finished', kind: 'ok' };
    case 'plotting':
      return { text: 'In progress', kind: 'muted' };
    case 'stopped':
      return { text: `Stopped at ${pct}`, kind: 'warn' };
    case 'error':
      return { text: `Failed at ${pct}`, kind: 'warn' };
    case 'interrupted':
      return { text: 'Interrupted (the app closed)', kind: 'warn' };
  }
}

function Entry({ entry: e }: { entry: PlotLogEntry }) {
  // The note being typed; null when not editing (then the saved note shows).
  const [draft, setDraft] = useState<string | null>(null);
  const o = outcome(e);
  const saveNote = () => {
    if (draft !== null && draft !== e.note) void window.api.invoke('plotLog:note', e.id, draft);
    setDraft(null);
  };
  return (
    <li className={styles.entry}>
      <div className={styles.head}>
        <span className={styles.file} title={e.projectName !== e.file ? e.projectName : e.file}>
          {e.file}
        </span>
        <span className={styles.date}>{when(e.startedAt)}</span>
      </div>
      <div className={styles.meta}>
        <span className={styles[o.kind]} title={e.message}>
          {o.text}
        </span>
        {e.continued && <span title="Continued an earlier plot">continued</span>}
        {e.outcome !== 'plotting' && <span>{fmtDuration(e.elapsedMs / 1000)}</span>}
        <span>
          {e.pathCount} paths · {fmtDistance(e.drawMm)}
        </span>
        <span>{e.profileName}</span>
      </div>
      <input
        className={styles.note}
        placeholder="Add a note (pen, paper…)"
        aria-label={`Note for ${e.file}, ${when(e.startedAt)}`}
        value={draft ?? e.note}
        onChange={(ev) => setDraft(ev.target.value)}
        onBlur={saveNote}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur();
          if (ev.key === 'Escape') setDraft(null);
        }}
      />
      <div className={styles.actions}>
        <button
          onClick={() => void openLogged(e)}
          title="Open the artwork and settings exactly as they were plotted, as a new project"
        >
          Open
        </button>
        <button
          className={styles.icon}
          aria-label={`Delete log entry for ${e.file}, ${when(e.startedAt)}`}
          title="Delete from the log"
          onClick={() => void window.api.invoke('plotLog:delete', e.id)}
        >
          ✕
        </button>
      </div>
    </li>
  );
}

async function openLogged(e: PlotLogEntry) {
  const { dirty, projectName } = useStore.getState();
  if (
    dirty &&
    !window.confirm(`Open the plotted version? Unsaved changes to “${projectName}” will be lost.`)
  )
    return;
  const text = await window.api.invoke('plotLog:project', e.id);
  if (!text) {
    useStore.setState({ error: 'The settings of this plot are no longer there.' });
    return;
  }
  const day = e.startedAt.slice(0, 10);
  await openProject(new TextEncoder().encode(text), `${e.projectName} (plotted ${day}).plot.json`, {
    forget: true,
  });
}
