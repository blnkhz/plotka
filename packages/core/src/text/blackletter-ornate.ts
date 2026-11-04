import {
  BLACKLETTER_DEFS,
  BLACKLETTER_NIB_ANGLE,
  glyphMap,
  type Def,
  type Pt,
  type StrokeGlyph,
} from './blackletter';

/**
 * An ornate blackletter: the plain letters (blackletter.ts) dressed up with ornaments that a flat
 * nib makes at its one fixed angle. The plotter never turns the pen, so every ornament is still
 * just a path for the middle of the nib:
 *
 * - thorns: short strokes across the nib, leaving diamonds that stick out from a stem;
 * - hairlines: strokes along the nib's edge (up-right at 40°) for forked ascenders, joins
 *   between letters and fine lines across the counters;
 * - swashes and curls: curves whose thickness swells and thins as they turn against the
 *   fixed nib, for the capitals' flourishes and the descenders' tails.
 *
 * Same units as the plain letters: nib widths, y down, baseline 0, capitals 7 tall. Swashes
 * reach about a nib width above the capitals and below the descenders, so lines sit a little
 * further apart.
 */

const A = (BLACKLETTER_NIB_ANGLE * Math.PI) / 180;
const ALONG: Pt = [Math.cos(A), -Math.sin(A)];

/** A hairline: along the nib's edge from x, y, `len` nib widths (negative: down-left). */
const hair = (x: number, y: number, len: number): Pt[] => [
  [x, y],
  [x + len * ALONG[0], y + len * ALONG[1]],
];
/** A thorn: a diamond sticking out to the left of a stem whose middle is at x. */
const thorn = (x: number, y: number): Pt[] => [
  [x - 1.05, y - 0.25],
  [x - 0.5, y + 0.3],
];
/** A small diamond (its top-left corner at x, y). */
const pip = (x: number, y: number): Pt[] => [
  [x, y],
  [x + 0.4, y + 0.4],
];
/** A cubic Bézier swash, as a polyline. */
function swash(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 14): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    out.push([
      a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
      a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    ]);
  }
  return out;
}
/** A capital's lead-in: a curl out to the left and up over the stem's head at x. */
const crest = (x: number): Pt[] =>
  swash([x - 0.7, -6.6], [x - 2, -6.3], [x - 2.2, -8.1], [x - 0.3, -8.1]);
/** A curl at the end of a stroke at x, y, turning back under it (down and left, then up). */
const tailCurl = (x: number, y: number): Pt[] =>
  swash([x, y], [x - 1, y - 0.4], [x - 1.1, y - 1.4], [x - 0.3, y - 1.2], 10);
/** A curl at the end of a stroke at x, y, swinging right and back over it. */
const rightCurl = (x: number, y: number): Pt[] =>
  swash([x, y], [x + 0.9, y - 0.5], [x + 0.7, y - 1.5], [x - 0.1, y - 1.2], 10);

/** Ornaments added to each letter (in the plain letter's coordinates). */
// prettier-ignore
const LOWER: Record<string, Pt[][]> = {
  // Forked ascenders: a hairline off the top of the stem.
  b: [hair(0.5, -7.1, 1)],
  d: [hair(0.6, -7.5, 0.9)],
  h: [hair(0.5, -7.1, 1), tailCurl(1.6, 2.3)],
  k: [hair(0.5, -7.1, 1)],
  l: [hair(0.5, -7.1, 1)],
  f: [swash([2.3, -7], [3, -6.7], [3.1, -7.5], [2.6, -7.8], 8), hair(1.6, -5, 0.6)],
  t: [hair(0.5, -6.3, 0.8), hair(1.7, -5, 0.6)],
  // Dots with a hairline flick.
  i: [hair(0.8, -6.15, 0.7)],
  j: [hair(0.8, -6.15, 0.7), swash([-0.3, 2.5], [-1.2, 2.3], [-1.3, 1.3], [-0.5, 1.4], 10)],
  // Descenders end in curls.
  g: [swash([0.2, 2], [-0.8, 1.6], [-0.7, 0.6], [0.2, 0.9], 10)],
  y: [swash([0.4, 2], [-0.6, 1.6], [-0.5, 0.6], [0.4, 0.9], 10)],
  p: [hair(1.2, 2.5, 0.8), hair(-0.2, 2.5, -0.6)],
  q: [hair(3, 2.5, 0.8), hair(1.6, 2.5, -0.6)],
  // Hairline flicks (not through o's counter: it would read as ø).
  a: [hair(0.95, -0.7, 1)],
  s: [hair(2.3, -4.6, 0.6), hair(0.2, -0.4, -0.5)],
  z: [hair(0, -4.6, -0.5)],
};

