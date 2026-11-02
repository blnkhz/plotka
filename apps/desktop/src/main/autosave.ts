import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

/**
 * PROJ-4 autosave: unsaved work is written to a recovery file in the app's data folder (never
 * over the user's own files), and offered back on the next start if the app didn't close
 * cleanly.
 */
const dir = () => join(app.getPath('userData'), 'autosave');
const contentFile = () => join(dir(), 'recovery.plot.json');
const metaFile = () => join(dir(), 'recovery.json');

export type RecoveryInfo = { name: string; savedAt: string };

export function writeRecovery(content: string, name: string) {
  mkdirSync(dir(), { recursive: true });
  writeFileSync(contentFile(), content, 'utf8');
  writeFileSync(metaFile(), JSON.stringify({ name, savedAt: new Date().toISOString() }));
}

export function clearRecovery() {
  rmSync(contentFile(), { force: true });
  rmSync(metaFile(), { force: true });
}

export function checkRecovery(): RecoveryInfo | null {
  try {
    const meta = JSON.parse(readFileSync(metaFile(), 'utf8')) as Partial<RecoveryInfo>;
    readFileSync(contentFile()); // must exist too
    if (typeof meta.name === 'string' && typeof meta.savedAt === 'string')
      return { name: meta.name, savedAt: meta.savedAt };
  } catch {
    // Nothing to recover.
  }
  return null;
}

export function readRecovery(): string | null {
  try {
    return readFileSync(contentFile(), 'utf8');
  } catch {
    return null;
  }
}
