import { documentBounds, isEmptyBounds } from '../geometry/bounds';
import {
  IDENTITY,
  multiply,
  rotate,
  scaleMatrix,
  translate,
  type Matrix,
} from '../geometry/matrix';
import { transformFill, transformPolyline } from '../geometry/transform-doc';
import type { Layer, PlotDocument } from '../model';
import type { ParamSpec, ParamValues, TransformDef } from './types';

/** Stop adding copies past this many output points, or this many copies. */
export const MAX_FRACTAL_POINTS = 2_000_000;
export const MAX_FRACTAL_COPIES = 100_000;
export const FRACTAL_SLOTS = 4;

const num = (p: ParamValues, k: string, d: number) =>
  typeof p[k] === 'number' ? (p[k] as number) : d;

const slotFields = (i: number): ParamSpec[] => {
  const visible = (p: ParamValues) => num(p, 'copies', 3) >= i;
  const label = (what: string) => `Copy ${i} ${what}`;
  return [
    {
      key: `size${i}`,
      label: label('size'),
      type: 'number',
      default: 50,
      min: 1,
      max: 100,
      step: 1,
      suffix: '%',
      help: 'Size of this copy compared to the one it comes from.',
      visible,
    },
    {
      key: `turn${i}`,
      label: label('turn'),
      type: 'number',
      default: 0,
      min: -360,
      max: 360,
      step: 5,
      suffix: '°',
      visible,
    },
    {
      key: `x${i}`,
      label: label('X'),
      type: 'number',
      default: [0, -25, 25, 0][i - 1]!,
      min: -200,
      max: 200,
      step: 1,
      suffix: '%',
      help: 'Where this copy sits, from the middle, as a share of the artwork size (its longer side).',
      visible,
    },
    {
      key: `y${i}`,
      label: label('Y'),
      type: 'number',
      default: [-25, 25, 25, 0][i - 1]!,
      min: -200,
      max: 200,
      step: 1,
      suffix: '%',
      help: 'Negative is up.',
      visible,
    },
  ];
};

/** Fills every copy slot, so a preset never inherits stray values from the previous settings. */
const preset = (
  label: string,
  base: { copies: number; levels: number; keep: boolean; minSize: number },
  slots: [size: number, turn: number, x: number, y: number][],
): { label: string; params: ParamValues } => {
  const params: ParamValues = { ...base };
  for (let i = 1; i <= FRACTAL_SLOTS; i++) {
    const [size, turn, x, y] = slots[i - 1] ?? [50, 0, 0, 0];
    Object.assign(params, { [`size${i}`]: size, [`turn${i}`]: turn, [`x${i}`]: x, [`y${i}`]: y });
  }
  return { label, params };
};

/**
 * GEN-3: an iterated function system. The artwork is copied through up to four transforms (size,
 * turn, position), then each copy through them again, for a number of levels.
 */
