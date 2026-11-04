import { glyphMap, type Def, type Pt, type StrokeGlyph } from './blackletter';
import { PEN_GOTHIC_CAP_NIBS, PEN_GOTHIC_X_NIBS, penGothicDefs } from './pen-gothic';

/**
 * Rotunda, the round Gothic, for a parallel pen: after the broad-pen worksheet hand whose
 * letters are all curves: arched shoulders, bowls that swing round, C-shaped capitals with a spike in their
 * counters, and terminals that curl into hooks and tails. Same nib (40°, never turned) and the
 * same proportions as the plain Gothic: x-height 4 nib widths, capitals 6.
 *
 * Every stroke is the path of the middle of the nib, written like an SVG path (absolute M, L, C
 * and Q only, in nib widths, y down, baseline 0, x-height −4, capitals −6, descenders +2). The
 * curves are sampled into short lines; their thickness swells and thins as they turn against
 * the fixed nib, which is where the letters' life comes from.
 */

/** Points per nib width of curve: enough that the swept edge reads as smooth. */
const SAMPLES_PER_NIB = 6;

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, out: Pt[]) {
  const len =
    Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) +
    Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) +
    Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
  const n = Math.max(4, Math.ceil(len * SAMPLES_PER_NIB));
  for (let i = 1; i <= n; i++) {
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
}

/** Strokes from an SVG-like path: each M starts a new stroke. */
export function strokesOf(d: string): Pt[][] {
  const tokens = d.match(/[MLCQ]|-?\d*\.?\d+/g) ?? [];
  const strokes: Pt[][] = [];
  let cur: Pt[] = [];
  let i = 0;
  const num = () => Number(tokens[i++]);
  const pt = (): Pt => [num(), num()];
  let cmd = '';
  while (i < tokens.length) {
    if (/[MLCQ]/.test(tokens[i]!)) cmd = tokens[i++]!;
    const last = cur[cur.length - 1]!;
    if (cmd === 'M') {
      if (cur.length > 1) strokes.push(cur);
      cur = [pt()];
      cmd = 'L'; // further pairs after an M are lines, as in SVG
    } else if (cmd === 'L') cur.push(pt());
    else if (cmd === 'C') cubic(last, pt(), pt(), pt(), cur);
    else if (cmd === 'Q') {
      const q = pt();
      const e = pt();
      cubic(
        last,
        [last[0] + (2 / 3) * (q[0] - last[0]), last[1] + (2 / 3) * (q[1] - last[1])],
        [e[0] + (2 / 3) * (q[0] - e[0]), e[1] + (2 / 3) * (q[1] - e[1])],
        e,
        cur,
      );
    } else throw new Error(`Unknown path command in "${d}"`);
  }
  if (cur.length > 1) strokes.push(cur);
  return strokes;
}

// Recurring parts, as path fragments.
/** A minim from a diamond head at the x-height (or `top`) down to a foot that turns right. */
const minim = (x: number, top = -4) =>
  `M ${x - 0.5} ${top} L ${x} ${top + 0.5} L ${x} -0.8 C ${x} -0.25 ${x + 0.35} 0.05 ${x + 0.9} -0.2`;
/** An ascender with a hooked head, down to a foot that turns right. */
const ascender = (x: number) =>
  `M ${x - 0.6} -5.4 C ${x - 0.3} -6 ${x} -6.1 ${x} -5.6 L ${x} -0.8 C ${x} -0.25 ${x + 0.35} 0.05 ${x + 0.9} -0.2`;
/** A round shoulder from the stem at x1 over to a stem at x2, down to `end`. */
const shoulder = (x1: number, x2: number, top = -4) =>
  `M ${x1} ${top + 0.9} C ${x1 + 0.4} ${top + 0.15} ${x2 - 0.8} ${top - 0.2} ${x2 - 0.25} ${top + 0.1} C ${x2} ${top + 0.25} ${x2} ${top + 0.5} ${x2} ${top + 0.9}`;