/** Letters whose last stroke ends in a foot on the baseline: a hairline joins them onward. */
const JOINED = 'acdehiklmnrtuxz';

// prettier-ignore
const CAPS: Record<string, Pt[][]> = {
  A: [thorn(0.8, -4.2), hair(1.2, -0.9, 2), swash([2.2, -7], [2.8, -8.2], [4.4, -8.3], [4.8, -7.3]), hair(3.9, 0, 0.9)],
  B: [crest(1), thorn(1, -5.5), thorn(1, -2.2), hair(1.4, -4.4, 1.5), hair(1.4, -0.7, 2)],
  C: [thorn(0.6, -3.5), hair(2.1, -1.4, 1.6), swash([3.4, -6.4], [4, -7.5], [3, -8.3], [2.2, -7.6]), hair(3.6, -0.6, 0.6)],
  D: [swash([0.2, -6.4], [-0.9, -6], [-1.1, -7.9], [0.4, -8]), hair(1.4, -1.2, 2.6), pip(2.4, -5.6)],
  E: [thorn(0.6, -5), thorn(0.6, -2), hair(2.1, -4.6, 1.1), hair(2.1, -1, 1.2), rightCurl(3.4, -5.4)],
  F: [crest(1), thorn(1, -5.2), hair(2.8, -3.8, 0.9), swash([3.9, -6.5], [4.5, -7.5], [3.6, -8.3], [2.8, -7.6]), tailCurl(0.4, 0.3)],
  G: [thorn(0.6, -3.5), hair(2.1, -4.6, 1.2), swash([3.4, -6.4], [4, -7.5], [3, -8.3], [2.2, -7.6]), hair(2.4, -3.2, -0.6)],
  H: [crest(1), thorn(1, -3), swash([2.6, 0], [3.6, 0.8], [4.5, 0.2], [4.2, -0.6], 10), hair(1.5, -0.9, 1.1)],
  I: [thorn(1.5, -3.5), tailCurl(0.6, 0), swash([2.8, -7], [3.7, -7.4], [3.5, -8.4], [2.6, -8], 10)],
  J: [thorn(2, -4), swash([2.8, -7], [3.7, -7.4], [3.5, -8.4], [2.6, -8], 10), swash([0.2, 1.8], [-0.7, 1.2], [-0.5, 0.2], [0.4, 0.4], 10)],
  K: [crest(1), thorn(1, -5.2), swash([3.4, -7], [3.9, -7.9], [4.7, -7.7], [4.6, -7], 8), hair(3.6, 0, 0.9)],
  L: [crest(1), thorn(1, -4), hair(1.5, -1.6, 1.1), swash([3.9, -0.6], [4.4, -1.5], [3.8, -2.1], [3.3, -1.6], 8)],
  M: [crest(0.9), thorn(0.9, -3.5), hair(2.6, -0.8, 0.9), hair(4.8, 0, 0.9)],
  N: [crest(0.9), thorn(0.9, -3.5), hair(1.3, -1, 1.8), hair(3.7, 0, 0.9)],
  O: [thorn(0.6, -3.5), swash([1.8, -7], [2.4, -8.1], [3.7, -8.3], [4.1, -7.4])],
  P: [crest(1), thorn(1, -4.5), hair(1.4, -3.8, 2), tailCurl(0.4, 0)],
  Q: [thorn(0.6, -3.5), swash([1.8, -7], [2.4, -8.1], [3.7, -8.3], [4.1, -7.4]), swash([4, 0.6], [4.9, 0.2], [4.9, -0.7], [4.2, -0.6], 8)],
  R: [crest(1), thorn(1, -4.5), hair(1.4, -3.8, 2), hair(3.8, 0, 0.9)],
  S: [hair(1.6, -5.6, 1.2), hair(1.4, -1.4, 1.4), swash([3.4, -6.4], [4, -7.5], [3, -8.3], [2.2, -7.6]), swash([0.3, -0.6], [-0.5, -1.2], [-0.3, -2.3], [0.6, -2], 8)],
  T: [thorn(2, -3.5), swash([0.2, -6.2], [-0.5, -5.3], [-1.1, -6.4], [-0.4, -7.1], 8), swash([4.2, -6.4], [4.9, -7.3], [4.5, -8.1], [3.6, -7.8], 8), hair(2.6, 0, 0.8)],
  U: [crest(0.9), thorn(0.9, -3.5), hair(3.9, 0, 0.9), pip(1.9, -5.8)],
  V: [crest(0.9), thorn(0.9, -3.5), swash([2.8, -7], [2.6, -7.9], [3.5, -8.5], [4.1, -7.8], 8), pip(1.9, -5.8)],
  W: [crest(0.9), thorn(0.9, -3.5), swash([4.5, -7], [4.3, -7.9], [5.2, -8.5], [5.8, -7.8], 8)],
  X: [swash([0.3, -6.8], [-0.5, -6.4], [-0.9, -7.7], [0, -8.1], 8), tailCurl(0.4, 0), hair(3.9, 0, 0.9)],
  Y: [crest(0.9), thorn(0.9, -3.5), swash([1, 2], [-0.1, 1.6], [-0.1, 0.6], [0.8, 0.8], 10)],
  Z: [swash([0.3, -6.4], [-0.5, -5.6], [-1, -6.8], [-0.2, -7.4], 8), swash([3.9, -0.6], [4.4, -1.5], [3.8, -2.1], [3.3, -1.6], 8), hair(3.2, -3.5, 0.8)],
};

