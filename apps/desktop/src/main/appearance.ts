import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, nativeTheme } from 'electron';
import { APPEARANCES, themeBase, type Appearance } from '@shared/themes';

export type { Appearance };

/**
 * Light or dark, a colour theme, or follow macOS. `nativeTheme.themeSource` sets what the page's
 * `prefers-color-scheme` reports (a colour theme sets its own base); the page also gets the theme
 * id, at load in the URL and on a change as an `app:appearance` event.
 */
const file = () => join(app.getPath('userData'), 'appearance.json');
let current: Appearance | null = null;

function load(): Appearance {
  try {
    const v = (JSON.parse(readFileSync(file(), 'utf8')) as { theme?: unknown }).theme;
    if (APPEARANCES.includes(v as Appearance)) return v as Appearance;
  } catch {
    // Never chosen, or unreadable: follow the system.
  }
  return 'system';
}

export const appearance = (): Appearance => (current ??= load());

/** Applies the saved choice. Call before the first window opens so it doesn't flash. */
export function applyAppearance() {
  nativeTheme.themeSource = themeBase(appearance());
}

export function setAppearance(theme: Appearance) {
  current = theme;
  nativeTheme.themeSource = themeBase(theme);
  for (const win of BrowserWindow.getAllWindows())
    if (!win.isDestroyed()) win.webContents.send('app:appearance', { theme });
  try {
    writeFileSync(file(), JSON.stringify({ theme }));
  } catch {
    // Not fatal: the choice just won't survive a restart.
  }
}
