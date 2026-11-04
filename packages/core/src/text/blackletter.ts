import type { Vec2 } from '../geometry/vec2';

/**
 * A Textura-like blackletter made only of broad-nib strokes: each letter is the path the middle
 * of a flat nib (a Pilot Parallel pen) follows, not an outline. The thick stems, diamond feet and
 * hairlines come from the nib itself, held at about 40°, so the strokes only make sense drawn
 * with one.
 *
 * Units are nib widths, y down: the baseline is at 0, the x-height at −5, capitals and ascenders
 * at −7, descenders at +2.5. So capitals are 7 nib widths tall, the usual Textura proportion.
 * Most letters start their first stem at x = 0.5 and end 1.3 past their last stem, so that stems
 * of neighbouring letters sit as far apart as the stems inside a letter (Textura's even picket
 * fence).
 */

export type Pt = [number, number];
export type Def = { advance: number; strokes: Pt[][] };

/** Capital height in nib widths. */
export const BLACKLETTER_CAP_NIBS = 7;
/** The nib angle the letters are drawn for, degrees counterclockwise from horizontal. */
export const BLACKLETTER_NIB_ANGLE = 40;

/** A minim: diamond head, straight stem, diamond foot. Stem centered on x. */
const minim = (x: number, top = -5, bottom = 0): Pt[] => [
  [x - 0.5, top],
  [x, top + 0.5],
  [x, bottom - 0.5],
  [x + 0.5, bottom],
];
/** A small diamond (a dot, an i's tittle, a full stop), its top-left corner at x, y. */
const dot = (x: number, y: number): Pt[] => [
  [x, y],
  [x + 0.55, y + 0.55],
];
/** The hairline-and-stem arch of n, m, h: from the stem at x1 over to a stem at x2. */
const arch = (x1: number, x2: number, top = -5, bottom = 0): Pt[] => [
  [x1, top + 0.8],
  [x2 - 0.5, top],
  [x2, top + 0.5],
  [x2, bottom - 0.5],
  [x2 + 0.5, bottom],
];
/** An ascender stem with a diamond head, ending in a foot (b, h, k, l). */
const ascender = (x: number, bottom = 0): Pt[] => [
  [x - 0.5, -7.6],
  [x, -7.1],
  [x, bottom - 0.5],
  [x + 0.5, bottom],
];
/** The left half of an o: top hairline, stem, thick foot. */
const leftBowl = (top = -5, bottom = 0): Pt[] => [
  [1.5, top - 0.1],
  [0.5, top + 0.6],
  [0.5, bottom - 0.6],
  [1.3, bottom],
];
/** The right half of an o: thick head, stem, hairline back in. */
const rightBowl = (top = -5, bottom = 0): Pt[] => [
  [1.3, top],
  [2.3, top + 0.6],
  [2.3, bottom - 0.6],
  [1.5, bottom + 0.1],
];
/** The bowl of b and p, from their stem. */
const stemBowl: Pt[] = [
  [0.5, -4.2],
  [1.5, -5],
  [2.3, -4.4],
  [2.3, -0.6],
  [1.3, 0.1],
  [0.5, -0.3],
];

/** Capital O's halves, and the inner hairline that doubles its stems. */
const capLeft: Pt[] = [
  [2.2, -7],
  [0.6, -6],
  [0.6, -1],
  [2, 0],
];
const capRight: Pt[] = [
  [1.8, -7],
  [3.6, -6],
  [3.6, -1],
  [2.2, 0],
];
const capC: Pt[] = [
  [3.4, -6.4],
  [2.6, -7],
  [1.6, -7],
  [0.6, -6],
  [0.6, -1],
  [1.6, 0],
  [2.8, 0],
  [3.6, -0.6],
];
const inner = (x: number, top = -6, bottom = -1): Pt[] => [
  [x, top],
  [x, bottom],
];
/** A capital's main stem with a hairline lead-in at the top and a foot. */
const capStem = (x: number, bottom = 0): Pt[] => [
  [x - 0.7, -6.6],
  [x, -7],
  [x, bottom - 0.5],
  [x - 0.6, bottom],
];
/** A capital's bowl on the stem at x = 1 (P, R), down to y. */
const capBowl = (y: number): Pt[] => [
  [1, -7],
  [2.6, -7],
  [3.4, -6.2],
  [3.4, y + 0.6],
  [2.6, y],
  [1, y],
];