/** How far capitals move right, to leave room for the swashes on their left. */
const CAP_LEAD = 1.4;

const shift = (strokes: Pt[][], dx: number): Pt[][] =>
  strokes.map((s) => s.map(([x, y]): Pt => [x + dx, y]));

function ornate(): Record<string, Def> {
  const out: Record<string, Def> = {};
  for (const [ch, d] of Object.entries(BLACKLETTER_DEFS)) {
    if (CAPS[ch]) {
      out[ch] = {
        advance: d.advance + CAP_LEAD,
        strokes: shift([...d.strokes, ...CAPS[ch]], CAP_LEAD),
      };
      continue;
    }
    const extra = [...(LOWER[ch] ?? [])];
    if (JOINED.includes(ch)) {
      // The rightmost point on the baseline: the last foot. A short hairline leads on from it.
      let end: Pt | null = null;
      for (const s of d.strokes)
        for (const p of s) if (p[1] > -0.7 && p[1] < 0.2 && (!end || p[0] > end[0])) end = p;
      if (end) extra.push(hair(end[0], end[1], 0.6));
    }
    out[ch] = { advance: d.advance, strokes: [...d.strokes, ...extra] };
  }
  return out;
}

const glyphs = glyphMap(ornate());

/** The ornate glyph for a character, in nib widths (y down, baseline 0), if there is one. */
export function ornateGlyph(ch: string): StrokeGlyph | undefined {
  return glyphs.get(ch);
}
