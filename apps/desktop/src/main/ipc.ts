import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type { InvokeChannel, InvokeChannels } from '@shared/ipc';

type Handler<C extends InvokeChannel> = (
  event: Electron.IpcMainInvokeEvent,
  ...args: InvokeChannels[C]['args']
) => Promise<InvokeChannels[C]['result']> | InvokeChannels[C]['result'];

function handle<C extends InvokeChannel>(channel: C, handler: Handler<C>): void {
  ipcMain.handle(channel, (event, ...args) =>
    handler(event, ...(args as InvokeChannels[C]['args'])),
  );
}

export function registerIpcHandlers(): void {
  handle('app:getInfo', () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
  }));

  handle('file:open', async (event, extensions) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const opts: Electron.OpenDialogOptions = {
      properties: ['openFile'],
      filters: [{ name: 'Artwork', extensions: extensions.map((e) => e.replace(/^\./, '')) }],
    };
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    const path = result.filePaths[0];
    if (result.canceled || !path) return null;
    const bytes = new Uint8Array(await readFile(path));
    return { path, name: basename(path), bytes };
  });
}
