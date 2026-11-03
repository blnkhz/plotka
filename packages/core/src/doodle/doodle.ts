import type { Vec2 } from '../geometry/vec2';
import {
  differenceShapes,
  intersectShapes,
  normalizeShape,
  unionShapes,
  xorShapes,
  type Shape,
} from '../geometry/polygon';
import { bezierPoint, fitCubics, simplifyLines, type Cubic } from './fit';

/** A freehand stroke as drawn, in mm on the doodle artboard. */
export type DoodleStroke = { points: Vec2[] };

/**
 * How a combined shape is made from its items (bottom first): `union` merges them,
 * `subtract` cuts the others out of the first, `intersect` keeps where all overlap, `exclude`
 * keeps what's covered an odd number of times (removes the overlaps).
 */
export type BooleanOp = 'union' | 'subtract' | 'intersect' | 'exclude';

/** Closed shapes combined with a boolean operation. Kept as its pieces, never baked. */
export type DoodleShape = { op: BooleanOp; items: DoodleItem[] };

/** What a doodle is made of: strokes as drawn, and combined shapes. */
export type DoodleItem = DoodleStroke | DoodleShape;

export const isDoodleShape = (item: DoodleItem): item is DoodleShape => 'op' in item;

export type DoodleSettings = {
  /** 0 (as drawn) .. 100 (very smooth). */
  smoothing: number;
  /** Bézier curves, or straight segments. */
  style: 'curves' | 'lines';
  /** Don't smooth away sharp turns. */
  keepCorners: boolean;
  /** Close a stroke whose ends are within this many mm. 0 = never. */
  closeGap: number;
  /** Fill closed shapes (so they can be hatched). */
  fillClosed: boolean;
  /** With fillClosed: also draw the outline of filled shapes. Off = fill only. */
  keepOutlines: boolean;
};

export const defaultDoodleSettings = (): DoodleSettings => ({
  smoothing: 40,
  style: 'curves',
  keepCorners: true,
  closeGap: 3,
  fillClosed: false,
  keepOutlines: true,
});

/** A processed stroke: straight segments or cubic curves through the smoothed path. */
export type DoodlePath =
  | { kind: 'lines'; points: Vec2[]; closed: boolean }
  | { kind: 'curves'; curves: Cubic[]; closed: boolean }
  /** A combined shape: outer rings and holes (evenodd). */
  | { kind: 'shape'; rings: Vec2[][]; closed: true };

/** Even spacing used before smoothing, mm. */
const RESAMPLE = 0.25;
/** Turning angle (degrees, over a short window) treated as a corner. */
const CORNER_DEG = 50;
/** Window for corner detection, mm on each side. */
const CORNER_WINDOW = 1.5;
/** Light smoothing (sigma, mm) applied before looking for corners. */
const CORNER_SMOOTH = 0.75;

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Points spaced `step` mm apart along the stroke (first and last kept). */
export function resample(points: Vec2[], step = RESAMPLE): Vec2[] {
  if (points.length < 2) return points.slice();
  const out: Vec2[] = [points[0]!];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const d = dist(a, b);
    let t = step - carry;
    while (t <= d) {
      out.push({ x: a.x + ((b.x - a.x) * t) / d, y: a.y + ((b.y - a.y) * t) / d });
      t += step;
    }
    carry = d - (t - step);
  }
  const last = points[points.length - 1]!;
  if (dist(out[out.length - 1]!, last) > 1e-9) out.push(last);
  return out;
}

/** Indices of sharp corners in an evenly spaced path. */
export function findCorners(pts: Vec2[], step = RESAMPLE): number[] {
  const w = Math.max(1, Math.round(CORNER_WINDOW / step));
  const cos = Math.cos((CORNER_DEG * Math.PI) / 180);
  const sharp: { i: number; c: number }[] = [];
  for (let i = w; i < pts.length - w; i++) {
    const a = pts[i - w]!;
    const p = pts[i]!;
    const b = pts[i + w]!;
    const ux = p.x - a.x;
    const uy = p.y - a.y;
    const vx = b.x - p.x;
    const vy = b.y - p.y;
    const l = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    if (l === 0) continue;
    const c = (ux * vx + uy * vy) / l;
    if (c < cos) sharp.push({ i, c });
  }
  // Keep the sharpest point of each run of neighbors.
  const corners: number[] = [];
  for (const s of sharp) {
    const prev = corners[corners.length - 1];
    if (prev !== undefined && s.i - prev <= w) {
      const prevC = sharp.find((x) => x.i === prev)!.c;
      if (s.c < prevC) corners[corners.length - 1] = s.i;
    } else corners.push(s.i);
  }
  return corners;
}

