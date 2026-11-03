import { ShapeTester, type Shape } from '../geometry/polygon';
import type { Vec2 } from '../geometry/vec2';
import type { FillRegion, Polyline } from '../model';
import { seededRandom } from '../transforms/random';
import { insetArea } from './patterns';
import { perlin } from './wavy';

/** Most dots or flow-line points per shape, so a tiny spacing can't hang the app. */
const MAX_POINTS = 600_000;

const boundsOf = (area: Shape) => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const r of area)
    for (const p of r) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  return { minX, maxX, minY, maxY };
};

/** Points in a uniform grid of `size` cells, for "anything within d of here?" checks. */
class PointGrid<T extends Vec2> {
  private readonly cells = new Map<string, T[]>();
  constructor(private readonly size: number) {}
  private key(x: number, y: number) {
    return `${Math.floor(x / this.size)},${Math.floor(y / this.size)}`;
  }
  add(p: T) {
    const k = this.key(p.x, p.y);
    const list = this.cells.get(k);
    if (list) list.push(p);
    else this.cells.set(k, [p]);
  }
  /** True if a point within d (d ≤ size) passes `count`. */
  any(p: Vec2, d: number, count: (q: T) => boolean = () => true): boolean {
    const cx = Math.floor(p.x / this.size);
    const cy = Math.floor(p.y / this.size);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const q of this.cells.get(`${cx + i},${cy + j}`) ?? [])
          if (Math.hypot(q.x - p.x, q.y - p.y) < d && count(q)) return true;
    return false;
  }
}

/**
 * Stippling: dots scattered at random but never closer than `spacing` (Poisson-disk sampling,
 * Bridson's method), so they look hand-placed without clumps or gaps. Same seed, same dots.
 */
export function stippleFill(
  region: FillRegion,
  o: { spacing: number; inset: number; seed: number },
): Polyline[] {
  const r = o.spacing;
  if (!(r > 0)) return [];
  const area = insetArea(region, o.inset);
  if (!area.length) return [];
  const b = boundsOf(area);
  const tester = new ShapeTester(area, r * 4);
  const rnd = seededRandom(Math.round(o.seed) * 7919 + 3);
  const grid = new PointGrid<Vec2>(r);
  const dots: Vec2[] = [];
  const active: Vec2[] = [];
  const place = (p: Vec2) => {
    grid.add(p);
    dots.push(p);
    active.push(p);
  };
  const free = (p: Vec2) =>
    p.x >= b.minX &&
    p.x <= b.maxX &&
    p.y >= b.minY &&
    p.y <= b.maxY &&
    tester.contains(p) &&
    !grid.any(p, r);
  // Seeds: walk a coarse grid so separate parts of the shape all get dots.
  const seeds: Vec2[] = [];
  for (let y = b.minY + r / 2; y <= b.maxY; y += r * 3)
    for (let x = b.minX + r / 2; x <= b.maxX; x += r * 3) seeds.push({ x, y });
  let s = 0;
  while (dots.length < MAX_POINTS) {
    if (!active.length) {
      while (s < seeds.length && !free(seeds[s]!)) s++;
      if (s >= seeds.length) break;
      place(seeds[s++]!);
    }
    const i = Math.floor(rnd() * active.length);
    const p = active[i]!;
    let placed = false;
    for (let k = 0; k < 30; k++) {
      const a = rnd() * 2 * Math.PI;
      const d = r * (1 + rnd());
      const q = { x: p.x + d * Math.cos(a), y: p.y + d * Math.sin(a) };
      if (free(q)) {
        place(q);
        placed = true;
        break;
      }
    }
    if (!placed) active.splice(i, 1);
  }
  return dots.map((p) => ({ points: [p, { ...p }], closed: false }));
}

export type FlowOptions = {
  /** mm between neighboring lines. */
  spacing: number;
  /** Degrees: the lines' main direction. */
  angle: number;
  inset: number;
  /** mm, the size of the bends. */
  noiseScale: number;
  /** mm; 0 = as long as they can go. */
  strokeLength: number;
  seed: number;
};

type FlowPoint = Vec2 & { curve: number; idx: number };

/**
 * Flow: lines following a smooth noise field, kept `spacing` apart (Jobard and Lefer's evenly
 * spaced streamlines). Each line is traced both ways from a seed until it leaves the shape,
 * comes within half a spacing of another line, or reaches the stroke length; new seeds are
 * tried one spacing beside each finished line, then on a grid, until the shape is full.
 */
