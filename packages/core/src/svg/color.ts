const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  lime: '#00ff00',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  aqua: '#00ffff',
  magenta: '#ff00ff',
  fuchsia: '#ff00ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  maroon: '#800000',
  olive: '#808000',
  purple: '#800080',
  teal: '#008080',
  navy: '#000080',
  orange: '#ffa500',
  brown: '#a52a2a',
  pink: '#ffc0cb',
  darkgray: '#a9a9a9',
  darkgrey: '#a9a9a9',
  lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3',
};

const hex2 = (n: number) =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');

/**
 * Normalizes a CSS color to `#rrggbb`. Returns `null` for `none`/`transparent`,
 * and the trimmed input for anything it can't parse (gradients, unknown names).
 */
export function normalizeColor(value: string | undefined): string | null {
  if (value === undefined) return null;
  const v = value.trim().toLowerCase();
  if (v === '' || v === 'none' || v === 'transparent') return null;
  if (NAMED[v]) return NAMED[v];
  let m = /^#([0-9a-f]{3,8})$/.exec(v);
  if (m) {
    const h = m[1]!;
    if (h.length === 3 || h.length === 4)
      return '#' + h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
    if (h.length === 6 || h.length === 8) return '#' + h.slice(0, 6);
  }
  m = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)/.exec(v);
  if (m) {
    const ch = (s: string) => (s.endsWith('%') ? (parseFloat(s) * 255) / 100 : parseFloat(s));
    return '#' + hex2(ch(m[1]!)) + hex2(ch(m[2]!)) + hex2(ch(m[3]!));
  }
  return v;
}
