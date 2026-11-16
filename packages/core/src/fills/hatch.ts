import type { Vec2 } from '../geometry/vec2';
import type { FillRegion, Polyline } from '../model';

/**
 * Scanline hatching.
 *
 * Works in a frame rotated by -angle so hatch lines are horizontal. Lines sit on a global grid
 * (y = (k + 0.5) * spacing in the rotated frame, anchored at the paper origin), so neighboring
 * shapes with the same settings line up.
 *
 * - Fill rule and holes: each scanline's crossings are walked with a winding count, so nonzero
 *   and evenodd behave like SVG.
 * - Inset: every hatch interval is trimmed by the parts of the scanline within `inset` of any
 *   edge (the edge's capsule). This is exact and equals a round-joined polygon offset.
 * - Connect: adjacent lines are joined pen-down only when the connector stays inside the inset
 *   region (no edge crossing, midpoint inside, at least `inset` from every edge) and is no longer
 *   than `MAX_CONNECT_SPACINGS` line spacings, so it never draws long diagonals across the fill.
 * - Round turns: with connect, each turn from one line into the next is a curve instead of two
 *   sharp corners. It only cuts the corners, so it stays where the sharp turn was.
 */

export type HatchOptions = {
  spacing: number;
  /** Degrees. 0 = horizontal lines. */
  angle: number;
  inset: number;
  connect: boolean;
  /** With connect: round the turns between lines. */
  roundTurns?: boolean;
};

/** Most a rounded turn's flattened curve strays from the true curve, in mm. */
const TURN_TOLERANCE = 0.02;

export const MAX_CONNECT_SPACINGS = 4;

const EPS = 1e-9;
/** Hatch pieces shorter than this (mm) are dropped. */
const MIN_INTERVAL = 1e-4;

type Edge = { ax: number; ay: number; bx: number; by: number; minY: number; maxY: number };

type Interval = [number, number];

export function hatchRegion(region: FillRegion, opts: HatchOptions): Polyline[] {
  const { spacing, inset } = opts;
  if (!(spacing > 0)) return [];
  const rad = (-opts.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const toLocal = (p: Vec2) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos });
  // Inverse rotation
  const toWorld = (x: number, y: number): Vec2 => ({ x: x * cos + y * sin, y: -x * sin + y * cos });

  const edges: Edge[] = [];
  for (const ring of region.outer) {
    const pts = ring.map(toLocal);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      if (a.x === b.x && a.y === b.y) continue;
      edges.push({
        ax: a.x,
        ay: a.y,
        bx: b.x,
        by: b.y,
        minY: Math.min(a.y, b.y),
        maxY: Math.max(a.y, b.y),
      });
    }
  }
  if (edges.length < 2) return [];

  let minY = Infinity;
  let maxY = -Infinity;
  for (const e of edges) {
    minY = Math.min(minY, e.minY);
    maxY = Math.max(maxY, e.maxY);
  }

  const evenodd = region.fillRule === 'evenodd';
  const byMinY = [...edges].sort((a, b) => a.minY - b.minY);
  const kStart = Math.ceil(minY / spacing - 0.5);
  const kEnd = Math.floor(maxY / spacing - 0.5);

  const rows: { y: number; intervals: Interval[] }[] = [];
  let next = 0;
  let active: Edge[] = [];
  for (let k = kStart; k <= kEnd; k++) {
    const y = (k + 0.5) * spacing;
    // Active edges: those whose y-range, grown by the inset, contains y.
    while (next < byMinY.length && byMinY[next]!.minY - inset <= y) active.push(byMinY[next++]!);
    active = active.filter((e) => e.maxY + inset >= y);

    const fill = fillIntervals(active, y, evenodd);
    const intervals = inset > 0 ? subtract(fill, insetIntervals(active, y, inset)) : fill;
    const kept = intervals.filter(([a, b]) => b - a > MIN_INTERVAL);
    if (kept.length) rows.push({ y, intervals: kept });
  }

  const local = opts.connect
    ? connectRows(rows, spacing, (a, b) => connectorInside(a, b, edges, inset, evenodd)).map(
        (chain) => (opts.roundTurns ? roundChainTurns(chain, spacing) : chain),
      )
    : rows.flatMap((r, i) =>
        r.intervals.map(([x0, x1]) =>
          // Alternate direction per row, so unconnected lines still serpentine.
          i % 2 === 0
            ? [
                { x: x0, y: r.y },
                { x: x1, y: r.y },
              ]
            : [
                { x: x1, y: r.y },
                { x: x0, y: r.y },
              ],
        ),
      );

  return local.map((pts) => ({ points: pts.map((p) => toWorld(p.x, p.y)), closed: false }));
}