// One stroke per line reads like the letter's ductus; prettier would put every point on its own.
// prettier-ignore
const DEFS: Record<string, Def> = {
  ' ': { advance: 2.2, strokes: [] },

  // Lowercase: the minims, arches and broken bowls of Textura.
  a: {
    advance: 3.6,
    strokes: [
      [[0.2, -4.4], [1, -5.1], [2.3, -4.5], [2.3, -0.5], [2.8, 0]],
      [[2.3, -2.9], [0.5, -2.2], [0.5, -0.6], [1.1, 0], [2.3, -0.6]],
    ],
  },
  b: { advance: 3.6, strokes: [ascender(0.5, 0.2), stemBowl] },
  c: {
    advance: 3.1,
    strokes: [
      [...leftBowl(), [2.2, -0.5]],
      [[1.2, -5], [2.2, -4.5], [2.2, -4]],
    ],
  },
  d: {
    advance: 3.6,
    strokes: [leftBowl(), [[0.6, -7.5], [2, -5.4], [2.3, -4.4], [2.3, -0.6], [1.5, 0.1]]],
  },
  e: {
    advance: 3.1,
    strokes: [
      [...leftBowl(), [2.2, -0.5]],
      [[1.2, -5], [2.2, -4.4], [2.2, -3.6], [0.5, -2.6]],
    ],
  },
  f: {
    advance: 2.6,
    strokes: [
      [[2.3, -7], [1.2, -7.5], [0.5, -6.6], [0.5, -0.5], [1, 0]],
      [[-0.2, -5], [1.6, -5]],
    ],
  },
  g: {
    advance: 3.6,
    strokes: [
      [[1.5, -5.1], [0.5, -4.4], [0.5, -1.6], [1.3, -1], [2.3, -1.4]],
      [[1.3, -5], [2.3, -4.4], [2.3, 1.6], [1.4, 2.5], [0.2, 2]],
    ],
  },
  h: {
    advance: 3.6,
    strokes: [ascender(0.5), [[0.5, -4.2], [1.8, -5], [2.3, -4.5], [2.3, 1.5], [1.6, 2.3]]],
  },
  i: { advance: 1.8, strokes: [minim(0.5), dot(0.25, -6.7)] },
  j: {
    advance: 1.8,
    strokes: [
      [[0, -5], [0.5, -4.5], [0.5, 1.6], [-0.3, 2.5]],
      dot(0.25, -6.7),
    ],
  },
  k: {
    advance: 3.4,
    strokes: [
      ascender(0.5),
      [[0.5, -3], [1.8, -5], [2.3, -4.4], [0.6, -2.6]],
      [[1.1, -2.9], [2.3, -0.5], [2.8, 0]],
    ],
  },
  l: { advance: 1.8, strokes: [ascender(0.5)] },
  m: { advance: 5.4, strokes: [minim(0.5), arch(0.5, 2.3), arch(2.3, 4.1)] },
  n: { advance: 3.6, strokes: [minim(0.5), arch(0.5, 2.3)] },
  o: { advance: 3.6, strokes: [leftBowl(), rightBowl()] },
  p: {
    advance: 3.6,
    strokes: [
      [[0, -5], [0.5, -4.5], [0.5, 2.5]],
      [[-0.2, 2.5], [1.2, 2.5]],
      stemBowl,
    ],
  },
  q: {
    advance: 3.6,
    strokes: [
      [...leftBowl(), [2.3, -0.4]],
      [[1.5, -5], [2.3, -4.5], [2.3, 2.5]],
      [[1.6, 2.5], [3, 2.5]],
    ],
  },
  r: {
    advance: 2.7,
    strokes: [minim(0.5), [[0.5, -4.3], [1.4, -5], [2.1, -4.4]]],
  },
  s: {
    advance: 3.1,
    strokes: [
      [[2.3, -4.6], [1.6, -5.1], [0.5, -4.5], [0.5, -3.6], [2.3, -1.6], [2.3, -0.6], [1.2, 0], [0.2, -0.4]],
    ],
  },
  t: {
    advance: 2.6,
    strokes: [
      [[0.5, -6.3], [0.5, -0.5], [1, 0], [1.7, -0.4]],
      [[-0.2, -5], [1.7, -5]],
    ],
  },
  u: {
    advance: 3.6,
    strokes: [
      [[0, -5], [0.5, -4.5], [0.5, -0.5], [1, 0], [2.3, -0.8]],
      minim(2.3),
    ],
  },
  v: {
    advance: 3.6,
    strokes: [
      [[0, -5], [0.5, -4.5], [0.5, -0.8], [1.3, 0]],
      [[1.8, -5], [2.3, -4.5], [2.3, -1], [1.3, 0]],
    ],
  },
  w: {
    advance: 5.4,
    strokes: [
      [[0, -5], [0.5, -4.5], [0.5, -0.5], [1, 0], [2.3, -0.8]],
      [[1.8, -5], [2.3, -4.5], [2.3, -0.8], [3.1, 0]],
      [[3.6, -5], [4.1, -4.5], [4.1, -1], [3.1, 0]],
    ],
  },
  x: {
    advance: 3.6,
    strokes: [
      [[0, -5], [0.5, -4.5], [2.3, -0.5], [2.8, 0]],
      [[2.6, -5], [0, 0]],
    ],
  },
  y: {
    advance: 3.6,
    strokes: [
      [[0, -5], [0.5, -4.5], [0.5, -0.5], [1, 0], [2.3, -0.8]],
      [[1.8, -5], [2.3, -4.5], [2.3, 1.6], [1.4, 2.5], [0.4, 2]],
    ],
  },
  z: {
    advance: 3.4,
    strokes: [[[0, -4.6], [0.6, -5], [2.3, -4.6], [0.4, -0.4], [2.2, 0], [2.8, -0.4]]],
  },

  // Capitals: wider, with doubled (hairline) stems where Textura has them.
  A: {
    advance: 4.7,
    strokes: [
      [[0.3, 0], [0.8, -0.5], [0.8, -5.2], [2.2, -7], [3.4, -6.2], [3.4, -0.5], [3.9, 0]],
      [[0.8, -3.2], [3.4, -3.2]],
    ],
  },
  B: {
    advance: 4.6,
    strokes: [
      [[0.3, -6.5], [1, -7], [1, -0.6]],
      [[1, -7], [2.6, -7], [3.2, -6.3], [3.2, -4.6], [2.2, -3.9], [1, -3.9]],
      [[2.2, -3.9], [3.5, -3.2], [3.5, -0.7], [2.8, 0], [0.2, 0]],
    ],
  },
  C: { advance: 4.5, strokes: [capC, inner(1.7)] },
  D: {
    advance: 4.8,
    strokes: [
      [[0.2, -6.4], [1.4, -7], [2.6, -7], [3.6, -6], [3.6, -1], [2.6, 0], [0.4, 0]],
      [[1, -6.6], [1, -0.2]],
    ],
  },
  E: {
    advance: 4.5,
    strokes: [capC, inner(1.7), [[0.6, -3.6], [2.8, -3.6]], [[3.4, -6.4], [3.4, -5.4]]],
  },
  F: {
    advance: 4.3,
    strokes: [
      [[0.2, -6.2], [1.2, -7], [3.6, -7], [3.9, -6.5]],
      [[1.2, -7], [1, -6.4], [1, -0.5], [0.4, 0.3]],
      [[1, -3.8], [2.8, -3.8]],
    ],
  },
  G: { advance: 4.6, strokes: [capC, inner(1.7), [[3.6, -0.6], [3.6, -3.2], [2.4, -3.2]]] },
  H: {
    advance: 4.7,
    strokes: [capStem(1), [[1, -4.2], [2.6, -5], [3.4, -4.2], [3.4, -0.6], [2.6, 0]]],
  },
  I: {
    advance: 3.4,
    strokes: [
      [[0.3, -6.4], [1, -7], [2.8, -7]],
      [[1.5, -7], [1.5, -0.5], [0.6, 0]],
    ],
  },
  J: {
    advance: 3.4,
    strokes: [
      [[0.3, -6.4], [1, -7], [2.8, -7]],
      [[2, -7], [2, 1.4], [1.2, 2.3], [0.2, 1.8]],
    ],
  },
  K: {
    advance: 4.6,
    strokes: [capStem(1), [[1, -3], [3.4, -7]], [[1.6, -3.6], [3, -0.5], [3.6, 0]]],
  },
  L: {
    advance: 4.5,
    strokes: [[[0.3, -6.6], [1, -7], [1, -0.6], [1.6, 0], [3.6, 0], [3.9, -0.6]]],
  },
  M: {
    advance: 6,
    strokes: [
      [[0.3, -6.4], [0.9, -7], [0.9, -0.5], [0.3, 0]],
      arch(0.9, 2.6, -7),
      arch(2.6, 4.3, -7),
    ],
  },
  N: {
    advance: 4.9,
    strokes: [
      [[0.3, -6.4], [0.9, -7], [0.9, -0.5], [0.3, 0]],
      [[0.9, -6.2], [2.4, -7], [3.2, -6.4], [3.2, -0.5], [3.7, 0]],
    ],
  },
  O: { advance: 4.6, strokes: [capLeft, capRight, inner(1.6)] },
  P: { advance: 4.4, strokes: [capStem(1), capBowl(-3.2)] },
  Q: { advance: 4.6, strokes: [capLeft, capRight, inner(1.6), [[2.2, 0], [3.4, 0.8], [4, 0.6]]] },
  R: { advance: 4.6, strokes: [capStem(1), capBowl(-3.2), [[2.4, -3.2], [3.2, -0.5], [3.8, 0]]] },
  S: {
    advance: 4.3,
    strokes: [
      [[3.4, -6.4], [2.6, -7], [1.2, -7], [0.6, -6.2], [0.6, -5], [3.4, -2.2], [3.4, -0.8], [2.6, 0], [1, 0], [0.3, -0.6]],
    ],
  },
  T: {
    advance: 4.6,
    strokes: [
      [[0.2, -6.2], [0.8, -7], [3.8, -7], [4.2, -6.4]],
      [[2, -7], [2, -0.6], [2.6, 0]],
    ],
  },
  U: {
    advance: 4.9,
    strokes: [
      [[0.2, -6.6], [0.9, -7], [0.9, -0.6], [1.6, 0], [3.4, -1]],
      [[2.8, -7], [3.4, -6.4], [3.4, -0.5], [3.9, 0]],
    ],
  },
  V: {
    advance: 4.6,
    strokes: [
      [[0.2, -6.6], [0.9, -7], [0.9, -1], [2.2, 0]],
      [[2.8, -7], [3.4, -6.4], [3.4, -1.4], [2.2, 0]],
    ],
  },
  W: {
    advance: 6.4,
    strokes: [
      [[0.2, -6.6], [0.9, -7], [0.9, -1], [2, 0]],
      [[2.2, -6.6], [2.7, -6.2], [2.7, -1], [3.8, 0]],
      [[4.5, -7], [5.1, -6.4], [5.1, -1.4], [3.8, 0]],
    ],
  },
  X: {
    advance: 4.6,
    strokes: [
      [[0.3, -6.8], [1, -7], [3.3, -0.3], [3.9, 0]],
      [[3.6, -7], [0.4, 0]],
    ],
  },
  Y: {
    advance: 4.9,
    strokes: [
      [[0.2, -6.6], [0.9, -7], [0.9, -1], [1.6, -0.4], [3.4, -1.2]],
      [[2.8, -7], [3.4, -6.4], [3.4, 1.4], [2.4, 2.4], [1, 2]],
    ],
  },
  Z: {
    advance: 4.6,
    strokes: [
      [[0.3, -6.4], [1, -7], [3.6, -7], [0.6, -0.2], [3, 0], [3.9, -0.6]],
      [[1, -3.5], [3.2, -3.5]],
    ],
  },

  // Figures, 6 nibs tall.
  '0': { advance: 3.6, strokes: [leftBowl(-6), rightBowl(-6)] },
  '1': { advance: 2.4, strokes: [[[0, -5.2], [0.9, -6], [0.9, -0.5], [1.4, 0]]] },
  '2': {
    advance: 3.4,
    strokes: [[[0.2, -5.2], [1, -6], [2.3, -5.4], [2.3, -3.6], [0.3, -0.2], [2.3, 0], [2.8, -0.4]]],
  },
  '3': {
    advance: 3.4,
    strokes: [
      [[0.2, -5.4], [1, -6], [2.3, -5.4], [2.3, -3.8], [1.2, -3.2], [2.3, -2.6], [2.3, -0.6], [1.3, 0], [0.2, -0.4]],
    ],
  },
  '4': {
    advance: 3.5,
    strokes: [
      [[1.8, -6], [0.2, -2], [2.8, -2]],
      [[2, -3.6], [2, -0.5], [2.5, 0]],
    ],
  },
  '5': {
    advance: 3.4,
    strokes: [[[2.6, -6], [0.6, -6], [0.5, -3.6], [1.5, -3.8], [2.3, -3.2], [2.3, -0.6], [1.3, 0], [0.2, -0.4]]],
  },
  '6': {
    advance: 3.4,
    strokes: [
      [[2.2, -5.6], [1.4, -6], [0.5, -5.3], [0.5, -0.6], [1.3, 0]],
      [[0.5, -3], [1.6, -3.8], [2.3, -3.2], [2.3, -0.6], [1.5, 0.1]],
    ],
  },
  '7': { advance: 3.2, strokes: [[[0.2, -5.4], [0.6, -6], [2.6, -6], [1, 0]]] },
  '8': {
    advance: 3.6,
    strokes: [
      [[1.4, -6], [0.5, -5.4], [0.5, -4], [2.3, -2.2], [2.3, -0.6], [1.4, 0], [0.5, -0.6], [0.5, -2.2], [2.3, -4], [2.3, -5.4], [1.4, -6]],
    ],
  },
  '9': {
    advance: 3.4,
    strokes: [[[2.3, -2.8], [1.2, -2.2], [0.5, -2.8], [0.5, -5.4], [1.4, -6], [2.3, -5.4], [2.3, -0.6], [1.4, 0], [0.6, -0.4]]],
  },

  // Punctuation.
  '.': { advance: 1.6, strokes: [dot(0.3, -0.75)] },
  ',': { advance: 1.6, strokes: [[[0.3, -0.8], [0.85, -0.25], [0.6, 0.6], [0.1, 1.2]]] },
  ':': { advance: 1.6, strokes: [dot(0.3, -4.6), dot(0.3, -0.75)] },
  ';': { advance: 1.6, strokes: [dot(0.3, -4.6), [[0.3, -0.8], [0.85, -0.25], [0.6, 0.6], [0.1, 1.2]]] },
  '!': { advance: 1.8, strokes: [[[0, -7.4], [0.5, -6.9], [0.5, -2.4]], dot(0.25, -0.75)] },
  '?': {
    advance: 3,
    strokes: [[[0.2, -6.2], [1, -7], [2.2, -6.4], [2.2, -4.8], [1.2, -3.6], [1.2, -2.4]], dot(0.95, -0.75)],
  },
  "'": { advance: 1.4, strokes: [[[0.3, -7.4], [0.8, -6.9], [0.6, -6]]] },
  '"': {
    advance: 2.4,
    strokes: [
      [[0.3, -7.4], [0.8, -6.9], [0.6, -6]],
      [[1.3, -7.4], [1.8, -6.9], [1.6, -6]],
    ],
  },
  '-': { advance: 2.2, strokes: [[[0.3, -3], [1.6, -2.4]]] },
  '(': { advance: 2, strokes: [[[1.6, -7.4], [0.5, -5.6], [0.5, 0.4], [1.6, 2.2]]] },
  ')': { advance: 2, strokes: [[[0.3, -7.4], [1.4, -5.6], [1.4, 0.4], [0.3, 2.2]]] },
  '/': { advance: 3, strokes: [[[2.6, -7.4], [0.2, 1.4]]] },
  '+': {
    advance: 3.4,
    strokes: [
      [[1.6, -4.6], [1.6, -0.8]],
      [[0.3, -2.7], [2.9, -2.7]],
    ],
  },
  '=': {
    advance: 3.4,
    strokes: [
      [[0.3, -3.6], [2.9, -3.6]],
      [[0.3, -1.8], [2.9, -1.8]],
    ],
  },
  '*': {
    advance: 2.8,
    strokes: [
      [[1.4, -7.2], [1.4, -4.6]],
      [[0.3, -6.6], [2.5, -5.2]],
      [[0.3, -5.2], [2.5, -6.6]],
    ],
  },
  '&': {
    advance: 4,
    strokes: [[[3.4, 0], [0.6, -4.4], [0.6, -5.6], [1.4, -6.2], [2.2, -5.6], [2.2, -4.6], [0.5, -2.6], [0.5, -0.8], [1.3, 0], [2.4, -0.4], [3.2, -2.4]]],
  },
};

/** The plain letters, for the ornate blackletter to build on. */
export const BLACKLETTER_DEFS: Readonly<Record<string, Def>> = DEFS;

export type StrokeGlyph = { advance: number; strokes: Vec2[][] };

/** Glyphs by character from their definitions. */
export function glyphMap(defs: Readonly<Record<string, Def>>): Map<string, StrokeGlyph> {
  const out = new Map<string, StrokeGlyph>();
  for (const [ch, d] of Object.entries(defs))
    out.set(ch, {
      advance: d.advance,
      strokes: d.strokes.map((s) => s.map(([x, y]) => ({ x, y }))),
    });
  return out;
}

const glyphs = glyphMap(DEFS);

/** The glyph for a character, in nib widths (y down, baseline 0), or undefined if there's none. */
export function blackletterGlyph(ch: string): StrokeGlyph | undefined {
  return glyphs.get(ch);
}

/** The characters the blackletter has. */
export const BLACKLETTER_CHARS = [...glyphs.keys()].join('');
