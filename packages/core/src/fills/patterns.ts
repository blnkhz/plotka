import {
  clipPolylinesToShape,
  offsetShape,
  regionShape,
  shapeCentroid,
  ShapeTester,
  type Shape,
} from '../geometry/polygon';
import type { Vec2 } from '../geometry/vec2';
import { append } from '../util/array';
import type { FillRegion, Polyline } from '../model';

export type PatternOptions = {
  /** mm between rings / turns / dots. */
  spacing: number;
  /** Degrees. Spiral start direction, dot grid rotation. */
  angle: number;
  /** mm pulled in from the outline. */
  inset: number;
  /** Concentric: join rings without lifting the pen where safe. */
  connect: boolean;
  /** Dots: random offset as a fraction of spacing, 0..1. */
  jitter?: number;
  /** Spiral: where it starts. Defaults to the area's centroid. */
  center?: Vec2;
};

/** Safety cap on concentric rings / spiral turns, so a tiny spacing can't hang the app. */
const MAX_RINGS = 5000;
/** Max chord error when sampling the spiral, mm. */
const SPIRAL_TOLERANCE = 0.02;

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

export const insetArea = (region: FillRegion, inset: number): Shape => {
  const base = regionShape(region);
  return inset > 0 ? offsetShape(base, -inset) : base;
};

/**
 * HATCH-4: rings following the outline inward, at inset + spacing × (k + ½), until the area
 * vanishes. With `connect`, each ring is rotated to start near the previous ring's start and
 * joined to it when the connector is short and stays inside.
 */
export function concentricFill(region: FillRegion, o: PatternOptions): Polyline[] {
  if (!(o.spacing > 0)) return [];
  const base = regionShape(region);
  const levels: Vec2[][][] = [];
  for (let k = 0; k < MAX_RINGS; k++) {
    const rings = offsetShape(base, -(o.inset + o.spacing * (k + 0.5)));
    if (!rings.length) break;
    levels.push(rings);
  }
  if (!o.connect) return levels.flat().map((points) => ({ points, closed: true }));

  const area = o.inset > 0 ? offsetShape(base, -o.inset) : base;
  const tester = new ShapeTester(area, o.spacing * 4);
  const maxJoin = o.spacing * 2;
  // Open chains; each ends where its last ring started (the ring is traced back to its start).
  type Chain = { points: Vec2[]; level: number; open: boolean };
  const chains: Chain[] = [];
  for (let k = 0; k < levels.length; k++) {
    const candidates = chains.filter((c) => c.open && c.level === k - 1);
    for (const ring of levels[k]!) {
      let best: { chain: Chain; idx: number; d: number } | null = null;
      for (const chain of candidates) {
        const end = chain.points[chain.points.length - 1]!;
        for (let i = 0; i < ring.length; i++) {
          const d = dist(end, ring[i]!);
          if (!best || d < best.d) best = { chain, idx: i, d };
        }
      }
      if (
        best &&
        best.d <= maxJoin &&
        segmentInside(best.chain.points.at(-1)!, ring[best.idx]!, tester)
      ) {
        const rotated = [...ring.slice(best.idx), ...ring.slice(0, best.idx + 1)];
        append(best.chain.points, rotated);
        best.chain.level = k;
        candidates.splice(candidates.indexOf(best.chain), 1);
      } else {
        chains.push({ points: [...ring, ring[0]!], level: k, open: true });
      }
    }
    for (const c of chains) if (c.level < k) c.open = false;
  }
  return chains.map((c) => ({ points: c.points, closed: false }));
}

