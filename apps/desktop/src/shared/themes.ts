/**
 * The app's appearance: follow macOS, plain light or dark, or one of the colour themes. Each
 * colour theme is light or dark underneath, so native controls and scrollbars match it. Its
 * colours are in `renderer/src/styles/global.css` under `:root[data-theme='<id>']`.
 */
export const THEMES = [
  { id: 'matcha', label: 'Matcha Mauve', base: 'light' },
  { id: 'cyber', label: 'Cyber Lime', base: 'dark' },
  { id: 'butter', label: 'Butter Cobalt', base: 'light' },
  { id: 'bubblegum', label: 'Bubblegum Tomato', base: 'light' },
  { id: 'ube', label: 'Ube Mint', base: 'dark' },
  { id: 'ice', label: 'Ice Tangerine', base: 'light' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];
export type Appearance = 'system' | 'light' | 'dark' | ThemeId;

export const APPEARANCES: readonly Appearance[] = [
  'system',
  'light',
  'dark',
  ...THEMES.map((t) => t.id),
];

/** What `nativeTheme.themeSource` should be for an appearance. */
export function themeBase(a: Appearance): 'system' | 'light' | 'dark' {
  if (a === 'system' || a === 'light' || a === 'dark') return a;
  return THEMES.find((t) => t.id === a)!.base;
}

/** The `data-theme` value for the page, or null for the plain system / light / dark colours. */
export function themeAttr(a: Appearance): ThemeId | null {
  return a === 'system' || a === 'light' || a === 'dark' ? null : a;
}
