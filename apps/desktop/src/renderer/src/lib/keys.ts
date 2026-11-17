/**
 * Keyboard shortcuts as people see them. The app's text is written with macOS symbols
 * (⌘S, ⇧⌘Z, ⌥); on Windows and Linux they read Ctrl+S, Ctrl+Shift+Z, Alt.
 */

export const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);

const NAMES: Record<string, string> = { '⌃': 'Ctrl', '⌘': 'Ctrl', '⌥': 'Alt', '⇧': 'Shift' };
const ORDER = ['Ctrl', 'Alt', 'Shift'];

/**
 * Rewrites the macOS key symbols in a piece of text for this platform. A run of modifiers joins
 * the key after it with "+" ("⇧⌘S" → "Ctrl+Shift+S"); a modifier on its own just gets its name
 * ("hold ⇧", "⇧-click").
 */
export function keyText(text: string, mac = isMac): string {
  if (mac) return text;
  return text.replace(/([⌃⌘⌥⇧]+)([A-Z0-9?]?)/g, (_m, mods: string, key: string) => {
    const names = [...new Set([...mods].map((m) => NAMES[m] ?? m))].sort(
      (a, b) => ORDER.indexOf(a) - ORDER.indexOf(b),
    );
    return [...names, ...(key ? [key] : [])].join('+');
  });
}

/** Whether the platform's command key (⌘ on macOS, Ctrl elsewhere) is held. */
export const commandKey = (e: { metaKey: boolean; ctrlKey: boolean }, mac = isMac) =>
  mac ? e.metaKey : e.ctrlKey;

/** The last part of a file path, with either kind of slash. */
export const fileName = (path: string) => path.split(/[\\/]/).pop() || path;
