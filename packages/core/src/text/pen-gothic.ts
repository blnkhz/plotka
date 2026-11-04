import { BLACKLETTER_DEFS, glyphMap, type Def, type Pt, type StrokeGlyph } from './blackletter';

/**
 * Gothic for a parallel pen, after the usual broad-pen worksheet: nib at 40°, x-height 4 nib
 * widths, capitals 6. Rounder and more compact than the Textura blackletter, with round
 * (Lombardic-style) capitals that carry a wedge-shaped spike in their counters, double stems and
 * hairline bars across x, z, I, M and the like.
 *
 * Like the other nib fonts, each stroke is the path of the middle of a flat nib that never turns:
 * the spikes are short strokes across the nib, the bars and joins strokes along it. Units are nib
 * widths, y down: baseline 0, x-height −4, capitals and ascenders −6, descenders +2.
 */

/** Capital height and x-height, in nib widths. */
export const PEN_GOTHIC_CAP_NIBS = 6;
export const PEN_GOTHIC_X_NIBS = 4;

const X = -PEN_GOTHIC_X_NIBS;
const CAP = -PEN_GOTHIC_CAP_NIBS;

/** A minim: diamond head, straight stem, diamond foot, centered on x. */
const minim = (x: number, top = X, bottom = 0): Pt[] => [
  [x - 0.5, top],
  [x, top + 0.5],
  [x, bottom - 0.5],
  [x + 0.5, bottom],
];
/** An ascender (b, h, k, l): a diamond-cut head two nibs above the x-height. */
const ascender = (x: number): Pt[] => [
  [x - 0.5, CAP],
  [x, CAP + 0.5],
  [x, -0.5],
  [x + 0.5, 0],
];
/** The hairline-and-stem arch of n, m, h, from the stem at x1 over to a stem at x2. */
const arch = (x1: number, x2: number, top = X, bottom = 0): Pt[] => [
  [x1, top + 0.8],
  [x2 - 0.6, top],
  [x2, top + 0.5],
  [x2, bottom - 0.5],
  [x2 + 0.5, bottom],
];
/** Left and right halves of an o-shaped bowl (lowercase). */
const bowlL = (top = X): Pt[] => [
  [1.5, top - 0.05],
  [0.5, top + 0.6],
  [0.5, -0.6],
  [1.2, 0],
];
const bowlR = (top = X): Pt[] => [
  [1.2, top],
  [2.2, top + 0.6],
  [2.2, -0.6],
  [1.4, 0.05],
];
/** The bowl of b and p, from their stem. */
const stemBowl: Pt[] = [
  [0.5, -3.2],
  [1.4, -4],
  [2.2, -3.4],
  [2.2, -0.6],
  [1.3, 0.05],
  [0.5, -0.3],
];
/** A small diamond (its top-left corner at x, y). */
const dot = (x: number, y: number): Pt[] => [
  [x, y],
  [x + 0.55, y + 0.55],
];

/** The spike in a capital's counter: a wedge from the stem at x pointing right. */
const spike = (x: number, y = -3.4): Pt[] => [
  [x, y],
  [x + 1.1, y + 0.45],
];
/** A round capital's left side (C, E, G, T), from the top at x = 2.4 down round to the right. */
const roundBody: Pt[] = [
  [2.4, CAP],
  [1.2, -5.6],
  [0.5, -4.6],
  [0.5, -1.4],
  [1.2, -0.3],
  [2.4, 0],
  [3.5, -0.6],
];
/** The top of a round capital, curling down on the right (C, E, G). */
const roundTop: Pt[] = [
  [2, CAP],
  [3.3, -5.8],
  [3.6, -4.7],
];
/** A capital O's halves, and the inner stem that doubles its left side. */
const capOL: Pt[] = [
  [2.2, CAP - 0.05],
  [0.6, -5],
  [0.6, -1],
  [2, 0],
];
const capOR: Pt[] = [
  [1.8, CAP],
  [3.6, -5],
  [3.6, -1],
  [2.2, 0.05],
];
const inner = (x: number): Pt[] => [
  [x, -5],
  [x, -1],
];
/** A capital's stem with a hairline lead-in and a foot. */
const capStem = (x: number): Pt[] => [
  [x - 0.7, -5.6],
  [x, CAP],
  [x, -0.5],
  [x - 0.6, 0],
];
/** A capital's bowl on the stem at x = 1 (P, R), down to y. */
const capBowl = (y: number): Pt[] => [
  [1, CAP],
  [2.6, CAP],
  [3.4, -5.2],
  [3.4, y + 0.6],
  [2.6, y],
  [1, y],
];

