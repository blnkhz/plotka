import type { Vec2 } from '@plotka/core';

/**
 * A flat, chisel-like nib (Pilot Parallel and other broad-edge pens), for the preview: `width`
 * in mm, `angle` in degrees, measured counterclockwise from horizontal as seen on the paper.
 * The line is widest across the nib and thinnest along its edge.
 */
export type Nib = { width: number; angle: number };

/** Pilot Parallel Pen nib widths, mm. 3.0 and 4.5 mm aren't in every shop or set. */
export const PARALLEL_SIZES = [1.5, 2.4, 3.0, 3.8, 4.5, 6.0];

/** The usual italic pen angle. */
export const DEFAULT_NIB: Nib = { width: 3.8, angle: 45 };

/** The thinnest line the nib draws (along its edge), mm. */
export const HAIRLINE = 0.15;

/** Half the nib's edge as a vector on the paper (y points down). */
export function nibHalf(nib: Nib): Vec2 {
  const a = (nib.angle * Math.PI) / 180;
  return { x: (nib.width / 2) * Math.cos(a), y: -(nib.width / 2) * Math.sin(a) };
}

const cross = (a: Vec2, b: Vec2) => a.x * b.y - a.y * b.x;

/** The band a segment p→q sweeps with half-edge h, wound counterclockwise (null if flat). */
function band(p: Vec2, q: Vec2, h: Vec2): Vec2[] | null {
  const area = cross({ x: q.x - p.x, y: q.y - p.y }, h);
  if (Math.abs(area) < 1e-12) return null;
  const quad = [
    { x: p.x + h.x, y: p.y + h.y },
    { x: q.x + h.x, y: q.y + h.y },
    { x: q.x - h.x, y: q.y - h.y },
    { x: p.x - h.x, y: p.y - h.y },
  ];
  return area > 0 ? quad : quad.reverse();
}

/**
 * The area the nib sweeps along a line: one quadrilateral per segment, all wound the same way,
 * so filling them together (nonzero) gives their union without holes where they overlap. Each
 * segment also gets a `hairline`-wide band, so lines along the nib's edge still show as fine
 * lines, like the real pen draws them.
 */
export function nibQuads(points: Vec2[], closed: boolean, nib: Nib, hairline = HAIRLINE): Vec2[][] {
  const h = nibHalf(nib);
  const pts = closed && points.length > 2 ? [...points, points[0]!] : points;
  const quads: Vec2[][] = [];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1]!;
    const q = pts[i]!;
    const nibBand = band(p, q, h);
    if (nibBand) quads.push(nibBand);
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (hairline > 0 && len > 0) {
      const n = {
        x: (-(q.y - p.y) / len) * (hairline / 2),
        y: ((q.x - p.x) / len) * (hairline / 2),
      };
      quads.push(band(p, q, n)!);
    }
  }
  return quads;
}

type PathSink = {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
};

/** Adds the nib's swept area along a line to a canvas path (fill it with the nonzero rule). */
export function addNibPath(target: PathSink, points: Vec2[], closed: boolean, nib: Nib) {
  for (const quad of nibQuads(points, closed, nib)) {
    target.moveTo(quad[0]!.x, quad[0]!.y);
    for (let i = 1; i < 4; i++) target.lineTo(quad[i]!.x, quad[i]!.y);
    target.closePath();
  }
}