/** Intervals of the scanline inside the region, by winding. */
function fillIntervals(edges: Edge[], y: number, evenodd: boolean): Interval[] {
  const xs: { x: number; dir: number }[] = [];
  for (const e of edges) {
    // Half-open rule so a vertex on the scanline is counted once.
    const up = e.ay <= y && y < e.by;
    const down = e.by <= y && y < e.ay;
    if (!up && !down) continue;
    const t = (y - e.ay) / (e.by - e.ay);
    xs.push({ x: e.ax + t * (e.bx - e.ax), dir: up ? 1 : -1 });
  }
  xs.sort((a, b) => a.x - b.x);
  const out: Interval[] = [];
  let w = 0;
  let start = 0;
  for (const c of xs) {
    const wasIn = evenodd ? w % 2 !== 0 : w !== 0;
    w += c.dir;
    const isIn = evenodd ? w % 2 !== 0 : w !== 0;
    if (!wasIn && isIn) start = c.x;
    else if (wasIn && !isIn) out.push([start, c.x]);
  }
  return out;
}

/** Union of scanline intervals within distance d of any edge (each edge's capsule). */
function insetIntervals(edges: Edge[], y: number, d: number): Interval[] {
  const parts: Interval[] = [];
  for (const e of edges) {
    const iv = capsuleInterval(e, y, d);
    if (iv) parts.push(iv);
  }
  return union(parts);
}

/** The x-interval where the horizontal line at y is within d of segment e, or null. */
function capsuleInterval(e: Edge, y: number, d: number): Interval | null {
  let lo = Infinity;
  let hi = -Infinity;
  // End caps (disks)
  for (const [cx, cy] of [
    [e.ax, e.ay],
    [e.bx, e.by],
  ] as const) {
    const dy = y - cy;
    if (Math.abs(dy) <= d) {
      const h = Math.sqrt(d * d - dy * dy);
      lo = Math.min(lo, cx - h);
      hi = Math.max(hi, cx + h);
    }
  }
  // Body (rectangle along the segment)
  const dx = e.bx - e.ax;
  const dy = e.by - e.ay;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  // For point (x, y): t = (x - ax) * ux + (y - ay) * uy in [0, len]
  //                   n = (x - ax) * -uy + (y - ay) * ux in [-d, d]
  let xlo = -Infinity;
  let xhi = Infinity;
  const constrain = (coef: number, offset: number, min: number, max: number): boolean => {
    // min <= coef * x + offset <= max
    if (Math.abs(coef) < EPS) return offset >= min - EPS && offset <= max + EPS;
    let a = (min - offset) / coef;
    let b = (max - offset) / coef;
    if (a > b) [a, b] = [b, a];
    xlo = Math.max(xlo, a);
    xhi = Math.min(xhi, b);
    return true;
  };
  const ok =
    constrain(ux, -e.ax * ux + (y - e.ay) * uy, 0, len) &&
    constrain(-uy, e.ax * uy + (y - e.ay) * ux, -d, d);
  if (ok && xlo <= xhi) {
    lo = Math.min(lo, xlo);
    hi = Math.max(hi, xhi);
  }
  return lo <= hi ? [lo, hi] : null;
}

