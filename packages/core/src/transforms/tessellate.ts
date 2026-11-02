import { documentBounds, isEmptyBounds } from '../geometry/bounds';
import { clipPolylines, clipRing } from '../geometry/clip';
import {
  applyToPoint,
  multiply,
  rotate,
  scaleMatrix,
  translate,
  type Matrix,
} from '../geometry/matrix';
import {
  clipPolylinesToShape,
  intersectShapes,
  regionShape,
  shapeCentroid,
} from '../geometry/polygon';
import { transformDocument, transformFill, transformPolyline } from '../geometry/transform-doc';
import type { Vec2 } from '../geometry/vec2';
import type { FillRegion, Layer, PlotDocument } from '../model';
import type { ParamValues, TransformDef } from './types';
import {
  cartesianOps,
  cartesianRegion,
  getWallpaperGroup,
  latticeBasis,
  WALLPAPER_GROUPS,
} from './wallpaper';

/** Stop adding copies past this many output points. */
export const MAX_TESSELLATE_POINTS = 2_000_000;

const num = (p: ParamValues, k: string, d: number) =>
  typeof p[k] === 'number' ? (p[k] as number) : d;
const bool = (p: ParamValues, k: string, d: boolean) =>
  typeof p[k] === 'boolean' ? (p[k] as boolean) : d;

const polyBounds = (pts: Vec2[]) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
};

/**
 * True tessellation: the artwork goes into the fundamental region of a wallpaper group, and the
 * group's rotations, mirrors and glides plus the lattice shifts fill a rectangle with copies.
 */
