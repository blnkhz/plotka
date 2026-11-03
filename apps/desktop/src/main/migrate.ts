import { existsSync, renameSync } from 'node:fs';

/** The app's name before it was Plotka: its settings folder is moved over once. */
export const OLD_APP_NAME = 'Plotter Studio';

/**
 * Moves the old app's data folder (settings, recent files, recovery copy, plot log, saved
 * profiles) to the new one, if there is an old one and no new one yet. Must run before the app
 * is ready: Electron creates the new folder then. Returns whether it moved.
 */
export function migrateUserData(from: string, to: string): boolean {
  if (from === to || !existsSync(from) || existsSync(to)) return false;
  try {
    renameSync(from, to);
    return true;
  } catch {
    // Not fatal: the app starts with fresh settings and the old folder stays where it was.
    return false;
  }
}