/** Gaussian smoothing along the path; `sigma` in samples. The two ends stay where they are. */
export function smoothPath(pts: Vec2[], sigma: number): Vec2[] {
  if (sigma < 0.5 || pts.length < 3) return pts.slice();
  const r = Math.ceil(sigma * 3);
  const kernel = Array.from({ length: 2 * r + 1 }, (_, k) =>
    Math.exp(-((k - r) ** 2) / (2 * sigma * sigma)),
  );
  const n = pts.length;
  return pts.map((p, i) => {
    if (i === 0 || i === n - 1) return p;
    // Shrink the window near the ends so they don't pull inward.
    const reach = Math.min(r, i, n - 1 - i);
    let x = 0;
    let y = 0;
    let wsum = 0;
    for (let k = -reach; k <= reach; k++) {
      const w = kernel[k + r]!;
      const q = pts[i + k]!;
      x += q.x * w;
      y += q.y * w;
      wsum += w;
    }
    return { x: x / wsum, y: y / wsum };
  });
}

/** Smoothing 0..100 → Gaussian sigma in mm (up to 4 mm). */
const sigmaMm = (s: number) => (Math.min(100, Math.max(0, s)) / 100) * 4;
/** Simplification tolerance in mm: tight when not smoothing, looser when smoothing a lot. */
const tolerance = (s: number, style: DoodleSettings['style']) =>
  style === 'lines' ? 0.08 + (s / 100) * 1.2 : 0.04 + (s / 100) * 0.5;

/** Turns one raw stroke into a clean vector path. */
export function processStroke(stroke: DoodleStroke, s: DoodleSettings): DoodlePath | null {
  let pts = resample(stroke.points);
  if (pts.length < 2) return null;
  let closed = false;
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const length = (pts.length - 1) * RESAMPLE;
  if (s.closeGap > 0 && dist(first, last) <= s.closeGap && length > 3 * s.closeGap) {
    closed = true;
    pts = [...pts.slice(0, -1), first];
  }

  // Split at corners, smooth each piece, then simplify or fit curves per piece.
  // Corners are found on a lightly smoothed copy, so hand jitter doesn't count as a corner.
  const cuts = s.keepCorners ? findCorners(smoothPath(pts, CORNER_SMOOTH / RESAMPLE)) : [];
  const bounds = [0, ...cuts, pts.length - 1];
  const sigma = sigmaMm(s.smoothing) / RESAMPLE;
  const tol = tolerance(s.smoothing, s.style);
  const pieces: Vec2[][] = [];
  for (let k = 0; k < bounds.length - 1; k++) {
    const piece = pts.slice(bounds[k]!, bounds[k + 1]! + 1);
    if (piece.length >= 2) pieces.push(smoothPath(piece, sigma));
  }
  if (!pieces.length) return null;

  if (s.style === 'lines') {
    const points: Vec2[] = [];
    for (const piece of pieces) {
      const simple = simplifyLines(piece, tol);
      points.push(...(points.length ? simple.slice(1) : simple));
    }
    if (closed && points.length > 2) points.pop(); // the closing point repeats the first
    return points.length >= 2
      ? { kind: 'lines', points, closed: closed && points.length > 2 }
      : null;
  }
  const curves: Cubic[] = [];
  for (const piece of pieces) curves.push(...fitCubics(piece, tol));
  return curves.length ? { kind: 'curves', curves, closed } : null;
}

/** Segment length used to turn curves into polygons for combining, mm. */
const FLATTEN_STEP = 0.4;
/** Simplification of combined outlines, mm (well under a pen width). */
const SHAPE_TOLERANCE = 0.02;

/** A closed processed path as polygon rings. */
function rings(p: DoodlePath): Vec2[][] {
  if (p.kind === 'shape') return p.rings;
  if (p.kind === 'lines') return [p.points];
  const pts: Vec2[] = [p.curves[0]![0]];
  for (const c of p.curves) {
    const hull =
      Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y) +
      Math.hypot(c[2].x - c[1].x, c[2].y - c[1].y) +
      Math.hypot(c[3].x - c[2].x, c[3].y - c[2].y);
    const n = Math.max(2, Math.ceil(hull / FLATTEN_STEP));
    for (let i = 1; i <= n; i++) pts.push(bezierPoint(c, i / n));
  }
  return [pts];
}