// One stroke per line reads like the letter's ductus; prettier would put every point on its own.
// prettier-ignore
const LETTERS: Record<string, Def> = {
  ' ': { advance: 2, strokes: [] },

  a: {
    advance: 3.5,
    strokes: [
      [[0.4, -3.4], [1.2, -4], [2.2, -3.5], [2.2, -0.5], [2.7, 0]],
      [[2.2, -2.7], [0.5, -2], [0.5, -0.5], [1, 0], [2.2, -0.5]],
    ],
  },
  b: { advance: 3.5, strokes: [ascender(0.5), stemBowl] },
  c: { advance: 3, strokes: [[...bowlL(), [2.1, -0.5]], [[1.2, -4], [2.1, -3.5], [2.1, -3]]] },
  d: { advance: 3.5, strokes: [bowlL(), [[0.4, -6], [1.6, -5], [2.2, -3.6], [2.2, -0.6], [1.5, 0.05]]] },
  e: { advance: 3, strokes: [[...bowlL(), [2.1, -0.5]], [[1.2, -4], [2.1, -3.4], [2.1, -2.6], [0.5, -1.8]]] },
  f: {
    advance: 2.6,
    strokes: [
      [[2.4, -5.6], [1.4, -6], [0.6, -5.4], [0.6, -0.3], [0.1, 0.5]],
      [[-0.2, -4], [1.6, -4]],
    ],
  },
  g: {
    advance: 3.5,
    strokes: [
      [[1.5, -4.05], [0.5, -3.4], [0.5, -1], [1.2, -0.5], [2.2, -0.9]],
      [[1.2, -4], [2.2, -3.5], [2.2, 1.2], [1.4, 2], [0.3, 1.7]],
      [[0.3, 1.7], [-0.1, 1.1], [0.7, 0.7]],
    ],
  },
  h: { advance: 3.5, strokes: [ascender(0.5), [[0.5, -3.2], [1.6, -4], [2.2, -3.5], [2.2, 1.2], [1.5, 2]]] },
  i: { advance: 1.8, strokes: [minim(0.5), dot(0.25, -5.3)] },
  j: { advance: 1.8, strokes: [[[0, X], [0.5, -3.5], [0.5, 1.2], [-0.3, 2], [-1, 1.6]], dot(0.25, -5.3)] },
  k: {
    advance: 3.3,
    strokes: [
      ascender(0.5),
      [[0.5, -2.4], [1.6, -4], [2.2, -3.4], [2, -2.6], [0.6, -2]],
      [[1.2, -2.2], [2.2, -0.5], [2.7, 0]],
    ],
  },
  l: { advance: 1.8, strokes: [ascender(0.5)] },
  m: { advance: 5.2, strokes: [minim(0.5), arch(0.5, 2.2), arch(2.2, 3.9)] },
  n: { advance: 3.5, strokes: [minim(0.5), arch(0.5, 2.2)] },
  o: { advance: 3.5, strokes: [bowlL(), bowlR()] },
  p: { advance: 3.5, strokes: [[[0, X], [0.5, -3.5], [0.5, 2]], [[-0.2, 2], [1.1, 2]], stemBowl] },
  q: {
    advance: 3.5,
    strokes: [[...bowlL(), [2.2, -0.4]], [[1.4, -4], [2.2, -3.5], [2.2, 2]], [[1.5, 2], [2.9, 2]]],
  },
  r: { advance: 2.6, strokes: [minim(0.5), [[0.5, -3.3], [1.4, -4], [2, -3.5]]] },
  s: {
    advance: 3,
    strokes: [[[2.1, -3.6], [1.5, -4.05], [0.5, -3.5], [0.5, -2.8], [2.1, -1.2], [2.1, -0.5], [1.1, 0], [0.1, -0.3]]],
  },
  t: { advance: 2.5, strokes: [[[0.5, -5], [0.5, -0.5], [1, 0], [1.6, -0.3]], [[-0.2, X], [1.6, X]]] },
  u: { advance: 3.5, strokes: [[[0, X], [0.5, -3.5], [0.5, -0.5], [1, 0], [2.2, -0.7]], minim(2.2)] },
  v: {
    advance: 3.5,
    strokes: [[[0, X], [0.5, -3.5], [0.5, -0.7], [1.3, 0]], [[1.7, X], [2.2, -3.5], [2.2, -0.9], [1.3, 0]]],
  },
  w: {
    advance: 5.2,
    strokes: [
      [[0, X], [0.5, -3.5], [0.5, -0.5], [1, 0], [2.2, -0.7]],
      [[1.7, X], [2.2, -3.5], [2.2, -0.7], [3, 0]],
      [[3.4, X], [3.9, -3.5], [3.9, -0.9], [3, 0]],
    ],
  },
  x: {
    advance: 3.4,
    strokes: [[[0, X], [0.5, -3.5], [2.2, -0.5], [2.7, 0]], [[2.5, X], [0, 0]], [[0.2, -2], [2.5, -2]]],
  },
  y: {
    advance: 3.5,
    strokes: [
      [[0, X], [0.5, -3.5], [0.5, -0.5], [1, 0], [2.2, -0.7]],
      [[1.7, X], [2.2, -3.5], [2.2, 1.2], [1.4, 2], [0.3, 1.7]],
    ],
  },
  z: {
    advance: 3.3,
    strokes: [[[0, -3.6], [0.6, X], [2.2, -3.6], [0.3, -0.4], [2.1, 0], [2.7, -0.3]], [[0.4, -2], [2.2, -2]]],
  },

  // Round capitals with spikes, double stems and hairline bars.
  A: {
    advance: 4.6,
    strokes: [
      [[0.4, -0.3], [2.2, CAP]],
      [[2.2, CAP], [3.2, -5.2], [3.2, -0.5], [3.8, 0]],
      [[1.5, -5.9], [2.6, -6.4]],
      [[-0.3, 0], [1.2, 0]],
      [[1.3, -2.4], [3.2, -2.4]],
    ],
  },
  B: {
    advance: 4.4,
    strokes: [
      capStem(1),
      [[1, CAP], [2.5, CAP], [3.1, -5.4], [3.1, -3.9], [2.2, -3.3], [1, -3.3]],
      [[2.2, -3.3], [3.4, -2.7], [3.4, -0.6], [2.7, 0], [0.4, 0]],
      [[-0.1, -5], [-0.1, -1]],
    ],
  },
  C: { advance: 4.4, strokes: [roundBody, roundTop, inner(1.6), spike(1.6)] },
  D: {
    advance: 4.7,
    strokes: [
      [[0.3, -5.6], [1, CAP], [2.6, CAP], [3.6, -5], [3.6, -1], [2.6, 0], [0.4, 0]],
      [[1, -5.6], [1, -0.4]],
      spike(1),
      [[1, CAP], [0.2, -6.6]],
    ],
  },
  E: { advance: 4.4, strokes: [roundBody, roundTop, inner(1.6), spike(1.6, -4.2), [[1.6, -3], [3.1, -3]]] },
  F: {
    advance: 4.2,
    strokes: [
      [[0.2, -5.4], [1, CAP], [3.2, CAP], [3.6, -5.4]],
      [[1, CAP], [1, -0.4], [0.3, 0.4]],
      [[1, -3.2], [2.8, -3.2]],
      [[-0.2, -3.2], [1, -3.6]],
    ],
  },
  G: {
    advance: 4.6,
    strokes: [roundBody, roundTop, inner(1.6), spike(1.6, -4.2), [[3.5, -0.6], [3.5, -2.6], [2.4, -2.6]]],
  },
  H: {
    advance: 4.6,
    strokes: [
      capStem(1),
      [[1, -3.4], [2.6, -4.2], [3.4, -3.6], [3.4, -0.5], [2.8, 0]],
      [[2.4, CAP], [3.4, -5.4]],
      spike(1, -2.2),
    ],
  },
  I: {
    advance: 3.2,
    strokes: [
      [[0.3, -5.4], [1.1, CAP], [2.4, -5.8]],
      [[1.6, CAP], [1.6, -0.5], [0.8, 0]],
      [[0.6, -3], [2.6, -3]],
    ],
  },
  J: {
    advance: 3.2,
    strokes: [
      [[0.3, -5.4], [1.1, CAP], [2.4, -5.8]],
      [[1.8, CAP], [1.8, 1.2], [1, 2], [0, 1.6]],
      [[0.8, -3], [2.8, -3]],
    ],
  },
  // Like the worksheet's: a doubled stem, a looped arm that comes back into it, and a leg that
  // kicks out and drops straight to a foot.
  K: {
    advance: 4.6,
    strokes: [
      capStem(1.2),
      [[0.2, -5], [0.2, -1]],
      [[1.2, -3.4], [2.4, -4.8], [3.3, -5.1], [3.5, -4.3], [2.9, -3.3], [1.4, -2.9]],
      [[2.3, -3.1], [3.3, -2.2], [3.3, -0.5], [3.9, 0]],
    ],
  },
  L: {
    advance: 4.4,
    strokes: [[[0.2, -5.6], [1, CAP], [1, -0.6], [1.6, 0], [3.4, 0], [3.8, -0.6]], [[-0.1, -3.4], [1, -3.8]]],
  },
  M: {
    advance: 5.9,
    strokes: [
      [[0.3, -5.6], [0.9, CAP], [0.9, -0.5], [0.3, 0]],
      arch(0.9, 2.6, CAP),
      arch(2.6, 4.3, CAP),
      [[0.2, -3], [5, -3]],
    ],
  },
  N: {
    advance: 4.8,
    strokes: [
      [[0.3, -5.6], [0.9, CAP], [0.9, -0.5], [0.3, 0]],
      [[0.9, -5.2], [2.4, CAP], [3.2, -5.4], [3.2, -0.5], [3.7, 0]],
      [[0.2, -3], [3.9, -3]],
    ],
  },
  O: { advance: 4.6, strokes: [capOL, capOR, inner(1.6), spike(1.6)] },
  P: { advance: 4.4, strokes: [[[0.3, -5.6], [1, CAP], [1, -0.2], [0.3, 0.6]], capBowl(-2.6), spike(1, -4.6)] },
  Q: { advance: 4.8, strokes: [capOL, capOR, inner(1.6), spike(1.6), [[2.2, 0.05], [3.4, 0.6], [4.4, 0.3]]] },
  R: { advance: 4.6, strokes: [capStem(1), capBowl(-2.6), [[2.4, -2.6], [3.2, -0.5], [3.8, 0]], spike(1, -4.6)] },
  S: {
    advance: 4.2,
    strokes: [
      [[3.3, -5.4], [2.5, CAP], [1.2, CAP], [0.6, -5.2], [0.6, -4.2], [3.3, -1.8], [3.3, -0.7], [2.5, 0], [1, 0], [0.3, -0.6]],
      [[3.3, -5.4], [3.5, -4.5]],
      [[1.5, -2], [2.7, -3.2]],
    ],
  },
  T: {
    advance: 4.4,
    strokes: [
      [[0, -5.6], [0.8, CAP], [3.8, CAP], [4.1, -5.2]],
      [[2, CAP], [1, -4.8], [1, -1], [2, 0], [3.4, -0.6]],
      spike(1, -3),
    ],
  },
  U: {
    advance: 4.8,
    strokes: [
      [[0.2, -5.6], [0.9, CAP], [0.9, -0.6], [1.6, 0], [3.4, -0.8]],
      [[2.8, CAP], [3.4, -5.4], [3.4, -0.5], [3.9, 0]],
      spike(0.9, -3.4),
    ],
  },
  V: {
    advance: 4.6,
    strokes: [
      [[0.2, -5.6], [0.9, CAP], [0.9, -1], [2.2, 0]],
      [[2.8, CAP], [3.4, -5.4], [3.4, -1.4], [2.2, 0]],
      spike(0.9, -3.4),
    ],
  },
  W: {
    advance: 6.3,
    strokes: [
      [[0.2, -5.6], [0.9, CAP], [0.9, -0.6], [2, 0]],
      [[2.2, -5.6], [2.7, -5.2], [2.7, -0.6], [3.8, 0]],
      [[4.5, CAP], [5.1, -5.4], [5.1, -1.4], [3.8, 0]],
    ],
  },
  X: {
    advance: 4.6,
    strokes: [[[0.3, -5.8], [1, CAP], [3.3, -0.3], [3.9, 0]], [[3.6, CAP], [0.4, 0]], [[0.6, -3], [3.6, -3]]],
  },
  Y: {
    advance: 4.8,
    strokes: [
      [[0.2, -5.6], [0.9, CAP], [0.9, -1], [1.6, -0.4], [3.4, -1.2]],
      [[2.8, CAP], [3.4, -5.4], [3.4, 1.2], [2.4, 2], [1, 1.7]],
    ],
  },
  Z: {
    advance: 4.6,
    strokes: [[[0.3, -5.4], [1, CAP], [3.6, CAP], [0.6, -0.2], [3, 0], [3.9, -0.6]], [[1, -3], [3.2, -3]]],
  },
};

/**
 * Figures and punctuation: the blackletter's, its figures as they are (6 nibs tall, as tall as
 * these capitals) and its punctuation brought down from its 7-nib capitals to these 6.
 */
function others(): Record<string, Def> {
  const out: Record<string, Def> = {};
  const k = PEN_GOTHIC_CAP_NIBS / 7;
  for (const [ch, d] of Object.entries(BLACKLETTER_DEFS)) {
    if (/[a-zA-Z ]/.test(ch)) continue;
    out[ch] = /\d/.test(ch)
      ? d
      : { advance: d.advance, strokes: d.strokes.map((s) => s.map(([x, y]): Pt => [x, y * k])) };
  }
  return out;
}

const DEFS: Readonly<Record<string, Def>> = { ...others(), ...LETTERS };
const glyphs = glyphMap(DEFS);

/** The glyph table (in nib widths), for the hands built on this one. */
export const penGothicDefs = (): Readonly<Record<string, Def>> => DEFS;

/** The glyph for a character, in nib widths (y down, baseline 0), if there is one. */
export function penGothicGlyph(ch: string): StrokeGlyph | undefined {
  return glyphs.get(ch);
}
