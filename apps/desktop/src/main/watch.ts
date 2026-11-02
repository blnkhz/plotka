import { watch, type FSWatcher } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import type { BrowserWindow } from 'electron';

/**
 * IMPORT-5: watches the open artwork file and sends its new contents when it changes on disk.
 *
 * Only files the main process itself opened (Open dialog, Open Recent, Finder, a verified drop,
 * or the artwork recorded in a project the user opened) can be watched, so the page can't use
 * this to read arbitrary files. The folder is watched rather than the file, because many editors
 * save by writing a new file and renaming it over the old one.
 */
const allowed = new Set<string>();
let current: { path: string; watcher: FSWatcher; timer: NodeJS.Timeout | null } | null = null;

export function allowWatch(path: string) {
  allowed.add(path);
}

/** The artwork path saved in a project file, if any (so reopened projects can auto-reload). */
export function allowWatchFromProject(text: string) {
  try {
    const p = JSON.parse(text) as { source?: { path?: unknown } };
    if (typeof p.source?.path === 'string' && /\.svg$/i.test(p.source.path))
      allowWatch(p.source.path);
  } catch {
    // Not readable: nothing to allow.
  }
}

export function stopWatch() {
  if (!current) return;
  if (current.timer) clearTimeout(current.timer);
  current.watcher.close();
  current = null;
}

export async function startWatch(win: BrowserWindow, path: string): Promise<boolean> {
  stopWatch();
  if (!allowed.has(path)) return false;
  let last: number;
  try {
    last = (await stat(path)).mtimeMs;
  } catch {
    return false;
  }
  const name = basename(path);
  const watcher = watch(dirname(path), (_event, changed) => {
    if (changed && changed !== name) return;
    const c = current;
    if (!c || c.watcher !== watcher) return;
    // Editors often write in several steps: wait until it settles.
    if (c.timer) clearTimeout(c.timer);
    c.timer = setTimeout(async () => {
      c.timer = null;
      try {
        const s = await stat(path);
        if (s.mtimeMs === last) return;
        last = s.mtimeMs;
        const bytes = new Uint8Array(await readFile(path));
        if (current?.watcher === watcher && !win.isDestroyed())
          win.webContents.send('file:changed', { path, bytes });
      } catch {
        // Gone for a moment (mid-save) or deleted: keep watching; the next save will show up.
      }
    }, 300);
  });
  current = { path, watcher, timer: null };
  return true;
}
