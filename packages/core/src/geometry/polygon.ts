import {
  Clipper,
  Clipper64,
  ClipType,
  EndType,
  FillRule,
  JoinType,
  type Path64,
  type Paths64,
} from '@countertype/clipper2-ts';
import type { FillRegion, Polyline } from '../model';
import type { Vec2 } from './vec2';

/**
 * Polygon booleans and offsets (Clipper2). Shapes are lists of rings in mm; results are
 * normalized so outer rings and holes work with the nonzero rule.
 */
export type Shape = Vec2[][];

/** Integer units per mm (1 µm). */
const SCALE = 1000;

const toPath = (ring: Vec2[]): Path64 =>
  ring.map((p) => ({ x: Math.round(p.x * SCALE), y: Math.round(p.y * SCALE) }));
const toPaths = (rings: Vec2[][]): Paths64 => rings.map(toPath);
const fromPath = (p: Path64): Vec2[] => p.map((q) => ({ x: q.x / SCALE, y: q.y / SCALE }));
const fromPaths = (ps: Paths64): Shape => ps.map(fromPath).filter((r) => r.length >= 3);

/** The area a fill region covers, as nonzero rings. */
export function regionShape(region: FillRegion): Shape {
  const rule = region.fillRule === 'evenodd' ? FillRule.EvenOdd : FillRule.NonZero;
  return fromPaths(Clipper.union(toPaths(region.outer), rule));
}

export function unionShapes(a: Shape, b: Shape): Shape {
  if (!a.length) return b;
  if (!b.length) return a;
  return fromPaths(Clipper.union(toPaths(a), toPaths(b), FillRule.NonZero));
}

export function differenceShapes(a: Shape, b: Shape): Shape {
  if (!a.length || !b.length) return a;
  return fromPaths(Clipper.difference(toPaths(a), toPaths(b), FillRule.NonZero));
}

export function intersectShapes(a: Shape, b: Shape): Shape {
  if (!a.length || !b.length) return [];
  return fromPaths(Clipper.intersect(toPaths(a), toPaths(b), FillRule.NonZero));
}

/** The parts covered by exactly one of the two shapes (exclusive or). */
export function xorShapes(a: Shape, b: Shape): Shape {
  if (!a.length) return b;
  if (!b.length) return a;
  return fromPaths(Clipper.xor(toPaths(a), toPaths(b), FillRule.NonZero));
}

/** One ring or several, possibly self-crossing, as clean nonzero rings. */
export function normalizeShape(rings: Vec2[][]): Shape {
  return fromPaths(Clipper.union(toPaths(rings), FillRule.NonZero));
}

/** Grows (positive) or shrinks (negative) a shape by `delta` mm with round corners. */
export function offsetShape(shape: Shape, delta: number, arcTolerance = 0.01): Shape {
  if (delta === 0 || !shape.length) return shape;
  return fromPaths(
    Clipper.inflatePaths(
      toPaths(shape),
      delta * SCALE,
      JoinType.Round,
      EndType.Polygon,
      2,
      arcTolerance * SCALE,
    ),
  );
}

/** Signed area sum (mm²). Positive for outer rings, negative for holes. */
export function shapeArea(shape: Shape): number {
  let a = 0;
  for (const r of shape) a += Clipper.area(toPath(r));
  return a / (SCALE * SCALE);
}

/** Area-weighted centroid, or null for an empty shape. */
export function shapeCentroid(shape: Shape): Vec2 | null {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (const r of shape)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const p = r[j]!;
      const q = r[i]!;
      const c = p.x * q.y - q.x * p.y;
      a += c;
      cx += (p.x + q.x) * c;
      cy += (p.y + q.y) * c;
    }
  if (Math.abs(a) < 1e-12) return null;
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** True if the point is inside the shape (nonzero). For many points use ShapeTester. */
export const shapeContains = (shape: Shape, p: Vec2): boolean => new ShapeTester(shape).contains(p);

/**
 * Clips polylines to a shape. `keep: 'inside'` keeps the parts inside, `'outside'` the parts
 * outside. Closed polylines become open pieces when cut, and stay closed when untouched.
 */
export function clipPolylinesToShape(
  lines: Polyline[],
  shape: Shape,
  keep: 'inside' | 'outside',
): Polyline[] {
  if (!shape.length) return keep === 'inside' ? [] : lines;
  const c = new Clipper64();
  const open: Paths64 = [];
  for (const l of lines) {
    if (l.points.length < 2) continue;
    const pts = l.closed ? [...l.points, l.points[0]!] : l.points;
    open.push(toPath(pts));
  }
  if (!open.length) return [];
  c.addOpenSubject(open);
  c.addClip(toPaths(shape));
  const closedOut: Paths64 = [];
  const openOut: Paths64 = [];
  c.execute(
    keep === 'inside' ? ClipType.Intersection : ClipType.Difference,
    FillRule.NonZero,
    closedOut,
    openOut,
  );
  return openOut
    .map((p) => fromPath(p))
    .filter((p) => p.length >= 2)
    .map((points) => {
      const a = points[0]!;
      const b = points[points.length - 1]!;
      const closed = points.length > 3 && Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
      return { points: closed ? points.slice(0, -1) : points, closed };
    });
}

/** A shape as a fill region (nonzero rule). */
export const shapeRegion = (shape: Shape, color?: string): FillRegion => ({
  outer: shape,
  fillRule: 'nonzero',
  ...(color ? { color } : {}),
});

/**
 * Fast repeated point-in-shape tests (nonzero rule). Edges are bucketed by y so each test only
 * looks at the edges near the point's row.
 */
export class ShapeTester {
  private readonly buckets = new Map<number, number[]>();
  private readonly ax: number[] = [];
  private readonly ay: number[] = [];
  private readonly bx: number[] = [];
  private readonly by: number[] = [];
  private readonly size: number;

  constructor(shape: Shape, bucketSize = 1) {
    this.size = Math.max(bucketSize, 1e-3);
    for (const r of shape)
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const a = r[j]!;
        const b = r[i]!;
        if (a.y === b.y) continue;
        const e = this.ax.length;
        this.ax.push(a.x);
        this.ay.push(a.y);
        this.bx.push(b.x);
        this.by.push(b.y);
        const k0 = Math.floor(Math.min(a.y, b.y) / this.size);
        const k1 = Math.floor(Math.max(a.y, b.y) / this.size);
        for (let k = k0; k <= k1; k++) {
          const list = this.buckets.get(k);
          if (list) list.push(e);
          else this.buckets.set(k, [e]);
        }
      }
  }

  contains(p: Vec2): boolean {
    const list = this.buckets.get(Math.floor(p.y / this.size));
    if (!list) return false;
    let w = 0;
    for (const e of list) {
      const ay = this.ay[e]!;
      const by = this.by[e]!;
      // Half-open rule so a ray through a vertex counts once.
      if (ay <= p.y ? by > p.y : by <= p.y) {
        const t = (p.y - ay) / (by - ay);
        const x = this.ax[e]! + t * (this.bx[e]! - this.ax[e]!);
        if (x > p.x) w += by > ay ? 1 : -1;
      }
    }
    return w !== 0;
  }
}