export const tessellate: TransformDef = {
  type: 'tessellate',
  name: 'Tessellate',
  description:
    'Repeat the artwork with rotations and mirrors: square, triangle and hexagon patterns.',
  params: [
    {
      key: 'pattern',
      label: 'Pattern',
      type: 'select',
      default: 'p6m',
      options: WALLPAPER_GROUPS.map((g) => ({ value: g.id, label: g.label })),
      help: 'How copies are turned and mirrored. These are the 17 wallpaper patterns (every way to repeat a design across a plane), plus a honeycomb and alternating triangles.',
    },
    {
      key: 'columns',
      label: 'Columns',
      type: 'number',
      default: 5,
      min: 1,
      max: 60,
      step: 1,
      integer: true,
      help: 'Width of the pattern, in repeating cells.',
    },
    {
      key: 'rows',
      label: 'Rows',
      type: 'number',
      default: 5,
      min: 1,
      max: 60,
      step: 1,
      integer: true,
      help: 'Height of the pattern, in rows of cells.',
    },
    {
      key: 'cellSize',
      label: 'Cell size',
      type: 'number',
      default: 40,
      min: 1,
      max: 1000,
      step: 1,
      suffix: 'mm',
      help: 'Width of one repeating cell. Only matters at 100% page size; "Fit to margins" scales the whole pattern.',
    },
    {
      key: 'aspect',
      label: 'Cell height',
      type: 'number',
      default: 100,
      min: 10,
      max: 1000,
      step: 5,
      suffix: '%',
      help: 'Cell height as a share of its width. Only for the patterns without turns of less than half (p1 to cmm).',
    },
    {
      key: 'motifScale',
      label: 'Artwork size',
      type: 'number',
      default: 100,
      min: 5,
      max: 1000,
      step: 5,
      suffix: '%',
      help: '100% fits the artwork in its piece of the cell. Larger fills the piece (with clipping) or overlaps neighbors (without).',
    },
    {
      key: 'motifRotation',
      label: 'Artwork turn',
      type: 'number',
      default: 0,
      min: -360,
      max: 360,
      step: 5,
      suffix: '°',
    },
    {
      key: 'motifX',
      label: 'Artwork X',
      type: 'number',
      default: 0,
      min: -200,
      max: 200,
      step: 5,
      suffix: '%',
      help: 'Move the artwork within its piece, as a share of the piece width.',
    },
    {
      key: 'motifY',
      label: 'Artwork Y',
      type: 'number',
      default: 0,
      min: -200,
      max: 200,
      step: 5,
      suffix: '%',
    },
    {
      key: 'clip',
      label: 'Clip to its piece',
      type: 'boolean',
      default: true,
      help: 'Cut the artwork to its piece of the cell, so copies meet without overlapping.',
    },
    {
      key: 'trim',
      label: 'Trim to a rectangle',
      type: 'boolean',
      default: true,
      help: 'Cut the pattern to a clean rectangle. Off keeps whole pieces with a ragged edge.',
    },
  ],

  apply(doc, p) {
    const bounds = documentBounds(doc);
    if (isEmptyBounds(bounds)) return doc;
    const group = getWallpaperGroup(String(p['pattern'] ?? 'p6m')) ?? getWallpaperGroup('p6m')!;
    const size = Math.max(1e-3, num(p, 'cellSize', 40));
    const { a, b } = latticeBasis(group.lattice, size, num(p, 'aspect', 100) / 100);
    const ops = cartesianOps(group, a, b);
    const region = cartesianRegion(group, a, b);
    const rb = polyBounds(region);
    const rc = shapeCentroid([region]) ?? {
      x: (rb.minX + rb.maxX) / 2,
      y: (rb.minY + rb.maxY) / 2,
    };

    // Place the artwork in the fundamental region: centered, fitted to its bounds.
    const bw = Math.max(bounds.maxX - bounds.minX, 1e-9);
    const bh = Math.max(bounds.maxY - bounds.minY, 1e-9);
    const rw = rb.maxX - rb.minX;
    const rh = rb.maxY - rb.minY;
    const fit = Math.min(rw / bw, rh / bh) * (num(p, 'motifScale', 100) / 100);
    let place: Matrix = translate(
      -(bounds.minX + bounds.maxX) / 2,
      -(bounds.minY + bounds.maxY) / 2,
    );
    place = multiply(scaleMatrix(fit), place);
    place = multiply(rotate(num(p, 'motifRotation', 0)), place);
    place = multiply(
      translate(rc.x + (num(p, 'motifX', 0) / 100) * rw, rc.y + (num(p, 'motifY', 0) / 100) * rh),
      place,
    );
    let motif = transformDocument(doc, place);
    if (bool(p, 'clip', true)) {
      const piece = [region];
      motif = {
        ...motif,
        layers: motif.layers.map((l) => ({
          ...l,
          strokes: clipPolylinesToShape(l.strokes, piece, 'inside'),
          fills: l.fills
            .map((f): FillRegion | null => {
              const s = intersectShapes(regionShape(f), piece);
              return s.length ? { ...f, outer: s, fillRule: 'nonzero' } : null;
            })
            .filter((f): f is FillRegion => f !== null),
        })),
      };
    }

    // Copies: every op, shifted by every lattice vector that reaches the target rectangle.
    const columns = Math.max(1, Math.round(num(p, 'columns', 5)));
    const rows = Math.max(1, Math.round(num(p, 'rows', 5)));
    const W = columns * Math.hypot(a.x, a.y);
    const H = rows * Math.abs(b.y);
    const trim = bool(p, 'trim', true);
    const motifPoints = motif.layers.reduce(
      (n, l) =>
        n +
        l.strokes.reduce((m, s) => m + s.points.length, 0) +
        l.fills.reduce((m, f) => m + f.outer.reduce((k, r) => k + r.length, 0), 0),
      0,
    );
    const maxCopies = Math.max(1, Math.floor(MAX_TESSELLATE_POINTS / Math.max(1, motifPoints)));
    const jMax = Math.ceil(H / Math.abs(b.y)) + 1;
    const iShift = Math.ceil((jMax * Math.abs(b.x)) / Math.hypot(a.x, a.y)) + 1;

    const layers: Layer[] = motif.layers.map((l) => ({ ...l, strokes: [], fills: [] }));
    let copies = 0;
    let stopped = false;
    // Ops can move the piece up to a cell away, so look one extra cell beyond each side.
    outer: for (let j = -2; j <= jMax + 1; j++)
      for (let i = -2 - iShift; i <= columns + iShift + 1; i++)
        for (const g of ops) {
          const m = multiply(translate(i * a.x + j * b.x, i * a.y + j * b.y), g);
          const piece = region.map((q) => applyToPoint(m, q.x, q.y));
          const pb = polyBounds(piece);
          if (trim) {
            if (pb.maxX <= 0 || pb.minX >= W || pb.maxY <= 0 || pb.minY >= H) continue;
          } else {
            const c = applyToPoint(m, rc.x, rc.y);
            if (c.x < 0 || c.x >= W || c.y < 0 || c.y >= H) continue;
          }
          if (copies >= maxCopies) {
            stopped = true;
            break outer;
          }
          motif.layers.forEach((l, li) => {
            const out = layers[li]!;
            for (const s of l.strokes) out.strokes.push(transformPolyline(s, m));
            for (const f of l.fills) out.fills.push(transformFill(f, m));
          });
          copies++;
        }

    let result: PlotDocument = { ...doc, layers };
    if (trim) {
      const rect = { x: 0, y: 0, width: W, height: H };
      result = {
        ...result,
        layers: result.layers.map((l) => ({
          ...l,
          strokes: clipPolylines(l.strokes, rect).inside,
          fills: l.fills
            .map((f) => ({
              ...f,
              outer: f.outer.map((r) => clipRing(r, rect)).filter((r) => r.length >= 3),
            }))
            .filter((f) => f.outer.length > 0),
        })),
      };
    }
    if (stopped)
      result = {
        ...result,
        warnings: [
          ...result.warnings,
          `Tessellate stopped at ${copies} copies to keep the app responsive. Try fewer rows or columns.`,
        ],
      };
    const out = documentBounds(result);
    return isEmptyBounds(out)
      ? { ...result, width: W, height: H }
      : { ...result, width: out.maxX - out.minX, height: out.maxY - out.minY };
  },
};