function union(intervals: Interval[]): Interval[] {
  if (intervals.length < 2) return intervals;
  intervals.sort((a, b) => a[0] - b[0]);
  const out: Interval[] = [[...intervals[0]!]];
  for (let i = 1; i < intervals.length; i++) {
    const cur = intervals[i]!;
    const last = out[out.length - 1]!;
    if (cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1]);
    else out.push([...cur]);
  }
  return out;
}

/** a minus b, both sorted and non-overlapping. */
function subtract(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const [s0, s1] of a) {
    let start = s0;
    for (const [c0, c1] of b) {
      if (c1 <= start) continue;
      if (c0 >= s1) break;
      if (c0 > start) out.push([start, Math.min(c0, s1)]);
      start = Math.max(start, c1);
      if (start >= s1) break;
    }
    if (start < s1) out.push([start, s1]);
  }
  return out;
}

/**
 * Joins intervals on consecutive rows into serpentine chains. Greedy: from each unused
 * interval, keep stepping to the next row's interval whose near end is closest, as long as the
 * connector is allowed.
 */
function connectRows(
  rows: { y: number; intervals: Interval[] }[],
  spacing: number,
  allowed: (a: Vec2, b: Vec2) => boolean,
): Vec2[][] {
  const used = rows.map((r) => r.intervals.map(() => false));
  const chains: Vec2[][] = [];
  const maxLen = MAX_CONNECT_SPACINGS * spacing;
  for (let r = 0; r < rows.length; r++) {
    for (let i = 0; i < rows[r]!.intervals.length; i++) {
      if (used[r]![i]) continue;
      used[r]![i] = true;
      let [x0, x1] = rows[r]!.intervals[i]!;
      let forward = true;
      const chain: Vec2[] = [
        { x: x0, y: rows[r]!.y },
        { x: x1, y: rows[r]!.y },
      ];
      let row = r;
      for (;;) {
        const nr = row + 1;
        const nextRow = rows[nr];
        // Rows are on a regular grid; a missing row means a gap.
        if (!nextRow || nextRow.y - rows[row]!.y > spacing * 1.5) break;
        const end = chain[chain.length - 1]!;
        let best = -1;
        let bestDist = Infinity;
        for (let j = 0; j < nextRow.intervals.length; j++) {
          if (used[nr]![j]) continue;
          const [a, b] = nextRow.intervals[j]!;
          // Next line runs the other way, so it starts at its end nearest to where we are.
          const sx = forward ? b : a;
          const dist = Math.hypot(sx - end.x, nextRow.y - end.y);
          if (dist < bestDist) {
            bestDist = dist;
            best = j;
          }
        }
        if (best === -1 || bestDist > maxLen) break;
        [x0, x1] = nextRow.intervals[best]!;
        const start = { x: forward ? x1 : x0, y: nextRow.y };
        if (!allowed(end, start)) break;
        used[nr]![best] = true;
        chain.push(start, { x: forward ? x0 : x1, y: nextRow.y });
        forward = !forward;
        row = nr;
      }
      chains.push(chain);
    }
  }
  return chains;
}

/**
 * Rounds the turns of a connected chain (in the rotated frame, lines horizontal). The chain is
 * line, connector, line, ...: points 2i and 2i+1 are line i. Each connector and the two corners
 * at its ends become one cubic curve, which leaves line i `r` before its end and joins line i+1
 * `r` after its start, bulging out to where the lines ended. With both ends level (a plain
 * U-turn) and r = spacing / 2, it is very nearly a half circle.
 */