/** A foot that turns right from the stem at x. */
const foot = (x: number) => `L ${x} -0.8 C ${x} -0.25 ${x + 0.35} 0.05 ${x + 0.9} -0.2`;
/** The left of a round lowercase bowl, from its top at x = 1.6 round to the baseline. */
const bowlLeft = (end = 'C 1.95 0.03 2.25 -0.15 2.45 -0.5') =>
  `M 1.65 -4.05 C 0.95 -4.05 0.45 -3.5 0.45 -2.6 L 0.45 -1.3 C 0.45 -0.45 0.9 0.03 1.5 0.03 ${end}`;
/** A diamond dot, its top-left corner at x, y. */
const dot = (x: number, y: number) => `M ${x} ${y} L ${x + 0.55} ${y + 0.55}`;
/** A descender curling back to the left under the letter, from the stem at x. */
const tail = (x: number) =>
  `L ${x} 1 C ${x} 1.75 ${x - 0.5} 2.05 ${x - 1.1} 2.05 C ${x - 1.6} 2.05 ${x - 1.9} 1.75 ${x - 1.95} 1.4`;

/** A capital's round left side (C, E, G, O, Q, T), from the top round to the lower right. */
const capRound = `M 2.6 -6 C 1.2 -6 0.4 -4.75 0.4 -3 C 0.4 -1.25 1.2 0 2.4 0 C 3.05 0 3.5 -0.25 3.95 -0.7`;
/** The inner stroke that doubles a round capital's left side, and its spike. */
const capInner = (spikeY = -3.2) =>
  `M 2 -5.1 C 1.65 -4.3 1.6 -1.9 2 -1.05 M 1.75 ${spikeY} L 2.95 ${spikeY + 0.5}`;
/** The top of a round capital, curling over and down on the right (C, G). */
const capHook = `M 2.1 -6.05 C 3 -6.25 3.85 -5.9 3.9 -5.05 C 3.92 -4.75 3.75 -4.5 3.5 -4.45`;
/** A capital's stem from a hooked head at x down to a foot turning left, its spike at y. */
const capStem = (x: number) =>
  `M ${x - 0.8} -5.5 C ${x - 0.45} -6.05 ${x} -6.15 ${x} -5.6 L ${x} -0.7 C ${x} -0.2 ${x - 0.35} 0.05 ${x - 0.85} -0.1`;
const spike = (x: number, y = -3.2) => `M ${x} ${y} L ${x + 1.15} ${y + 0.5}`;

