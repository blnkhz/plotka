import { join } from 'node:path';
import { app, BrowserWindow, dialog, shell } from 'electron';
import { registerIpcHandlers } from './ipc';
import { PlotterService } from './plotter';

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
    if (closing || !plotter.isPlotting()) return;
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

void app.whenReady().then(() => {
  registerIpcHandlers(plotter);
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