function roundChainTurns(chain: Vec2[], spacing: number): Vec2[] {
  if (chain.length < 4) return chain;
  const lines = chain.length / 2;
  // Each line is trimmed at both ends at most, so a turn uses no more than half of either line.
  const half = (i: number) => Math.abs(chain[2 * i + 1]!.x - chain[2 * i]!.x) / 2;
  const out: Vec2[] = [chain[0]!];
  for (let i = 0; i < lines - 1; i++) {
    const end = chain[2 * i + 1]!;
    const start = chain[2 * i + 2]!;
    // The direction line i runs in; line i+1 runs the other way.
    const d = end.x >= chain[2 * i]!.x ? 1 : -1;
    const r = Math.min(spacing / 2, half(i), half(i + 1));
    if (!(r > 1e-6)) {
      out.push(end, start);
      continue;
    }
    // Cubic from a to b, both handles pointing out along the lines: about a half circle when level.
    const a = { x: end.x - d * r, y: end.y };
    const b = { x: start.x - d * r, y: start.y };
    const k = (4 / 3) * r;
    const c1 = { x: a.x + d * k, y: a.y };
    const c2 = { x: b.x + d * k, y: b.y };
    const reach = Math.max(r, Math.abs(b.y - a.y) / 2);
    const steps = Math.min(
      48,
      Math.max(4, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - TURN_TOLERANCE / reach)))),
    );
    out.push(a);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      const w0 = u * u * u;
      const w1 = 3 * u * u * t;
      const w2 = 3 * u * t * t;
      const w3 = t * t * t;
      out.push({
        x: w0 * a.x + w1 * c1.x + w2 * c2.x + w3 * b.x,
        y: w0 * a.y + w1 * c1.y + w2 * c2.y + w3 * b.y,
      });
    }
    out.push(b);
  }
  out.push(chain[chain.length - 1]!);
  return out;
}

/** True when the segment a-b lies inside the inset region. */
function connectorInside(
  a: Vec2,
  b: Vec2,
  edges: Edge[],
  inset: number,
  evenodd: boolean,
): boolean {
  const minX = Math.min(a.x, b.x) - inset - EPS;
  const maxX = Math.max(a.x, b.x) + inset + EPS;
  const minY = Math.min(a.y, b.y) - inset - EPS;
  const maxY = Math.max(a.y, b.y) + inset + EPS;
  const tol = Math.max(1e-6, inset * 1e-6);
  for (const e of edges) {
    if (
      Math.max(e.ax, e.bx) < minX ||
      Math.min(e.ax, e.bx) > maxX ||
      e.maxY < minY ||
      e.minY > maxY
    )
      continue;
    if (properlyIntersect(a, b, e)) return false;
    if (inset > 0 && segmentDistance(a, b, e) < inset - tol) return false;
  }
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  if (pointInside(mx, my, edges, evenodd)) return true;
  // A connector running along the outline (inset 0) is fine: the pen draws on the edge.
  return edges.some((e) => pointSegDist(mx, my, e.ax, e.ay, e.bx, e.by) < tol);
}

function properlyIntersect(a: Vec2, b: Vec2, e: Edge): boolean {
  const d1x = b.x - a.x;
  const d1y = b.y - a.y;
  const d2x = e.bx - e.ax;
  const d2y = e.by - e.ay;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < EPS) return false; // parallel or collinear
  const t = ((e.ax - a.x) * d2y - (e.ay - a.y) * d2x) / den;
  const u = ((e.ax - a.x) * d1y - (e.ay - a.y) * d1x) / den;
  const m = 1e-7;
  return t > m && t < 1 - m && u > m && u < 1 - m;
}

function pointSegDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Distance between non-intersecting segments a-b and e. */
function segmentDistance(a: Vec2, b: Vec2, e: Edge): number {
  return Math.min(
    pointSegDist(a.x, a.y, e.ax, e.ay, e.bx, e.by),
    pointSegDist(b.x, b.y, e.ax, e.ay, e.bx, e.by),
    pointSegDist(e.ax, e.ay, a.x, a.y, b.x, b.y),
    pointSegDist(e.bx, e.by, a.x, a.y, b.x, b.y),
  );
}

function pointInside(x: number, y: number, edges: Edge[], evenodd: boolean): boolean {
  let w = 0;
  for (const e of edges) {
    const up = e.ay <= y && y < e.by;
    const down = e.by <= y && y < e.ay;
    if (!up && !down) continue;
    const ex = e.ax + ((y - e.ay) / (e.by - e.ay)) * (e.bx - e.ax);
    if (ex > x) w += up ? 1 : -1;
  }
  return evenodd ? w % 2 !== 0 : w !== 0;
}