// One letter per line, its strokes in the worksheet's order.
// prettier-ignore
const PATHS: Record<string, [number, string]> = {
  a: [3.7, `M 0.35 -3.3 C 0.75 -4 1.45 -4.25 2 -3.95 C 2.35 -3.75 2.4 -3.45 2.4 -3 ${foot(2.4)}
            M 2.4 -2.65 C 1.4 -2.55 0.5 -2.15 0.5 -1.25 C 0.5 -0.4 0.95 0.03 1.45 0.03 C 1.85 0.03 2.15 -0.2 2.4 -0.5`],
  b: [3.6, `${ascender(0.5)}
            M 0.5 -3.2 C 0.95 -3.9 1.5 -4.15 1.95 -4 C 2.3 -3.85 2.45 -3.5 2.45 -2.9 L 2.45 -1.1 C 2.45 -0.35 1.95 0.05 1.35 0.05 C 1 0.05 0.7 -0.1 0.5 -0.35`],
  c: [3.1, `${bowlLeft()} M 1.2 -4 C 1.85 -4.2 2.4 -3.95 2.4 -3.35 C 2.4 -3.1 2.25 -2.95 2.05 -2.9`],
  d: [3.7, `${bowlLeft('C 1.9 0.03 2.2 -0.15 2.45 -0.45')}
            M 0.1 -6.1 C 1.3 -6.2 2.45 -5.4 2.45 -3.7 ${foot(2.45)}`],
  e: [3.1, `${bowlLeft()} M 1.2 -4 C 1.85 -4.2 2.4 -3.9 2.4 -3.3 C 2.4 -2.65 1.55 -2.15 0.5 -1.95`],
  f: [2.7, `M 2.6 -5.55 C 2.3 -6 1.7 -6.15 1.2 -5.85 C 0.8 -5.6 0.65 -5.15 0.65 -4.5 L 0.65 -0.3 C 0.65 0.2 0.45 0.45 0.1 0.6
            M -0.2 -4 C 0.4 -4.1 1.1 -4 1.8 -4.1`],
  g: [3.7, `M 1.65 -4.05 C 0.95 -4.05 0.5 -3.5 0.5 -2.7 L 0.5 -1.6 C 0.5 -0.95 0.9 -0.6 1.45 -0.6 C 1.85 -0.6 2.15 -0.75 2.4 -1.05
            M 1.25 -4 C 1.9 -4.15 2.4 -3.85 2.4 -3.2 ${tail(2.4)} C 0.4 1.05 0.7 0.85 1.1 0.85`],
  h: [3.7, `${ascender(0.5)} ${shoulder(0.5, 2.45)} ${tail(2.45)}`],
  i: [1.9, `${minim(0.5)} ${dot(0.25, -5.35)}`],
  j: [1.9, `M 0 -4 L 0.5 -3.5 ${tail(0.5)} ${dot(0.25, -5.35)}`],
  k: [3.5, `${ascender(0.5)}
            M 0.5 -2.4 C 1.1 -3.55 1.7 -4.2 2.2 -3.95 C 2.65 -3.7 2.35 -2.85 1.65 -2.55 C 1.25 -2.4 0.85 -2.35 0.5 -2.35
            M 1.4 -2.45 C 2 -2.05 2.3 -1.45 2.3 -0.85 C 2.3 -0.25 2.65 0.05 3.2 -0.2`],
  l: [1.9, ascender(0.5)],
  m: [5.4, `${minim(0.5)} ${shoulder(0.5, 2.3)} ${foot(2.3)} ${shoulder(2.3, 4.1)} ${foot(4.1)}`],
  n: [3.7, `${minim(0.5)} ${shoulder(0.5, 2.4)} ${foot(2.4)}`],
  o: [3.7, `${bowlLeft('C 1.6 0.03 1.7 0.03 1.75 0.02')}
            M 1.25 -4 C 1.95 -4.1 2.45 -3.55 2.45 -2.7 L 2.45 -1.35 C 2.45 -0.5 2 0.03 1.4 0.03`],
  p: [3.7, `M 0 -4 L 0.5 -3.5 L 0.5 2 M -0.2 2 C 0.3 1.9 0.8 1.95 1.3 2.05
            M 0.5 -3.2 C 0.95 -3.9 1.5 -4.15 1.95 -4 C 2.3 -3.85 2.45 -3.5 2.45 -2.9 L 2.45 -1.1 C 2.45 -0.35 1.95 0.05 1.35 0.05 C 1 0.05 0.7 -0.1 0.5 -0.35`],
  q: [3.7, `${bowlLeft('C 1.9 0.03 2.2 -0.15 2.45 -0.45')}
            M 1.25 -4 C 1.9 -4.15 2.45 -3.85 2.45 -3.2 L 2.45 2 M 1.7 2 C 2.2 1.9 2.7 1.95 3.2 2.05`],
  r: [2.8, `${minim(0.5)} M 0.5 -3.2 C 0.9 -3.9 1.5 -4.2 2 -4.05 C 2.35 -3.95 2.5 -3.7 2.45 -3.35`],
  s: [3.2, `M 2.3 -3.55 C 2.1 -3.95 1.75 -4.05 1.35 -4.05 C 0.8 -4.05 0.5 -3.7 0.5 -3.2 C 0.5 -2.45 2.35 -2.15 2.35 -1.1 C 2.35 -0.35 1.8 0.03 1.1 0.03 C 0.6 0.03 0.3 -0.2 0.1 -0.5
            M 1.5 -4.1 C 1.9 -4.3 2.3 -4.25 2.55 -4.05`],
  t: [2.6, `M 0.55 -5.1 L 0.55 -0.8 C 0.55 -0.2 0.9 0.05 1.35 0.05 C 1.65 0.05 1.85 -0.1 2.05 -0.3
            M -0.2 -4 C 0.4 -4.1 1.1 -4 1.8 -4.1`],
  u: [3.7, `M 0 -4 L 0.5 -3.5 L 0.5 -0.9 C 0.5 -0.3 0.9 0.05 1.35 0.05 C 1.8 0.05 2.1 -0.2 2.4 -0.6 ${minim(2.4)}`],
  v: [3.6, `M 0 -4 L 0.5 -3.5 L 0.5 -1.05 C 0.5 -0.4 0.9 0.05 1.4 0.05
            M 1.8 -4.1 C 2.2 -4.1 2.4 -3.85 2.4 -3.4 L 2.4 -1.3 C 2.4 -0.45 1.95 0.05 1.4 0.05`],
  w: [5.3, `M 0 -4 L 0.5 -3.5 L 0.5 -0.9 C 0.5 -0.3 0.9 0.05 1.35 0.05 C 1.8 0.05 2.05 -0.2 2.3 -0.6
            M 1.8 -4 L 2.3 -3.5 L 2.3 -1.05 C 2.3 -0.4 2.7 0.05 3.2 0.05
            M 3.6 -4.1 C 4 -4.1 4.2 -3.85 4.2 -3.4 L 4.2 -1.3 C 4.2 -0.45 3.75 0.05 3.2 0.05`],
  x: [3.5, `M 0 -4 L 0.5 -3.5 C 1.1 -2.5 1.55 -1.6 2 -0.75 C 2.25 -0.25 2.6 0.05 3.1 -0.2
            M 2.7 -4.05 C 2.1 -2.8 1.45 -1.6 0.85 -0.65 C 0.6 -0.25 0.3 0.05 -0.15 -0.05
            M 0.3 -2 C 1 -2.1 1.8 -1.95 2.6 -2.05`],
  y: [3.7, `M 0 -4 L 0.5 -3.5 L 0.5 -0.9 C 0.5 -0.3 0.9 0.05 1.35 0.05 C 1.8 0.05 2.1 -0.2 2.4 -0.6
            M 1.9 -4 L 2.4 -3.5 ${tail(2.4)}`],
  z: [3.4, `M 0 -3.55 C 0.3 -4 0.65 -4.05 1.05 -4 C 1.5 -3.95 1.95 -3.85 2.35 -3.95 C 1.65 -2.7 1 -1.5 0.3 -0.3 C 1 -0.15 1.7 0 2.3 -0.05 C 2.6 -0.1 2.8 -0.25 2.95 -0.5
            M 0.4 -2 C 1.1 -2.1 1.7 -1.95 2.4 -2.05`],

  A: [4.8, `M 0.15 0 C 0.85 -0.7 1.25 -2.6 1.45 -4.1 C 1.65 -5.3 2.05 -6.05 2.7 -6.05
            M 2.7 -6.05 C 3.3 -6.05 3.6 -5.6 3.6 -4.8 ${foot(3.6)}
            M 1.2 -2.4 C 2 -2.5 2.8 -2.35 3.6 -2.45
            M -0.3 0.05 C 0.2 -0.05 0.7 -0.05 1.1 0.05`],
  B: [4.6, `${capStem(1)}
            M 1 -6 C 2 -6.15 3.15 -6.05 3.15 -5 C 3.15 -4.1 2.4 -3.55 1.4 -3.4
            M 1.4 -3.4 C 2.6 -3.5 3.5 -2.9 3.5 -1.7 C 3.5 -0.55 2.75 0.05 1.6 0.05 C 1.05 0.05 0.6 -0.05 0.25 -0.1
            M -0.05 -5.1 C -0.25 -4.2 -0.25 -1.9 -0.05 -1 ${spike(1, -2.2)}`],
  C: [4.4, `${capRound} ${capHook} ${capInner()}`],
  D: [4.8, `M 0.2 -6.4 C 0.6 -6.25 1 -5.85 1 -5.2 L 1 -0.6
            M 1 -6 C 3.05 -6.3 4.2 -4.95 4.2 -3 C 4.2 -1 3.05 0.15 1 0 C 0.65 0 0.4 0.05 0.15 0.2
            ${spike(1)}`],
  E: [4.4, `${capRound}
            M 2.1 -6.05 C 3.05 -6.25 3.9 -5.85 3.9 -4.85 C 3.9 -4.05 3.3 -3.5 2.15 -3.4
            ${capInner(-2.5)}`],
  F: [4.4, `M 1.4 -5.8 C 1.2 -5 1.15 -2.2 1.15 -0.9 C 1.15 0.2 0.65 0.75 -0.05 0.6
            M 0.3 -5.3 C 0.95 -6 2 -6.1 3 -5.95 C 3.5 -5.9 3.85 -5.65 3.95 -5.2 C 4 -4.85 3.85 -4.6 3.6 -4.45
            M 1.15 -3.2 C 1.8 -3.3 2.5 -3.15 3.1 -3.25
            M -0.2 -3.05 C 0.25 -3.2 0.7 -3.25 1.15 -3.2`],
  G: [4.6, `${capRound} ${capHook} ${capInner(-4)}
            M 2.5 -2.75 C 3.35 -2.95 3.95 -2.7 3.95 -2 L 3.95 -0.7`],
  H: [4.8, `${capStem(1)}
            M 1 -3.4 C 1.6 -4.1 2.4 -4.45 3 -4.15 C 3.4 -3.95 3.55 -3.55 3.55 -3 L 3.55 -0.6 C 3.55 0.2 3.05 0.6 2.4 0.5
            M 2.3 -6.05 C 2.9 -6.25 3.45 -5.95 3.55 -5.3
            ${spike(1, -2.3)}`],
  I: [3.4, `M 0.3 -5.4 C 0.7 -6 1.55 -6.15 2.5 -5.8
            M 1.65 -6 C 1.85 -5 1.85 -1.6 1.65 -0.7 C 1.55 -0.15 1.15 0.1 0.6 -0.05
            M 0.6 -3 C 1.3 -3.1 1.9 -2.95 2.7 -3.05`],
  J: [3.4, `M 0.3 -5.4 C 0.7 -6 1.55 -6.15 2.5 -5.8
            M 1.85 -6 C 1.95 -4.5 1.9 -1 1.85 0.9 C 1.8 1.75 1.25 2.1 0.55 2.05 C 0.1 2 -0.1 1.65 -0.05 1.3
            M 0.8 -3 C 1.5 -3.1 2.1 -2.95 2.9 -3.05`],
  K: [4.8, `${capStem(1.2)}
            M 0.2 -5 C 0 -4.1 0 -1.9 0.2 -1
            M 1.2 -3.4 C 1.9 -4.6 2.7 -5.25 3.25 -5.1 C 3.75 -4.95 3.6 -3.9 2.9 -3.4 C 2.4 -3.05 1.85 -2.95 1.35 -2.95
            M 2.3 -3.1 C 3 -2.6 3.4 -2 3.4 -1.2 L 3.4 -0.7 C 3.4 -0.2 3.7 0.05 4.15 -0.15`],
  L: [4.6, `M 0.25 -5.4 C 0.6 -6 1.2 -6.15 1.4 -5.65 C 1.6 -5.1 1.2 -2.2 1.2 -1.1 C 1.2 -0.35 1.7 0 2.4 0 L 3.3 0 C 3.75 0 4.05 -0.3 4.2 -0.7
            M 1.75 -6 C 2.3 -6.3 2.95 -6.15 3.2 -5.6
            ${spike(1.2, -3.4)}`],
  M: [6.2, `M 0.3 -5.5 C 0.65 -6.05 1 -6.15 1 -5.6 L 1 -0.7 C 1 -0.2 0.65 0.05 0.2 -0.1
            ${shoulder(1, 2.8, -6)} ${foot(2.8)}
            ${shoulder(2.8, 4.6, -6)} ${foot(4.6)}
            ${spike(1, -3.6)} ${spike(2.8, -3.6)}`],
  N: [5, `M 0.3 -5.5 C 0.65 -6.05 1 -6.15 1 -5.6 L 1 -0.7 C 1 -0.2 0.65 0.05 0.2 -0.1
            ${shoulder(1, 3.4, -6)} ${foot(3.4)}
            ${spike(1, -3.6)}`],
  O: [4.8, `${capRound.replace('C 3.05 0 3.5 -0.25 3.95 -0.7', 'C 2.5 0 2.6 0 2.65 -0.02')}
            M 2.1 -6 C 3.35 -6 4.2 -4.75 4.2 -3 C 4.2 -1.25 3.4 0 2.2 0
            ${capInner()}`],
  P: [4.6, `M 0.2 -5.5 C 0.55 -6.05 1 -6.15 1 -5.6 L 1 1.4 C 1 1.75 0.75 2 0.35 2.05
            M 1 -6 C 2.35 -6.2 3.5 -5.85 3.5 -4.6 C 3.5 -3.4 2.5 -2.65 1 -2.6
            ${spike(1, -4.6)}
            M 0.15 2.05 C 0.7 1.95 1.3 1.95 1.9 2.05`],
  Q: [5, `${capRound.replace('C 3.05 0 3.5 -0.25 3.95 -0.7', 'C 2.5 0 2.6 0 2.65 -0.02')}
            M 2.1 -6 C 3.35 -6 4.2 -4.75 4.2 -3 C 4.2 -1.25 3.4 0 2.2 0
            ${capInner()}
            M 2.2 0 C 3 0.05 3.5 0.55 4.1 0.6 C 4.4 0.62 4.65 0.5 4.8 0.3`],
  R: [4.8, `${capStem(1)}
            M 1 -6 C 2.35 -6.2 3.5 -5.85 3.5 -4.6 C 3.5 -3.4 2.5 -2.65 1.2 -2.6
            M 2.3 -2.7 C 3 -2.3 3.3 -1.6 3.3 -1 C 3.3 -0.3 3.65 0.05 4.15 -0.15
            ${spike(1, -4.6)}`],
  S: [4.4, `M 3.45 -5.4 C 3.15 -5.85 2.6 -6.05 1.95 -6.05 C 1.05 -6.05 0.55 -5.55 0.55 -4.75 C 0.55 -3.5 3.55 -2.9 3.55 -1.4 C 3.55 -0.5 2.85 0.05 1.8 0.05 C 1.05 0.05 0.5 -0.25 0.2 -0.75
            M 2.4 -6.15 C 2.9 -6.4 3.45 -6.3 3.75 -5.9`],
  T: [4.6, `M 0 -5.5 C 0.55 -6.1 1.5 -6.15 2.35 -6 C 3.1 -5.85 3.85 -5.95 4.45 -6.35
            ${capRound} ${capInner()}`],
  U: [5, `M 0.2 -5.5 C 0.55 -6.05 1 -6.15 1 -5.6 L 1 -1.1 C 1 -0.35 1.5 0.05 2.1 0.05 C 2.7 0.05 3.15 -0.3 3.5 -0.75
            M 2.9 -6.05 C 3.35 -6.1 3.5 -5.8 3.5 -5.3 ${foot(3.5)}
            ${spike(1, -3.4)}`],
  V: [4.8, `M 0.2 -5.5 C 0.55 -6.05 1 -6.15 1 -5.6 L 1 -1.3 C 1 -0.45 1.55 0.05 2.25 0.05
            M 2.9 -6.05 C 3.35 -6.1 3.55 -5.8 3.55 -5.3 L 3.55 -1.6 C 3.55 -0.6 3 0.05 2.25 0.05
            ${spike(1, -3.4)}`],
  W: [6.5, `M 0.2 -5.5 C 0.55 -6.05 1 -6.15 1 -5.6 L 1 -1.1 C 1 -0.35 1.45 0.05 2 0.05 C 2.4 0.05 2.65 -0.2 2.8 -0.5
            M 2.3 -5.5 C 2.6 -5.6 2.8 -5.4 2.8 -5 L 2.8 -1.2 C 2.8 -0.4 3.3 0.05 3.95 0.05
            M 4.7 -6.05 C 5.15 -6.1 5.35 -5.8 5.35 -5.3 L 5.35 -1.6 C 5.35 -0.6 4.75 0.05 3.95 0.05
            ${spike(1, -3.4)} ${spike(2.8, -3.4)}`],
  X: [4.8, `M 0.3 -5.6 C 0.65 -6.1 1.1 -6.1 1.35 -5.6 C 2 -4 2.75 -2 3.25 -0.75 C 3.45 -0.25 3.75 0.05 4.25 -0.15
            M 3.7 -6.05 C 2.8 -4.1 1.9 -2 1.1 -0.75 C 0.8 -0.25 0.45 0.05 -0.05 -0.05
            M 0.6 -3 C 1.6 -3.1 2.6 -2.95 3.7 -3.05`],
  Y: [5, `M 0.2 -5.5 C 0.55 -6.05 1 -6.15 1 -5.6 L 1 -1.3 C 1 -0.6 1.45 -0.25 2 -0.25 C 2.6 -0.25 3.05 -0.55 3.5 -0.95
            M 2.9 -6.05 C 3.35 -6.1 3.5 -5.8 3.5 -5.3 ${tail(3.5)}
            ${spike(1, -3.4)}`],
  Z: [4.8, `M 0.3 -5.4 C 0.7 -6 1.3 -6.05 2 -6 C 2.6 -5.95 3.2 -5.9 3.75 -6.05 C 2.75 -4 1.6 -2 0.55 -0.3 C 1.4 -0.1 2.3 0.05 3.05 0 C 3.5 -0.05 3.85 -0.3 4.05 -0.65
            M 0.9 -3 C 1.8 -3.1 2.6 -2.95 3.4 -3.05`],
};

