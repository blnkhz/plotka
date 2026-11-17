import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
import type { EventChannels } from '@shared/ipc';
import { THEMES, type Appearance } from '@shared/themes';
import { appearance, setAppearance } from './appearance';
import { openPath } from './openFile';
import { reportProblem, revealLog } from './log';
import { clearRecent, onRecentChange, recentItems } from './recent';

type Action = EventChannels['app:menu']['action'];

function send(action: Action, win?: BrowserWindow | null) {
  const target = win ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (target && !target.isDestroyed()) target.webContents.send('app:menu', { action });
}

/**
 * The app menu. Its shortcuts are the only handlers for ⌘O, ⌘S, ⇧⌘S, ⌘Z and ⇧⌘Z (Ctrl+Y on
 * Windows and Linux, where the page handles Ctrl+Shift+Z); the page decides what each means (e.g. Undo in a text field undoes typing).
 */
export function installMenu() {
  build();
  onRecentChange(build);
}

function build() {
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
        {
          label: 'Open Recent',
          id: 'openRecent',
          submenu: [
            ...recentItems().map((r, i): MenuItemConstructorOptions => ({
              id: `recent-${i}`,
              label: r.name,
              toolTip: r.path,
              click: () => void openPath(r.path),
            })),
            ...(recentItems().length ? [{ type: 'separator' as const }] : []),
            { label: 'Clear Menu', enabled: recentItems().length > 0, click: () => clearRecent() },
          ],
        },
        { type: 'separator' },
        item('save', 'Save', 'CmdOrCtrl+S'),
        item('saveAs', 'Save As…', 'Shift+CmdOrCtrl+S'),
        { type: 'separator' },
        item('exportSvg', 'Export SVG…', 'CmdOrCtrl+E'),
        item('exportJson', 'Export Toolpath JSON…', 'Shift+CmdOrCtrl+E'),
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        item('undo', 'Undo', 'CmdOrCtrl+Z'),
        // Windows' usual Redo is Ctrl+Y; the page also takes Ctrl+Shift+Z there (App.tsx).
        item('redo', 'Redo', isMac ? 'Shift+Cmd+Z' : 'Ctrl+Y'),
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
        {
          label: 'Appearance',
          // One radio group: the system, light and dark, then the colour themes.
          submenu: [
            ...appearanceItems([
              ['system', 'Use System Setting'],
              ['light', 'Light'],
              ['dark', 'Dark'],
            ]),
            { type: 'separator' },
            ...appearanceItems(THEMES.map((t) => [t.id, t.label] as const)),
          ],
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        // No reload item: reloading would throw away unsaved work.
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' as const }]),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        item('help', 'Plotka Help', 'CmdOrCtrl+Shift+/'),
        { type: 'separator' },
        // For bug reports: the log has the versions, connections, plots and errors.
        { label: 'Show Log File', click: () => revealLog() },
        { label: 'Report a Problem…', click: () => reportProblem() },
        // On macOS, About is in the app menu.
        ...(isMac ? [] : [{ type: 'separator' as const }, { role: 'about' as const }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function appearanceItems(items: readonly (readonly [Appearance, string])[]) {
  return items.map(([theme, label]): MenuItemConstructorOptions => ({
    id: `appearance-${theme}`,
    label,
    type: 'radio',
    checked: appearance() === theme,
    click: () => setAppearance(theme),
  }));
}
