import { join } from 'node:path';
import { app, BrowserWindow, dialog, shell } from 'electron';
import { registerIpcHandlers } from './ipc';
import { installMenu } from './menu';
import { PlotterService } from './plotter';
import { project } from './project';
import { clearRecovery } from './autosave';
import { isOpenable, openPath } from './openFile';

// Automated tests run with their own data folder, so they never touch the user's settings,
// saved pen heights, recent files or recovery file.
if (process.env['PLOTTER_STUDIO_USER_DATA'])
  app.setPath('userData', process.env['PLOTTER_STUDIO_USER_DATA']);

const plotter = new PlotterService();

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Plotter Studio',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // PLOT-4: closing the window mid-plot asks first; if confirmed, the pen goes up and home.
  let closing = false;
  win.on('close', (e) => {
    // Automated tests close the window themselves; there's nobody to answer a question.
    if (closing || process.env['PLOTTER_STUDIO_E2E']) return;
    if (!plotter.isPlotting()) {
      if (!project.dirty) return;
      const choice = dialog.showMessageBoxSync(win, {
        type: 'warning',
        buttons: ['Cancel', 'Close without saving'],
        defaultId: 0,
        cancelId: 0,
        message: `“${project.name}” has unsaved changes.`,
        detail: 'Save with ⌘S to keep them.',
      });
      if (choice === 0) e.preventDefault();
      // Closing without saving was a deliberate choice: don't offer the work back next time.
      else clearRecovery();
      return;
    }
    e.preventDefault();
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Keep plotting', 'Stop and close'],
      defaultId: 0,
      cancelId: 0,
      message: 'A plot is in progress.',
      detail: 'Closing stops the plot, raises the pen and returns home.',
    });
    if (choice === 1) {
      closing = true;
      void plotter.stopAndWait().finally(() => win.close());
    }
  });

  // Open external links in the default browser, never in the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

// Files opened from Finder or the Dock (also before the window exists).
const pendingOpens: string[] = [];
app.on('open-file', (e, path) => {
  e.preventDefault();
  if (!isOpenable(path)) return;
  if (app.isReady() && BrowserWindow.getAllWindows().length) void openPath(path);
  else pendingOpens.push(path);
});

/** Opens files that arrived before the window was listening. */
export function flushPendingOpens() {
  for (const p of pendingOpens.splice(0)) void openPath(p);
}

void app.whenReady().then(() => {
  registerIpcHandlers(plotter, flushPendingOpens);
  installMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  void plotter.shutdown();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
