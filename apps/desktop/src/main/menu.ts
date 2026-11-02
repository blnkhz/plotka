import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
import type { EventChannels } from '@shared/ipc';

type Action = EventChannels['app:menu']['action'];

function send(action: Action, win?: BrowserWindow | null) {
  const target = win ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (target && !target.isDestroyed()) target.webContents.send('app:menu', { action });
}

/**
 * The app menu. Its shortcuts are the only handlers for ⌘O, ⌘S, ⇧⌘S, ⌘Z and ⇧⌘Z; the page
 * decides what each means (e.g. Undo in a text field undoes typing).
 */
export function installMenu() {
  const isMac = process.platform === 'darwin';
  const item = (id: Action, label: string, accelerator: string): MenuItemConstructorOptions => ({
    id,
    label,
    accelerator,
    click: (_item, win) => send(id, win instanceof BrowserWindow ? win : null),
  });
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        item('open', 'Open…', 'CmdOrCtrl+O'),
        { type: 'separator' },
        item('save', 'Save', 'CmdOrCtrl+S'),
        item('saveAs', 'Save As…', 'Shift+CmdOrCtrl+S'),
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        item('undo', 'Undo', 'CmdOrCtrl+Z'),
        item('redo', 'Redo', 'Shift+CmdOrCtrl+Z'),
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
        // No reload item: reloading would throw away unsaved work.
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' as const }]),
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