export const fractal: TransformDef = {
  type: 'fractal',
  name: 'Fractal',
  description: 'Copy the artwork into smaller copies of itself, level after level.',
  presets: [
    preset('Triangle', { copies: 3, levels: 5, keep: false, minSize: 0.5 }, [
      [50, 0, 0, -25],
      [50, 0, -25, 25],
      [50, 0, 25, 25],
    ]),
    preset('Branches', { copies: 2, levels: 8, keep: true, minSize: 1 }, [
      [70, -30, -18, -80],
      [70, 30, 18, -80],
    ]),
    preset('Spiral', { copies: 1, levels: 30, keep: true, minSize: 1 }, [[90, 20, 30, 0]]),
    preset('Pinwheel', { copies: 4, levels: 4, keep: false, minSize: 0.5 }, [
      [45, 15, -28, -28],
      [45, 105, 28, -28],
      [45, 195, 28, 28],
      [45, 285, -28, 28],
    ]),
  ],
  params: [
    {
      key: 'copies',
      label: 'Copies per level',
      type: 'number',
      default: 3,
      min: 1,
      max: FRACTAL_SLOTS,
      step: 1,
      integer: true,
    },
    {
      key: 'levels',
      label: 'Levels',
      type: 'number',
      default: 5,
      min: 1,
      max: 30,
      step: 1,
      integer: true,
      help: 'How many times the copying repeats. Copies multiply quickly: 3 copies over 8 levels is 6,561.',
    },
    {
      key: 'minSize',
      label: 'Smallest copy',
      type: 'number',
      default: 0.5,
      min: 0,
      max: 50,
      step: 0.5,
      suffix: '%',
      help: 'Copies smaller than this share of the artwork are left out, and their branch stops there.',
    },
    {
      key: 'keep',
      label: 'Keep every level',
      type: 'boolean',
      default: false,
      help: 'On draws every level (trees, spirals). Off draws only the last one (like a Sierpinski triangle).',
    },
    ...Array.from({ length: FRACTAL_SLOTS }, (_, i) => slotFields(i + 1)).flat(),
  ],

  apply(doc, p) {
    const b = documentBounds(doc);
    if (isEmptyBounds(b)) return doc;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const unit = Math.max(b.maxX - b.minX, b.maxY - b.minY);
    const copies = Math.max(1, Math.min(FRACTAL_SLOTS, Math.round(num(p, 'copies', 3))));
    const levels = Math.max(1, Math.min(30, Math.round(num(p, 'levels', 5))));
    const minSize = Math.max(0, num(p, 'minSize', 0.5)) / 100;
    const keep = p['keep'] === true;

    const maps = Array.from({ length: copies }, (_, k) => {
      const i = k + 1;
      // Sizes stay at or under 100%, so every branch shrinks and ends.
      const s = Math.max(0.01, Math.min(1, num(p, `size${i}`, 50) / 100));
      let m: Matrix = translate(-cx, -cy);
      m = multiply(scaleMatrix(s), m);
      m = multiply(rotate(num(p, `turn${i}`, 0)), m);
      m = multiply(
        translate(cx + (num(p, `x${i}`, 0) / 100) * unit, cy + (num(p, `y${i}`, 0) / 100) * unit),
        m,
      );
      return { m, s };
    });

    const points = doc.layers.reduce(
      (n, l) =>
        n +
        l.strokes.reduce((k, x) => k + x.points.length, 0) +
        l.fills.reduce((k, f) => k + f.outer.reduce((j, r) => j + r.length, 0), 0),
      0,
    );
    const maxCopies = Math.max(
      1,
      Math.min(MAX_FRACTAL_COPIES, Math.floor(MAX_FRACTAL_POINTS / Math.max(1, points))),
    );
    const layers: Layer[] = doc.layers.map((l) => ({ ...l, strokes: [], fills: [] }));
    let made = 0;
    let stopped = false;
    const emit = (m: Matrix) => {
      if (made >= maxCopies) {
        stopped = true;
        return;
      }
      doc.layers.forEach((l, li) => {
        const out = layers[li]!;
        for (const s of l.strokes) out.strokes.push(transformPolyline(s, m));
        for (const f of l.fills) out.fills.push(transformFill(f, m));
      });
      made++;
    };
    const visit = (m: Matrix, size: number, level: number) => {
      if (stopped) return;
      const children = maps.filter((c) => size * c.s >= minSize);
      const leaf = level === levels || children.length === 0;
      if (keep || leaf) emit(m);
      if (leaf) return;
      for (const c of children) visit(multiply(m, c.m), size * c.s, level + 1);
    };
    visit(IDENTITY, 1, 0);

    const warnings = stopped
      ? [
          ...doc.warnings,
          `Fractal stopped at ${made.toLocaleString('en-US')} copies to keep the app responsive. Try fewer levels or a bigger smallest copy.`,
        ]
      : doc.warnings;
    const out: PlotDocument = { ...doc, layers, warnings };
    const ob = documentBounds(out);
    return isEmptyBounds(ob)
      ? out
      : { ...out, width: ob.maxX - ob.minX, height: ob.maxY - ob.minY };
  },
};
