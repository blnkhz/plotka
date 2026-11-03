import { basename } from 'node:path';
import type { BrowserWindow } from 'electron';

/**
 * The open project, as the main process knows it. The path only ever comes from the main
 * process's own open and save dialogs, so the renderer can't ask to write anywhere else.
 */
export const project = {
  path: null as string | null,
  dirty: false,
  name: 'Untitled',
};

export const isProjectPath = (p: string) => p.toLowerCase().endsWith('.plot.json');

export function projectName(path: string) {
  return basename(path).replace(/\.plot\.json$/i, '');
}

/** Window title and the macOS "edited" dot. */
export function updateWindow(win: BrowserWindow | null) {
  if (!win || win.isDestroyed()) return;
  win.setTitle(`${project.name}${project.dirty ? ' (edited)' : ''} — Plotka`);
  win.setDocumentEdited(project.dirty);
  if (project.path) win.setRepresentedFilename(project.path);
  else win.setRepresentedFilename('');
}