/**
 * Room added to every letter's advance: the feet and hooks reach past the stems, and without it
 * one letter's foot runs into the next one's lead-in.
 */
const SIDE = { lower: 0.35, upper: 0.45 };

/** Extra room on the left of letters whose doubled stem reaches back past x = 0. */
const LEAD: Record<string, number> = { B: 0.4, K: 0.25 };

const LETTERS: Record<string, Def> = Object.fromEntries(
  Object.entries(PATHS).map(([ch, [advance, d]]) => {
    const lead = LEAD[ch] ?? 0;
    const side = ch === ch.toUpperCase() ? SIDE.upper : SIDE.lower;
    const strokes = strokesOf(d).map((s) => s.map(([x, y]): Pt => [x + lead, y]));
    return [ch, { advance: advance + side + lead, strokes }];
  }),
);

// Figures, punctuation and space: the plain Gothic's (the blackletter's, at these proportions).
const glyphs = glyphMap({ ...penGothicDefs(), ...LETTERS });

/** Capital height and x-height, in nib widths: the plain Gothic's. */
export const ROTUNDA_CAP_NIBS = PEN_GOTHIC_CAP_NIBS;
export const ROTUNDA_X_NIBS = PEN_GOTHIC_X_NIBS;

/** The glyph for a character, in nib widths (y down, baseline 0), if there is one. */
export function rotundaGlyph(ch: string): StrokeGlyph | undefined {
  return glyphs.get(ch);
}
