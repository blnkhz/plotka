import { clipPolylinesToShape } from '../geometry/polygon';
import type { Vec2 } from '../geometry/vec2';
import type { FillRegion, Polyline } from '../model';
import { hatchRegion, type HatchOptions } from './hatch';
import { insetArea } from './patterns';

/**
 * Grid fills on the paper's global grid (anchored at its origin, turned by `angle`), so
 * neighboring shapes line up.
 */

/** Triangles: three sets of lines 60° apart. */
export const triangleFill = (region: FillRegion, o: HatchOptions): Polyline[] => [
  ...hatchRegion(region, o),
  ...hatchRegion(region, { ...o, angle: o.angle + 60 }),
  ...hatchRegion(region, { ...o, angle: o.angle + 120 }),
];

/** Most hexagon edges before giving up, so a tiny cell size can't hang the app. */
const MAX_HEX_EDGES = 2_000_000;

/**
 * Hexagons (a honeycomb), `spacing` mm across the flats. Drawn as a zigzag along each row of
 * shared edges, plus the upright edges between them, so most of the pen work is long runs.
 */
export function hexagonFill(region: FillRegion, o: HatchOptions): Polyline[] {
  if (!(o.spacing > 0)) return [];
  const area = insetArea(region, o.inset);
  if (!area.length) return [];
  const w = o.spacing; // across the flats (cell width)
  const a = w / Math.sqrt(3); // side length
  const rad = (o.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const toLocal = (p: Vec2) => ({ x: p.x * cos + p.y * sin, y: -p.x * sin + p.y * cos });
  const toWorld = (x: number, y: number): Vec2 => ({ x: x * cos - y * sin, y: x * sin + y * cos });
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of area)
    for (const p of ring) {
      const q = toLocal(p);
      minX = Math.min(minX, q.x);
      maxX = Math.max(maxX, q.x);
      minY = Math.min(minY, q.y);
      maxY = Math.max(maxY, q.y);
    }
  // Pointy-top hexagons: row j centered at y = 1.5·a·j, odd rows shifted by half a cell.
  const rowH = 1.5 * a;
  const j0 = Math.floor(minY / rowH) - 1;
  const j1 = Math.ceil(maxY / rowH) + 1;
  const i0 = Math.floor(minX / w) - 1;
  const i1 = Math.ceil(maxX / w) + 1;
  // Too many cells: only the rows that fit (better a partial fill than nothing at all).
  const rows = Math.max(1, Math.floor(MAX_HEX_EDGES / (3 * Math.max(1, i1 - i0))));
  const jEnd = Math.min(j1, j0 + rows);
  const lines: Polyline[] = [];
  for (let j = j0; j <= jEnd; j++) {
    const cy = rowH * j;
    const shift = j % 2 === 0 ? 0 : w / 2;
    // The zigzag of this row's top edges (shared with the row above's bottom edges).
    const zig: Vec2[] = [];
    for (let i = i0; i <= i1; i++) {
      const cx = i * w + shift;
      zig.push(toWorld(cx - w / 2, cy - a / 2), toWorld(cx, cy - a));
    }
    zig.push(toWorld(i1 * w + shift + w / 2, cy - a / 2));
    lines.push({ points: zig, closed: false });
    // Upright edges between this row's cells.
    for (let i = i0; i <= i1 + 1; i++) {
      const x = i * w + shift - w / 2;
      lines.push({ points: [toWorld(x, cy - a / 2), toWorld(x, cy + a / 2)], closed: false });
    }
  }
  return clipPolylinesToShape(lines, area, 'inside');
}