export function flowFill(region: FillRegion, o: FlowOptions): Polyline[] {
  const dsep = o.spacing;
  if (!(dsep > 0)) return [];
  const area = insetArea(region, o.inset);
  if (!area.length) return [];
  const b = boundsOf(area);
  const tester = new ShapeTester(area, dsep * 4);
  const noise = perlin(o.seed);
  const scale = Math.max(o.noiseScale, 1e-3);
  const base = (o.angle * Math.PI) / 180;
  // The field: the main direction, bent by up to about ±170° by the noise.
  const dir = (p: Vec2) => {
    const t = base + Math.PI * noise(p.x / scale, p.y / scale);
    return { x: Math.cos(t), y: Math.sin(t) };
  };
  // Steps of about half a spacing (smooth at plotting scale), shorter for small bumps.
  const step = Math.max(0.05, Math.min(dsep / 2, scale / 10));
  const dtest = dsep / 2;
  // A line can come back near its own earlier part only this many steps away.
  const selfGap = Math.ceil((dsep * 3) / step);
  const maxSteps = o.strokeLength > 0 ? Math.ceil(o.strokeLength / 2 / step) : 100_000;
  const grid = new PointGrid<FlowPoint>(dsep);
  const rejected = new Set<number>();
  let total = 0;
  const near = (p: Vec2, curve: number, idx: number, d: number) =>
    grid.any(
      p,
      d,
      (q) => !rejected.has(q.curve) && (q.curve !== curve || Math.abs(q.idx - idx) > selfGap),
    );

  const trace = (seed: Vec2, curve: number, sign: 1 | -1): Vec2[] => {
    const out: Vec2[] = [];
    let p = seed;
    for (let i = 1; i <= maxSteps && total < MAX_POINTS; i++) {
      // Midpoint step, so curves follow the field smoothly.
      const d1 = dir(p);
      const mid = { x: p.x + (sign * step * d1.x) / 2, y: p.y + (sign * step * d1.y) / 2 };
      const d2 = dir(mid);
      const q = { x: p.x + sign * step * d2.x, y: p.y + sign * step * d2.y };
      const idx = sign * i;
      if (!tester.contains(q) || near(q, curve, idx, dtest)) break;
      grid.add({ ...q, curve, idx });
      out.push(q);
      total++;
      p = q;
    }
    return out;
  };

  const lines: Polyline[] = [];
  const queue: Vec2[] = [];
  const gridSeeds: Vec2[] = [];
  // Grid seeds on the paper's grid, so neighboring shapes start alike.
  for (let y = Math.floor(b.minY / dsep) * dsep + dsep / 2; y <= b.maxY; y += dsep)
    for (let x = Math.floor(b.minX / dsep) * dsep + dsep / 2; x <= b.maxX; x += dsep)
      gridSeeds.push({ x, y });
  let g = 0;
  let curve = 0;
  while (total < MAX_POINTS) {
    const seed = queue.length ? queue.pop()! : g < gridSeeds.length ? gridSeeds[g++]! : null;
    if (!seed) break;
    if (!tester.contains(seed) || near(seed, -1, 0, dsep)) continue;
    curve++;
    grid.add({ ...seed, curve, idx: 0 });
    const fwd = trace(seed, curve, 1);
    const back = trace(seed, curve, -1);
    const pts = [...back.reverse(), seed, ...fwd];
    let len = 0;
    for (let i = 1; i < pts.length; i++)
      len += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    // Stubs too short to read as a line are dropped (and stop blocking others).
    const minLen = o.strokeLength > 0 ? Math.min(o.strokeLength * 0.5, dsep * 2) : dsep * 2;
    if (pts.length < 3 || len < minLen) {
      rejected.add(curve);
      continue;
    }
    lines.push({ points: pts, closed: false });
    // New seeds one spacing to either side, every spacing along the line.
    const every = Math.max(1, Math.round(dsep / step));
    for (let i = 0; i < pts.length; i += every) {
      const p = pts[i]!;
      const d = dir(p);
      queue.push(
        { x: p.x - d.y * dsep, y: p.y + d.x * dsep },
        { x: p.x + d.y * dsep, y: p.y - d.x * dsep },
      );
    }
  }
  return lines;
}
