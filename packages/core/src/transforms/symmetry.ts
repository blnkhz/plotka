import { documentBounds, isEmptyBounds } from '../geometry/bounds';
import { multiply, rotate, scaleMatrix, translate, type Matrix } from '../geometry/matrix';
import { transformFill, transformPolyline } from '../geometry/transform-doc';
import type { Layer, PlotDocument } from '../model';
import type { ParamValues, TransformDef } from './types';

/** Stop adding copies past this many output points. */
export const MAX_SYMMETRY_POINTS = 2_000_000;

const num = (p: ParamValues, k: string, d: number) =>
  typeof p[k] === 'number' ? (p[k] as number) : d;

/**
 * GEN-2: rotational and mirror symmetry around the artwork's center: N copies turned evenly,
 * optionally with mirrored copies (left–right, top–bottom, or both).
 */
export const symmetry: TransformDef = {
  type: 'symmetry',
  name: 'Symmetry',
  description: 'Turn and mirror copies of the artwork around its center.',
  params: [
    {
      key: 'copies',
      label: 'Copies',
      type: 'number',
      default: 6,
      min: 1,
      max: 64,
      step: 1,
      integer: true,
      help: 'Copies turned evenly around the center (6 = every 60°). 1 = no turning.',
    },
    {
      key: 'mirror',
      label: 'Mirror',
      type: 'select',
      default: 'none',
      options: [
        { value: 'none', label: 'None' },
        { value: 'x', label: 'Left–right' },
        { value: 'y', label: 'Top–bottom' },
        { value: 'both', label: 'Both' },
      ],
      help: 'Also add mirrored copies of each turned copy.',
    },
    {
      key: 'angle',
      label: 'Start angle',
      type: 'number',
      default: 0,
      min: -360,
      max: 360,
      step: 5,
      suffix: '°',
      help: 'Turn the whole pattern.',
    },
  ],

  apply(doc, p) {
    const b = documentBounds(doc);
    if (isEmptyBounds(b)) return doc;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const n = Math.max(1, Math.min(64, Math.round(num(p, 'copies', 6))));
    const mirror = String(p['mirror'] ?? 'none');
    const flips: [number, number][] = [[1, 1]];
    if (mirror === 'x' || mirror === 'both') flips.push([-1, 1]);
    if (mirror === 'y' || mirror === 'both') flips.push([1, -1]);
    if (mirror === 'both') flips.push([-1, -1]);

    const points = doc.layers.reduce(
      (s, l) =>
        s +
        l.strokes.reduce((m, x) => m + x.points.length, 0) +
        l.fills.reduce((m, f) => m + f.outer.reduce((k, r) => k + r.length, 0), 0),
      0,
    );
    const maxCopies = Math.max(1, Math.floor(MAX_SYMMETRY_POINTS / Math.max(1, points)));
    const layers: Layer[] = doc.layers.map((l) => ({ ...l, strokes: [], fills: [] }));
    let made = 0;
    const total = n * flips.length;
    outer: for (let k = 0; k < n; k++)
      for (const [fx, fy] of flips) {
        if (made >= maxCopies) break outer;
        let m: Matrix = translate(-cx, -cy);
        m = multiply(scaleMatrix(fx, fy), m);
        m = multiply(rotate(num(p, 'angle', 0) + (360 * k) / n), m);
        m = multiply(translate(cx, cy), m);
        doc.layers.forEach((l, li) => {
          for (const s of l.strokes) layers[li]!.strokes.push(transformPolyline(s, m));
          for (const f of l.fills) layers[li]!.fills.push(transformFill(f, m));
        });
        made++;
      }
    const warnings =
      made < total
        ? [
            ...doc.warnings,
            `Symmetry stopped at ${made} of ${total} copies to keep the app responsive.`,
          ]
        : doc.warnings;
    const out: PlotDocument = { ...doc, layers, warnings };
    const ob = documentBounds(out);
    return { ...out, width: ob.maxX - ob.minX, height: ob.maxY - ob.minY };
  },
};
