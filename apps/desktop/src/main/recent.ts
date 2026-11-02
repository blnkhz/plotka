import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { app } from 'electron';

/** PROJ-4: the last files opened or saved (projects and artwork), newest first. */
export type RecentItem = { path: string; name: string };

const MAX = 10;
const file = () => join(app.getPath('userData'), 'recent.json');
let items: RecentItem[] | null = null;
const listeners = new Set<() => void>();

function load(): RecentItem[] {
  try {
    const v = JSON.parse(readFileSync(file(), 'utf8')) as unknown;
    if (Array.isArray(v))
      return v
        .filter(
          (i): i is RecentItem => !!i && typeof i.path === 'string' && typeof i.name === 'string',
        )
        .slice(0, MAX);
  } catch {
    // No list yet, or unreadable: start empty.
  }
  return [];
}

function save() {
  try {
    writeFileSync(file(), JSON.stringify(items, null, 1));
  } catch {
    // Not fatal: the list just won't survive a restart.
  }
  for (const l of listeners) l();
}

export const recentItems = (): RecentItem[] => (items ??= load());

export function onRecentChange(listener: () => void) {
  listeners.add(listener);
}

export function addRecent(path: string) {
  items = [{ path, name: basename(path) }, ...recentItems().filter((i) => i.path !== path)].slice(
    0,
    MAX,
  );
  app.addRecentDocument(path);
  save();
}

export function removeRecent(path: string) {
  items = recentItems().filter((i) => i.path !== path);
  save();
}

export function clearRecent() {
  items = [];
  app.clearRecentDocuments();
  save();
}
