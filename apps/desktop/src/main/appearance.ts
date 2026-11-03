import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, nativeTheme } from 'electron';

/**
 * Light or dark, or follow macOS. Setting `nativeTheme.themeSource` also changes what the page's
 * `prefers-color-scheme` reports, so the stylesheet needs nothing extra.
 */
export type Appearance = 'system' | 'light' | 'dark';

const CHOICES: readonly Appearance[] = ['system', 'light', 'dark'];
const file = () => join(app.getPath('userData'), 'appearance.json');
let current: Appearance | null = null;

function load(): Appearance {
  try {
    const v = (JSON.parse(readFileSync(file(), 'utf8')) as { theme?: unknown }).theme;
    if (CHOICES.includes(v as Appearance)) return v as Appearance;
  } catch {
    // Never chosen, or unreadable: follow the system.
  }
  return 'system';
}

export const appearance = (): Appearance => (current ??= load());

/** Applies the saved choice. Call before the first window opens so it doesn't flash. */
export function applyAppearance() {
  nativeTheme.themeSource = appearance();
}

export function setAppearance(theme: Appearance) {
  current = theme;
  nativeTheme.themeSource = theme;
  try {
    writeFileSync(file(), JSON.stringify({ theme }));
  } catch {
    // Not fatal: the choice just won't survive a restart.
  }
}
