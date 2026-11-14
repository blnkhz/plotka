import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type { InvokeChannel, InvokeChannels } from '@shared/ipc';
import type { PlotterService } from './plotter';
import { isProjectPath, project, projectName, updateWindow } from './project';
import { listPorts } from './serial';
import { checkRecovery, clearRecovery, readRecovery, writeRecovery } from './autosave';
import { addRecent, recentItems } from './recent';
import { openPath } from './openFile';
import { deletePlotLog, plotLogEntries, plotLogProject, setPlotLogNote } from './plotLog';
import { allowWatch, allowWatchFromProject, startWatch, stopWatch } from './watch';
import { existsSync } from 'node:fs';
import { extname } from 'node:path';
import { log } from './log';

type Handler<C extends InvokeChannel> = (
  event: Electron.IpcMainInvokeEvent,
  ...args: InvokeChannels[C]['args']
) => Promise<InvokeChannels[C]['result']> | InvokeChannels[C]['result'];

function handle<C extends InvokeChannel>(channel: C, handler: Handler<C>): void {
  ipcMain.handle(channel, (event, ...args) =>
    handler(event, ...(args as InvokeChannels[C]['args'])),
  );
}

export function registerIpcHandlers(
  plotter: PlotterService,
  onRendererReady: () => void = () => undefined,
): void {
  handle('plotter:listPorts', () => listPorts());
  handle('plotter:connect', (_e, port, profile) => plotter.connect(port, profile));
  handle('plotter:disconnect', () => plotter.disconnect());
  handle('plotter:status', () => plotter.status());
  handle('plotter:command', (_e, cmd) => plotter.command(cmd));
  handle('plot:start', (_e, req) => plotter.start(req));
  handle('plot:dryRun', (_e, profile, bounds) => plotter.dryRun(profile, bounds));
  handle('plot:control', (_e, action) => plotter.control(action));
  handle('plotLog:list', () => plotLogEntries());
  handle('plotLog:project', (_e, id) => plotLogProject(id));
  handle('plotLog:note', (_e, id, note) => setPlotLogNote(id, note));
  handle('plotLog:delete', (_e, id) => deletePlotLog(id));

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
    log.info('File opened', { kind: extname(path).toLowerCase(), bytes: bytes.length });
    // Opening a project makes it the current project; opening artwork starts a new one.
    project.path = isProjectPath(path) ? path : null;
    addRecent(path);
    if (isProjectPath(path)) allowWatchFromProject(new TextDecoder().decode(bytes));
    else allowWatch(path);
    return { path, name: basename(path), bytes };
  });

  handle('project:save', async (event, content, saveAs, suggestedName) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    let path = saveAs ? null : project.path;
    if (!path) {
      const opts: Electron.SaveDialogOptions = {
        defaultPath: `${suggestedName}.plot.json`,
        filters: [{ name: 'Plotka project', extensions: ['json'] }],
      };
      const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
      if (r.canceled || !r.filePath) return null;
      path = isProjectPath(r.filePath)
        ? r.filePath
        : r.filePath.replace(/(\.json)?$/i, '.plot.json');
    }
    await writeFile(path, content, 'utf8');
    addRecent(path);
    project.path = path;
    project.name = projectName(path);
    project.dirty = false;
    updateWindow(win);
    return { name: project.name };
  });

  handle('app:rendererReady', () => onRendererReady());
  handle('recent:list', () => {
    const home = app.getPath('home');
    return recentItems().map((r) => {
      const folder = dirname(r.path);
      return { ...r, folder: folder.startsWith(home) ? `~${folder.slice(home.length)}` : folder };
    });
  });
  handle('recent:open', async (event, path) => {
    // Only files already in the list: the page can't ask for any path it likes.
    if (!recentItems().some((r) => r.path === path)) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) await openPath(path, win);
  });
  handle('watch:start', (event, path) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win && typeof path === 'string' ? startWatch(win, path) : false;
  });
  handle('watch:stop', () => stopWatch());
  handle('autosave:write', (_e, content, name) => writeRecovery(content, name));
  handle('autosave:clear', () => clearRecovery());
  handle('autosave:check', () => checkRecovery());
  handle('autosave:read', () => readRecovery());
  // Only lists the file in Open Recent: a dropped file never becomes the path Save writes to.
  handle('file:dropped', (_e, path) => {
    if (typeof path === 'string' && /\.(svg|json)$/i.test(path) && existsSync(path)) {
      addRecent(path);
      if (!/\.plot\.json$/i.test(path)) allowWatch(path);
    }
  });

  handle('project:forget', () => {
    project.path = null;
  });

  handle('project:state', (event, name, dirty) => {
    project.name = name;
    project.dirty = dirty;
    updateWindow(BrowserWindow.fromWebContents(event.sender));
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
