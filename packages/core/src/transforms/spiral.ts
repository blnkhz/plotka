import { documentBounds, isEmptyBounds } from '../geometry/bounds';
import { multiply, rotate, scaleMatrix, translate, type Matrix } from '../geometry/matrix';
import { transformFill, transformPolyline } from '../geometry/transform-doc';
import type { Layer, PlotDocument } from '../model';
import type { ParamValues, TransformDef } from './types';

/** Stop adding copies past this many output points. */
export const MAX_SPIRAL_POINTS = 2_000_000;

const num = (p: ParamValues, k: string, d: number) =>
  typeof p[k] === 'number' ? (p[k] as number) : d;

/**
 * GEN-4: copies of the artwork placed along a spiral, from an inner to an outer radius, growing
 * or shrinking along the way and optionally turned to follow the spiral.
 */
export const spiralRepeat: TransformDef = {
  type: 'spiral',
  name: 'Spiral repeat',
  description: 'Place copies of the artwork along a spiral.',
  params: [
    {
      key: 'copies',
      label: 'Copies',
      type: 'number',
      default: 24,
      min: 2,
      max: 500,
      step: 1,
      integer: true,
    },
    {
      key: 'turns',
      label: 'Turns',
      type: 'number',
      default: 2,
      min: 0.1,
      max: 20,
      step: 0.25,
      help: 'How many times the spiral goes round.',
    },
    {
      key: 'inner',
      label: 'Inner radius',
      type: 'number',
      default: 20,
      min: 0,
      max: 2000,
      step: 5,
      suffix: 'mm',
      help: 'Distance of the first copy from the center, in the artwork’s own size.',
    },
    {
      key: 'outer',
      label: 'Outer radius',
      type: 'number',
      default: 120,
      min: 0,
      max: 5000,
      step: 5,
      suffix: 'mm',
      help: 'Distance of the last copy from the center.',
    },
    {
      key: 'endSize',
      label: 'Last copy size',
      type: 'number',
      default: 100,
      min: 1,
      max: 1000,
      step: 5,
      suffix: '%',
      help: 'Size of the last copy; sizes change evenly from 100% for the first.',
    },
    {
      key: 'follow',
      label: 'Turn with the spiral',
      type: 'boolean',
      default: true,
      help: 'Rotate each copy to face along the spiral.',
    },
  ],

  apply(doc, p) {
    const b = documentBounds(doc);
    if (isEmptyBounds(b)) return doc;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const n = Math.max(2, Math.min(500, Math.round(num(p, 'copies', 24))));
    const turns = num(p, 'turns', 2);
    const r0 = num(p, 'inner', 20);
    const r1 = num(p, 'outer', 120);
    const s1 = num(p, 'endSize', 100) / 100;
    const follow = p['follow'] !== false;
    const points = doc.layers.reduce(
      (s, l) =>
        s +
        l.strokes.reduce((m, x) => m + x.points.length, 0) +
        l.fills.reduce((m, f) => m + f.outer.reduce((k, r) => k + r.length, 0), 0),
      0,
    );
    const maxCopies = Math.max(1, Math.floor(MAX_SPIRAL_POINTS / Math.max(1, points)));
    const layers: Layer[] = doc.layers.map((l) => ({ ...l, strokes: [], fills: [] }));
    const count = Math.min(n, maxCopies);
    for (let i = 0; i < count; i++) {
      const t = i / (n - 1);
      const a = t * turns * 2 * Math.PI;
      const r = r0 + (r1 - r0) * t;
      const s = 1 + (s1 - 1) * t;
      let m: Matrix = translate(-cx, -cy);
      m = multiply(scaleMatrix(s), m);
      if (follow) m = multiply(rotate((a * 180) / Math.PI + 90), m);
      m = multiply(translate(r * Math.cos(a), r * Math.sin(a)), m);
      doc.layers.forEach((l, li) => {
        for (const x of l.strokes) layers[li]!.strokes.push(transformPolyline(x, m));
        for (const f of l.fills) layers[li]!.fills.push(transformFill(f, m));
      });
    }
    const warnings =
      count < n
        ? [
            ...doc.warnings,
            `Spiral repeat stopped at ${count} of ${n} copies to keep the app responsive.`,
          ]
        : doc.warnings;
    const out: PlotDocument = { ...doc, layers, warnings };
    const ob = documentBounds(out);
    return { ...out, width: ob.maxX - ob.minX, height: ob.maxY - ob.minY };
  },
};
