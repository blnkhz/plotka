import type { Vec2 } from '../geometry/vec2';
import { createLayer, type Layer, type Polyline, type TextItem } from '../model';
import { HERSHEY_DATA } from './hershey-data';

/**
 * LATER-6: single-stroke text in the Hershey fonts. Text becomes plain lines in mm, so it plots
 * cleanly (one pen pass per stroke, no outlines to fill).
 */

export type HersheyFont = keyof typeof HERSHEY_DATA;
export const HERSHEY_FONTS: { id: HersheyFont; name: string }[] = (
  Object.keys(HERSHEY_DATA) as HersheyFont[]
).map((id) => ({ id, name: HERSHEY_DATA[id].name }));

export type TextAlign = 'left' | 'center' | 'right';

export type TextOptions = {
  font: HersheyFont;
  /** Height of capital letters, mm. */
  size: number;
  /** Distance between lines, as a multiple of the font's normal line height. */
  lineSpacing?: number;
  /** Extra space between letters, mm. */
  letterSpacing?: number;
  align?: TextAlign;
};

/** Hershey units: capitals run from −12 to the baseline at 9. */
const CAP_HEIGHT = 21;
const BASELINE = 9;
/** Normal line height (the fonts span about −16 to 16). */
const LINE_HEIGHT = 32;

type Glyph = { advance: number; strokes: Vec2[][] };
const cache = new Map<string, Glyph>();

function glyph(font: HersheyFont, code: number): Glyph {
  const key = `${font}:${code}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const data: readonly string[] = HERSHEY_DATA[font].glyphs;
  const g = data[code - 32] ?? data['?'.charCodeAt(0) - 32]!;
  const v = (c: string) => c.charCodeAt(0) - 82; // 'R'
  const left = v(g[0]!);
  const right = v(g[1]!);
  const strokes: Vec2[][] = [];
  let cur: Vec2[] = [];
  for (let i = 2; i + 1 < g.length; i += 2) {
    if (g[i] === ' ' && g[i + 1] === 'R') {
      if (cur.length > 1) strokes.push(cur);
      cur = [];
      continue;
    }
    cur.push({ x: v(g[i]!) - left, y: v(g[i + 1]!) });
  }
  if (cur.length > 1) strokes.push(cur);
  const out = { advance: right - left, strokes };
  cache.set(key, out);
  return out;
}

/** A character the fonts have (printable ASCII); accented letters lose their accents. */
function codeOf(ch: string): number {
  const c = ch.charCodeAt(0);
  if (c >= 32 && c <= 126) return c;
  if (ch === '\t') return 32;
  const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const b = base.charCodeAt(0);
  if (base.length === 1 && b >= 32 && b <= 126) return b;
  const similar: Record<string, string> = {
    '‘': "'",
    '’': "'",
    '“': '"',
    '”': '"',
    '–': '-',
    '—': '-',
    '…': '.',
    ß: 's',
    æ: 'a',
    œ: 'o',
    ø: 'o',
    Ø: 'O',
    Æ: 'A',
    Œ: 'O',
    '×': 'x',
    '•': '*',
  };
  return (similar[ch] ?? '?').charCodeAt(0);
}

export type TextLayout = {
  /** The text's strokes in mm; the first line's capitals start at y = 0, x = 0 at the left. */
  lines: Polyline[];
  width: number;
  height: number;
};

/**
 * Lays text out in lines (on '\n'). Origin: the top of the first line's capitals, at the left of
 * the text block (each line is aligned within the widest one).
 */
export function layoutText(text: string, o: TextOptions): TextLayout {
  const s = Math.max(o.size, 0.01) / CAP_HEIGHT;
  const gap = o.letterSpacing ?? 0;
  const lineH = LINE_HEIGHT * s * (o.lineSpacing ?? 1);
  const rows = text.replace(/\r\n?/g, '\n').split('\n');
  const measured = rows.map((row) => {
    const chars = [...row].map((ch) => glyph(o.font, codeOf(ch)));
    const width =
      chars.reduce((w, g) => w + g.advance * s, 0) + Math.max(0, chars.length - 1) * gap;
    return { chars, width };
  });
  const width = Math.max(0, ...measured.map((m) => m.width));
  const lines: Polyline[] = [];
  measured.forEach(({ chars, width: w }, r) => {
    let x = o.align === 'center' ? (width - w) / 2 : o.align === 'right' ? width - w : 0;
    // Capitals' top at the row's top: Hershey y −12 → 0.
    const top = r * lineH + (CAP_HEIGHT - BASELINE) * s;
    for (const g of chars) {
      for (const st of g.strokes)
        lines.push({
          points: st.map((p) => ({ x: x + p.x * s, y: top + p.y * s })),
          closed: false,
        });
      x += g.advance * s + gap;
    }
  });
  const height = rows.length ? (rows.length - 1) * lineH + o.size : 0;
  return { lines, width, height };
}

const isFont = (f: string): f is HersheyFont => f in HERSHEY_DATA;

/** The layer for a text item: its strokes on the paper. Layer id: `text-<item id>`. */
export function textLayer(item: TextItem): Layer {
  const { lines } = layoutText(item.text, {
    font: isFont(item.font) ? item.font : 'sans',
    size: item.size,
    lineSpacing: item.lineSpacing,
    letterSpacing: item.letterSpacing,
    align: item.align,
  });
  const first = item.text.split('\n')[0]!.trim();
  const name = first.length > 24 ? `${first.slice(0, 23)}…` : first || 'Text';
  const layer = createLayer(`text-${item.id}`, `“${name}”`, '#000000');
  layer.strokes = lines.map((l) => ({
    ...l,
    points: l.points.map((p) => ({ x: p.x + item.x, y: p.y + item.y })),
  }));
  layer.text = item;
  return layer;
}

/** The document with its text layers replaced by those of `texts` (after the artwork's). */
export function withTexts<T extends { layers: Layer[] }>(doc: T, texts: readonly TextItem[]): T {
  return { ...doc, layers: [...doc.layers.filter((l) => !l.text), ...texts.map(textLayer)] };
}
