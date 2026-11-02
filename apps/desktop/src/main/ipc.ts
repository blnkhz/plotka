import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type { InvokeChannel, InvokeChannels } from '@shared/ipc';
import type { PlotterService } from './plotter';
import { listPorts } from './serial';

type Handler<C extends InvokeChannel> = (
  event: Electron.IpcMainInvokeEvent,
  ...args: InvokeChannels[C]['args']
) => Promise<InvokeChannels[C]['result']> | InvokeChannels[C]['result'];

function handle<C extends InvokeChannel>(channel: C, handler: Handler<C>): void {
  ipcMain.handle(channel, (event, ...args) =>
    handler(event, ...(args as InvokeChannels[C]['args'])),
  );
}

export function registerIpcHandlers(plotter: PlotterService): void {
  handle('plotter:listPorts', () => listPorts());
  handle('plotter:connect', (_e, port, profileId) => plotter.connect(port, profileId));
  handle('plotter:disconnect', () => plotter.disconnect());
  handle('plotter:status', () => plotter.status());
  handle('plotter:command', (_e, cmd) => plotter.command(cmd));
  handle('plot:start', (_e, req) => plotter.start(req));
  handle('plot:control', (_e, action) => plotter.control(action));

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

  handle('file:saveText', async (event, defaultName, content, extensions) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const opts: Electron.SaveDialogOptions = {
      defaultPath: defaultName,
      filters: [{ name: 'File', extensions: extensions.map((e) => e.replace(/^\./, '')) }],
    };
    const result = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    if (result.canceled || !result.filePath) return null;
    await writeFile(result.filePath, content, 'utf8');
    return result.filePath;
  });
}
