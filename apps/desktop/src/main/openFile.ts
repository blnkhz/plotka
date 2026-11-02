import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { BrowserWindow, dialog } from 'electron';
import { isProjectPath, project } from './project';
import { addRecent, removeRecent } from './recent';

/** Files the app can open from Open Recent, the Dock or Finder. */
export const isOpenable = (path: string) => /\.(svg|plot\.json)$/i.test(path);

/**
 * Opens a file chosen outside the Open dialog (Open Recent, Dock, Finder) and sends it to the
 * window, like the dialog would.
 */
export async function openPath(path: string, win = BrowserWindow.getAllWindows()[0]) {
  if (!win || win.isDestroyed()) return;
  if (!existsSync(path)) {
    removeRecent(path);
    await dialog.showMessageBox(win, {
      type: 'warning',
      message: `“${basename(path)}” couldn’t be found.`,
      detail: 'It may have been moved or deleted. It was removed from Open Recent.',
    });
    return;
  }
  const bytes = new Uint8Array(await readFile(path));
  project.path = isProjectPath(path) ? path : null;
  addRecent(path);
  win.webContents.send('file:opened', { path, name: basename(path), bytes });
}
