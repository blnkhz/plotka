import type { Vec2 } from '../geometry/vec2';
import type { DoodleStroke } from './doodle';

/** The basic shapes that can be placed on a doodle's artboard. */
export const PRIMITIVES = ['rectangle', 'ellipse', 'triangle', 'hexagon', 'star'] as const;
export type Primitive = (typeof PRIMITIVES)[number];

/** How far an ellipse's outline may stray from the true curve, mm (well under a pen width). */
const ELLIPSE_TOLERANCE = 0.02;

/** Regular star or polygon corners, starting at the top, on the unit circle. */
function ring(count: number, radius: (i: number) => number): Vec2[] {
  return Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (i / count) * Math.PI * 2;
    return { x: radius(i) * Math.cos(a), y: radius(i) * Math.sin(a) };
  });
}

/** Stretches points to fill the box exactly. */
function fitBox(pts: Vec2[], a: Vec2, b: Vec2): Vec2[] {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX;
  const h = Math.max(...ys) - minY;
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const width = Math.abs(b.x - a.x);
  const height = Math.abs(b.y - a.y);
  return pts.map((p) => ({
    x: x0 + ((p.x - minX) / w) * width,
    y: y0 + ((p.y - minY) / h) * height,
  }));
}

/** A basic shape filling the box between two opposite corners. */
export function primitiveStroke(kind: Primitive, a: Vec2, b: Vec2): DoodleStroke {
  const unit = (): Vec2[] => {
    switch (kind) {
      case 'rectangle':
        return [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ];
      case 'triangle':
        return [
          { x: 0.5, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ];
      case 'hexagon':
        return ring(6, () => 1);
      case 'star':
        return ring(10, (i) => (i % 2 ? 0.382 : 1));
      case 'ellipse': {
        const r = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / 2;
        const n = Math.ceil(Math.PI / Math.sqrt((2 * ELLIPSE_TOLERANCE) / Math.max(r, 1)));
        return ring(Math.max(24, n), () => 1);
      }
    }
  };
  return { points: fitBox(unit(), a, b), exact: true };
}

const segmentDistance = (p: Vec2, a: Vec2, b: Vec2) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};

/** Whether a stroke's line passes within `radius` of the point. */
export function strokeNear(stroke: DoodleStroke, p: Vec2, radius: number): boolean {
  const pts = stroke.points;
  // A placed shape has few points far apart, and its outline closes back to the first.
  if (stroke.exact)
    return pts.some((q, i) => segmentDistance(p, q, pts[(i + 1) % pts.length]!) <= radius);
  return pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= radius);
}