/** Combines shapes (bottom first) with a boolean operation. */
export function combineShapes(op: BooleanOp, parts: Shape[]): Shape {
  const [first, ...rest] = parts;
  if (!first) return [];
  switch (op) {
    case 'union':
      return rest.reduce(unionShapes, first);
    case 'subtract':
      return differenceShapes(first, rest.reduce(unionShapes, [] as Shape));
    case 'intersect':
      return rest.reduce(intersectShapes, first);
    case 'exclude':
      return rest.reduce(xorShapes, first);
  }
}

/**
 * The area a doodle item covers with these settings, or null for an open stroke. A combined
 * shape whose piece is no longer closed (e.g. Close shapes turned off) leaves that piece out.
 */
export function itemShape(item: DoodleItem, s: DoodleSettings): Shape | null {
  if (!isDoodleShape(item)) {
    const p = processStroke(item, s);
    return p?.closed ? normalizeShape(rings(p)) : null;
  }
  return combineShapes(
    item.op,
    item.items.map((i) => itemShape(i, s) ?? []),
  );
}

/** Turns one doodle item into a clean vector path (null if nothing is left of it). */
export function processItem(item: DoodleItem, s: DoodleSettings): DoodlePath | null {
  if (!isDoodleShape(item)) return processStroke(item, s);
  const out = (itemShape(item, s) ?? [])
    .map((r) => {
      const simple = simplifyLines([...r, r[0]!], SHAPE_TOLERANCE);
      return simple.slice(0, -1);
    })
    .filter((r) => r.length >= 3);
  return out.length ? { kind: 'shape', rings: out, closed: true } : null;
}

/** All the strokes an item is made of, as drawn. */
export function itemStrokes(item: DoodleItem): DoodleStroke[] {
  return isDoodleShape(item) ? item.items.flatMap(itemStrokes) : [item];
}

const f = (n: number) => String(Math.round(n * 1000) / 1000);

const ringData = (r: Vec2[]) =>
  `M${f(r[0]!.x)} ${f(r[0]!.y)}${r
    .slice(1)
    .map((q) => `L${f(q.x)} ${f(q.y)}`)
    .join('')}Z`;

/** SVG path data for a processed stroke or shape. */
export function pathData(p: DoodlePath): string {
  if (p.kind === 'shape') return p.rings.map(ringData).join('');
  if (p.kind === 'lines') {
    const [h, ...rest] = p.points;
    return `M${f(h!.x)} ${f(h!.y)}${rest.map((q) => `L${f(q.x)} ${f(q.y)}`).join('')}${p.closed ? 'Z' : ''}`;
  }
  const h = p.curves[0]![0];
  const body = p.curves
    .map(([, c1, c2, e]) => `C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(e.x)} ${f(e.y)}`)
    .join('');
  return `M${f(h.x)} ${f(h.y)}${body}${p.closed ? 'Z' : ''}`;
}

/** The doodle as an SVG document in mm, ready to import or save. */
export function doodleToSvg(
  items: DoodleItem[],
  s: DoodleSettings,
  size: { width: number; height: number },
): string {
  const paths = items.map((it) => processItem(it, s)).filter((p): p is DoodlePath => !!p);
  const els = paths.map((p) => {
    const filled = p.closed && s.fillClosed;
    const fill = filled ? '#000000' : 'none';
    // Open strokes always keep their line; filled shapes only if outlines are wanted.
    const stroke = filled && !s.keepOutlines ? 'none' : '#000000';
    // Combined shapes can have holes: evenodd keeps them open when filled.
    const rule = p.kind === 'shape' ? ' fill-rule="evenodd"' : '';
    return `  <path d="${pathData(p)}" fill="${fill}"${rule} stroke="${stroke}" stroke-width="0.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<!-- Drawn in Plotter Studio -->`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(size.width)}mm" height="${f(size.height)}mm" viewBox="0 0 ${f(size.width)} ${f(size.height)}">`,
    ...els,
    '</svg>',
    '',
  ].join('\n');
}
