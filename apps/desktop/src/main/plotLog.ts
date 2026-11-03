import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import type { PlotLogEntry, PlotLogStart } from '@shared/ipc';

/**
 * PLOT-7: the plot log, in the app's data folder: `plot-log/index.json` with one entry per plot
 * (newest first), and each plot's project (settings and artwork) as `<id>.plot.json` beside it.
 */
const MAX_ENTRIES = 200;
const dir = () => join(app.getPath('userData'), 'plot-log');
const indexFile = () => join(dir(), 'index.json');
const projectFile = (id: string) => join(dir(), `${id}.plot.json`);
const validId = (id: string) => /^[a-z0-9-]+$/.test(id);

let entries: PlotLogEntry[] | null = null;

function load(): PlotLogEntry[] {
  try {
    const v = JSON.parse(readFileSync(indexFile(), 'utf8')) as unknown;
    if (Array.isArray(v))
      return v
        .filter(
          (e): e is PlotLogEntry =>
            !!e && typeof e.id === 'string' && validId(e.id) && typeof e.startedAt === 'string',
        )
        .map((e) =>
          // Still "plotting" from an earlier run: the app quit or crashed during the plot.
          e.outcome === 'plotting' ? { ...e, outcome: 'interrupted' as const } : e,
        );
  } catch {
    // No log yet, or unreadable: start empty.
  }
  return [];
}

const all = () => (entries ??= load());

function save() {
  try {
    mkdirSync(dir(), { recursive: true });
    writeFileSync(indexFile(), JSON.stringify(all(), null, 1));
  } catch {
    // Not fatal: the log just won't have this change after a restart.
  }
  const list = all();
  for (const w of BrowserWindow.getAllWindows())
    if (!w.isDestroyed()) w.webContents.send('plotLog:changed', list);
}

export const plotLogEntries = (): PlotLogEntry[] => all();

/** Records a plot that's starting. Returns its id. */
export function beginPlotLog(info: PlotLogStart, now = new Date()): string {
  const id = `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const { project, ...rest } = info;
  try {
    mkdirSync(dir(), { recursive: true });
    writeFileSync(projectFile(id), project);
  } catch {
    // The entry is still useful without its project.
  }
  const list = all();
  list.unshift({
    ...rest,
    id,
    startedAt: now.toISOString(),
    endedAt: null,
    elapsedMs: 0,
    done: 0,
    outcome: 'plotting',
    note: '',
  });
  for (const old of list.splice(MAX_ENTRIES)) rmSync(projectFile(old.id), { force: true });
  save();
  return id;
}

/** Updates a plot's entry as it goes (an error can still be resumed and finish). */
export function updatePlotLog(
  id: string,
  patch: Pick<PlotLogEntry, 'outcome' | 'elapsedMs' | 'done'> & { message?: string },
) {
  const e = all().find((x) => x.id === id);
  if (!e) return;
  const ended = patch.outcome !== 'plotting';
  Object.assign(e, patch, { endedAt: ended ? new Date().toISOString() : null });
  if (patch.outcome !== 'error') delete e.message;
  save();
}

export function plotLogProject(id: string): string | null {
  if (!validId(id)) return null;
  try {
    return readFileSync(projectFile(id), 'utf8');
  } catch {
    return null;
  }
}

export function setPlotLogNote(id: string, note: string) {
  const e = all().find((x) => x.id === id);
  if (!e) return;
  e.note = note.slice(0, 2000);
  save();
}

export function deletePlotLog(id: string) {
  const list = all();
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return;
  list.splice(i, 1);
  rmSync(projectFile(id), { force: true });
  save();
}