/** Samples a short connector; true if every sample is inside. */
function segmentInside(a: Vec2, b: Vec2, tester: ShapeTester): boolean {
  const n = Math.max(2, Math.ceil(dist(a, b) / 0.05));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (!tester.contains({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
  }
  return true;
}

/**
 * HATCH-5: an Archimedean spiral (`spacing` between turns) from `center` (by default the area's
 * centroid; it may be outside the area) out to its
 * farthest point, clipped to the inset area.
 */
export function spiralFill(region: FillRegion, o: PatternOptions): Polyline[] {
  if (!(o.spacing > 0)) return [];
  const area = insetArea(region, o.inset);
  const c = o.center ?? shapeCentroid(area);
  if (!c || !area.length) return [];
  let rmax = 0;
  for (const r of area) for (const p of r) rmax = Math.max(rmax, dist(p, c));
  const turns = Math.min(MAX_RINGS, rmax / o.spacing + 1);
  const thetaMax = turns * 2 * Math.PI;
  const a0 = (o.angle * Math.PI) / 180;
  const k = o.spacing / (2 * Math.PI);
  const pts: Vec2[] = [];
  for (let th = 0; th <= thetaMax;) {
    const r = k * th;
    pts.push({ x: c.x + r * Math.cos(th + a0), y: c.y + r * Math.sin(th + a0) });
    // Chord sagitta r·dθ²/8 ≤ tolerance.
    th += Math.min(0.5, Math.sqrt((8 * SPIRAL_TOLERANCE) / Math.max(r, 1e-3)));
  }
  // Turns closer to the center than the nearest edge are inside for sure; only clip the rest.
  const safe = new ShapeTester(area, Math.max(rmax / 50, o.spacing)).contains(c)
    ? nearestEdgeDistance(area, c)
    : 0;
  let split = 0;
  while (split < pts.length && dist(pts[split]!, c) < safe) split++;
  const out: Polyline[] = [];
  if (split > 1) out.push({ points: pts.slice(0, split), closed: false });
  if (split < pts.length) {
    const rest = pts.slice(Math.max(0, split - 1));
    append(out, clipPolylinesToShape([{ points: rest, closed: false }], area, 'inside'));
  }
  // Join the inner part to the first clipped piece when they meet.
  if (out.length > 1 && dist(out[0]!.points.at(-1)!, out[1]!.points[0]!) < 0.002) {
    out[0] = { points: [...out[0]!.points, ...out[1]!.points.slice(1)], closed: false };
    out.splice(1, 1);
  }
  return out;
}

function nearestEdgeDistance(shape: Shape, p: Vec2): number {
  let best = Infinity;
  for (const r of shape)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[j]!;
      const b = r[i]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
      best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
    }
  return best;
}

/** Deterministic pseudo-random in [-0.5, 0.5) from grid indices, so preview and plot agree. */
function hash(i: number, j: number, salt: number): number {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(salt, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296 - 0.5;
}

/**
 * HATCH-6: pen taps on a grid (rotated by `angle`, aligned globally like the line hatch), with
 * optional jitter. Each dot is a zero-length path, so the pen goes down and up in place.
 */
export function dotFill(region: FillRegion, o: PatternOptions): Polyline[] {
  if (!(o.spacing > 0)) return [];
  const area = insetArea(region, o.inset);
  if (!area.length) return [];
  const a = (o.angle * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  // Work in the grid's frame: rotate the area by -angle.
  const toFrame = (p: Vec2): Vec2 => ({ x: p.x * cos + p.y * sin, y: -p.x * sin + p.y * cos });
  const fromFrame = (p: Vec2): Vec2 => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos });
  const framed = area.map((r) => r.map(toFrame));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of framed)
    for (const p of r) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  const s = o.spacing;
  const jitter = Math.min(1, Math.max(0, o.jitter ?? 0)) * s;
  const tester = new ShapeTester(framed, s);
  const out: Polyline[] = [];
  const i0 = Math.floor((minX - jitter) / s - 0.5);
  const i1 = Math.ceil((maxX + jitter) / s);
  const j0 = Math.floor((minY - jitter) / s - 0.5);
  const j1 = Math.ceil((maxY + jitter) / s);
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const p = {
        x: (i + 0.5) * s + (jitter ? hash(i, j, 1) * jitter : 0),
        y: (j + 0.5) * s + (jitter ? hash(i, j, 2) * jitter : 0),
      };
      if (!tester.contains(p)) continue;
      const q = fromFrame(p);
      out.push({ points: [q, { ...q }], closed: false });
    }
  return out;
}

/**
 * Ripples: circles `spacing` apart around `center` (by default the area's centroid; it may be
 * outside the area), out to the farthest corner, cut to the area.
 */
export function rippleFill(region: FillRegion, o: PatternOptions): Polyline[] {
  if (!(o.spacing > 0)) return [];
  const area = insetArea(region, o.inset);
  const c = o.center ?? shapeCentroid(area);
  if (!c || !area.length) return [];
  let rmax = 0;
  for (const r of area) for (const p of r) rmax = Math.max(rmax, dist(p, c));
  const rings: Polyline[] = [];
  for (let k = 0; k < MAX_RINGS; k++) {
    const r = (k + 0.5) * o.spacing;
    if (r > rmax) break;
    // Enough sides that no chord strays more than the tolerance from the circle.
    const n = Math.max(12, Math.ceil((2 * Math.PI) / Math.sqrt((8 * SPIRAL_TOLERANCE) / r)));
    const pts: Vec2[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI + (o.angle * Math.PI) / 180;
      pts.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
    }
    rings.push({ points: pts, closed: true });
  }
  return clipPolylinesToShape(rings, area, 'inside');
}
