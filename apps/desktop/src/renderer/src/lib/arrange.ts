import {
  marginBox,
  paperSize,
  type Bounds,
  type Layer,
  type LayerPlacement,
  type Matrix,
  type PageSetup,
  type Vec2,
} from '@plotter-studio/core';

/**
 * Arrange mode (moving and resizing layers in the preview): the box maths, snapping and hit
 * testing. All in paper mm. Pure, so it's tested without the UI.
 */

export type Box = Bounds;
export type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Smallest size a box can be resized to, mm. */
const MIN_SIZE = 0.5;

const w = (b: Box) => b.maxX - b.minX;
const h = (b: Box) => b.maxY - b.minY;
export const boxCenter = (b: Box): Vec2 => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });

/** The 8 handles of a box, at its corners and edge midpoints. */
export function handlePoints(b: Box): { handle: Exclude<Handle, 'move'>; at: Vec2 }[] {
  const c = boxCenter(b);
  return [
    { handle: 'nw', at: { x: b.minX, y: b.minY } },
    { handle: 'n', at: { x: c.x, y: b.minY } },
    { handle: 'ne', at: { x: b.maxX, y: b.minY } },
    { handle: 'e', at: { x: b.maxX, y: c.y } },
    { handle: 'se', at: { x: b.maxX, y: b.maxY } },
    { handle: 's', at: { x: c.x, y: b.maxY } },
    { handle: 'sw', at: { x: b.minX, y: b.maxY } },
    { handle: 'w', at: { x: b.minX, y: c.y } },
  ];
}

/** The handle under p (within `tol` mm), 'move' inside the box, or null. */
export function handleAt(b: Box, p: Vec2, tol: number): Handle | null {
  for (const { handle, at } of handlePoints(b))
    if (Math.abs(p.x - at.x) <= tol && Math.abs(p.y - at.y) <= tol) return handle;
  return p.x >= b.minX - tol && p.x <= b.maxX + tol && p.y >= b.minY - tol && p.y <= b.maxY + tol
    ? 'move'
    : null;
}

export const CURSORS: Record<Handle, string> = {
  move: 'move',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
};

export type DragOptions = {
  /** Corners keep the proportions (Shift frees them). Edges always stretch one way. */
  keepRatio: boolean;
  /** Resize around the center instead of the opposite side (Alt). */
  fromCenter: boolean;
};

/** The box after dragging `handle` by (dx, dy) mm. */
export function dragBox(start: Box, handle: Handle, dx: number, dy: number, o: DragOptions): Box {
  if (handle === 'move')
    return {
      minX: start.minX + dx,
      maxX: start.maxX + dx,
      minY: start.minY + dy,
      maxY: start.maxY + dy,
    };
  const left = handle.includes('w');
  const right = handle.includes('e');
  const top = handle.includes('n');
  const bottom = handle.includes('s');
  const k = o.fromCenter ? 2 : 1;
  // New size along each axis that the handle moves (others unchanged).
  let nw = left ? w(start) - k * dx : right ? w(start) + k * dx : w(start);
  let nh = top ? h(start) - k * dy : bottom ? h(start) + k * dy : h(start);
  const corner = (left || right) && (top || bottom);
  if (corner && o.keepRatio && w(start) > 0 && h(start) > 0) {
    const s = Math.max(nw / w(start), nh / h(start));
    nw = w(start) * s;
    nh = h(start) * s;
  }
  nw = Math.max(MIN_SIZE, nw);
  nh = Math.max(MIN_SIZE, nh);
  return boxWithSize(start, handle, nw, nh, o.fromCenter);
}

/** `start` resized to nw × nh, anchored at the side opposite the handle (or the center). */
function boxWithSize(start: Box, handle: Handle, nw: number, nh: number, fromCenter: boolean): Box {
  const c = boxCenter(start);
  const ax = fromCenter ? c.x : handle.includes('w') ? start.maxX : start.minX;
  const ay = fromCenter ? c.y : handle.includes('n') ? start.maxY : start.minY;
  const span = (anchor: number, size: number, towardsMin: boolean, center: boolean) =>
    center
      ? [anchor - size / 2, anchor + size / 2]
      : towardsMin
        ? [anchor - size, anchor]
        : [anchor, anchor + size];
  const [minX, maxX] =
    handle.includes('e') || handle.includes('w')
      ? span(ax, nw, handle.includes('w'), fromCenter)
      : [c.x - nw / 2, c.x + nw / 2];
  const [minY, maxY] =
    handle.includes('n') || handle.includes('s')
      ? span(ay, nh, handle.includes('n'), fromCenter)
      : [c.y - nh / 2, c.y + nh / 2];
  return { minX: minX!, maxX: maxX!, minY: minY!, maxY: maxY! };
}

// --- snapping ---

export type SnapTargets = { xs: number[]; ys: number[] };
export type Guides = { xs: number[]; ys: number[] };

/** Lines to snap to: the paper's and margins' edges and centers, and other boxes' edges and centers. */
export function snapTargets(page: PageSetup, others: Box[]): SnapTargets {
  const paper = paperSize(page);
  const m = marginBox(page);
  const xs = [0, paper.width / 2, paper.width, m.x, m.x + m.width];
  const ys = [0, paper.height / 2, paper.height, m.y, m.y + m.height];
  for (const b of others) {
    xs.push(b.minX, (b.minX + b.maxX) / 2, b.maxX);
    ys.push(b.minY, (b.minY + b.maxY) / 2, b.maxY);
  }
  return { xs, ys };
}

/** The target nearest to any of `values` within tol: how far to shift, and the line. */
function nearest(values: number[], targets: number[], tol: number) {
  let best: { shift: number; at: number } | null = null;
  for (const v of values)
    for (const t of targets) {
      const d = t - v;
      if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.shift)))
        best = { shift: d, at: t };
    }
  return best;
}

/**
 * Snaps a dragged box. Moving: its left, center or right (and top, middle or bottom) snap.
 * Resizing: only the edges the handle moves; a proportional corner snaps on one axis and keeps
 * the proportions.
 */
export function snapBox(
  box: Box,
  start: Box,
  handle: Handle,
  targets: SnapTargets,
  tol: number,
  o: DragOptions,
): { box: Box; guides: Guides } {
  const c = boxCenter(box);
  if (handle === 'move') {
    const sx = nearest([box.minX, c.x, box.maxX], targets.xs, tol);
    const sy = nearest([box.minY, c.y, box.maxY], targets.ys, tol);
    return {
      box: dragBox(box, 'move', sx?.shift ?? 0, sy?.shift ?? 0, o),
      guides: { xs: sx ? [sx.at] : [], ys: sy ? [sy.at] : [] },
    };
  }
  const edgeX = handle.includes('w') ? box.minX : handle.includes('e') ? box.maxX : null;
  const edgeY = handle.includes('n') ? box.minY : handle.includes('s') ? box.maxY : null;
  const sx = edgeX === null ? null : nearest([edgeX], targets.xs, tol);
  const sy = edgeY === null ? null : nearest([edgeY], targets.ys, tol);
  const corner = edgeX !== null && edgeY !== null;
  if (corner && o.keepRatio) {
    // One axis decides; the other follows the proportions.
    const use = sx && (!sy || Math.abs(sx.shift) <= Math.abs(sy.shift)) ? 'x' : sy ? 'y' : null;
    if (!use) return { box, guides: { xs: [], ys: [] } };
    const k = o.fromCenter ? 2 : 1;
    const sign = (min: boolean) => (min ? -1 : 1);
    const nw = use === 'x' ? w(box) + k * sign(handle.includes('w')) * sx!.shift : null;
    const nh = use === 'y' ? h(box) + k * sign(handle.includes('n')) * sy!.shift : null;
    const s = nw !== null ? nw / w(start) : nh! / h(start);
    return {
      box: boxWithSize(start, handle, w(start) * s, h(start) * s, o.fromCenter),
      guides: { xs: use === 'x' ? [sx!.at] : [], ys: use === 'y' ? [sy!.at] : [] },
    };
  }
  const out = { ...box };
  if (sx) {
    if (handle.includes('w')) out.minX += sx.shift;
    else out.maxX += sx.shift;
    // Around the center, the opposite edge moves the other way.
    if (o.fromCenter && handle.includes('w')) out.maxX -= sx.shift;
    else if (o.fromCenter) out.minX -= sx.shift;
  }
  if (sy) {
    if (handle.includes('n')) out.minY += sy.shift;
    else out.maxY += sy.shift;
    if (o.fromCenter && handle.includes('n')) out.maxY -= sy.shift;
    else if (o.fromCenter) out.minY -= sy.shift;
  }
  return { box: out, guides: { xs: sx ? [sx.at] : [], ys: sy ? [sy.at] : [] } };
}

// --- from a box back to settings ---

/** The matrix taking box `from` onto box `to` (for drawing a drag before it's committed). */
export function boxMatrix(from: Box, to: Box): Matrix {
  const sx = w(from) > 0 ? w(to) / w(from) : 1;
  const sy = h(from) > 0 ? h(to) / h(from) : 1;
  const a = boxCenter(from);
  const b = boxCenter(to);
  return [sx, 0, 0, sy, b.x - sx * a.x, b.y - sy * a.y];
}

/** The layer placement that puts a layer (bounds `base` before placement) at `box`. */
export function placementFor(
  base: Box,
  box: Box,
  current: LayerPlacement | null | undefined,
): LayerPlacement {
  const sx = w(base) > 0 ? w(box) / w(base) : (current?.sx ?? 1);
  const sy = h(base) > 0 ? h(box) / h(base) : (current?.sy ?? 1);
  const a = boxCenter(base);
  const b = boxCenter(box);
  const r = (v: number, d = 1000) => Math.round(v * d) / d;
  return { dx: r(b.x - a.x), dy: r(b.y - a.y), sx: r(sx, 1e5), sy: r(sy, 1e5) };
}

const ANCHOR: Record<string, [number, number]> = {
  'top-left': [0, 0],
  top: [0.5, 0],
  'top-right': [1, 0],
  left: [0, 0.5],
  center: [0.5, 0.5],
  right: [1, 0.5],
  'bottom-left': [0, 1],
  bottom: [0.5, 1],
  'bottom-right': [1, 1],
};

/**
 * The Page tab's scale and offset that move the whole artwork from `art` (its box now) to
 * `box` (same proportions). Follows how the page fit places it: aligned in the margins, or
 * from the paper's corner with "As in file".
 */
export function pageFor(
  page: PageSetup,
  art: Box,
  box: Box,
): Pick<PageSetup, 'scale' | 'offsetX' | 'offsetY'> {
  const k = w(art) > 0 ? w(box) / w(art) : h(art) > 0 ? h(box) / h(art) : 1;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  if (page.align === 'file') {
    // Every point is offset + scale · (…): scaling by k scales its distance from the offset.
    return {
      scale: r(page.scale * k),
      offsetX: r(box.minX - k * (art.minX - page.offsetX)),
      offsetY: r(box.minY - k * (art.minY - page.offsetY)),
    };
  }
  const m = marginBox(page);
  const [ax, ay] = ANCHOR[page.align] ?? [0.5, 0.5];
  // minX = margin.x + (margin.width − width) · ax + offsetX, at any scale.
  return {
    scale: r(page.scale * k),
    offsetX: r(box.minX - m.x - (m.width - w(art) * k) * ax),
    offsetY: r(box.minY - m.y - (m.height - h(art) * k) * ay),
  };
}

// --- hit testing ---

function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function insideRings(p: Vec2, rings: Vec2[][]): boolean {
  let inside = false;
  for (const r of rings)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i]!;
      const b = r[j]!;
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
        inside = !inside;
    }
  return inside;
}

/**
 * The layer whose artwork is under p: a line within `tol` mm or inside a filled shape. The
 * nearest wins; on a tie the one drawn last (on top).
 */
export function layerAt(
  layers: Layer[],
  boxes: Record<string, Box>,
  p: Vec2,
  tol: number,
): string | null {
  let best: { id: string; d: number } | null = null;
  for (const l of layers) {
    const b = boxes[l.id];
    if (!l.visible || !b) continue;
    if (p.x < b.minX - tol || p.x > b.maxX + tol || p.y < b.minY - tol || p.y > b.maxY + tol)
      continue;
    let d = Infinity;
    for (const f of l.fills) if (!f.knockout && insideRings(p, f.outer)) d = 0;
    const lines = [
      ...l.strokes.map((s) => ({ pts: s.points, closed: s.closed })),
      ...l.fills.flatMap((f) => f.outer.map((pts) => ({ pts, closed: true }))),
    ];
    for (const { pts, closed } of lines) {
      if (d === 0) break;
      const n = closed ? pts.length : pts.length - 1;
      for (let i = 0; i < n; i++) d = Math.min(d, segDist(p, pts[i]!, pts[(i + 1) % pts.length]!));
    }
    if (d <= tol && (!best || d <= best.d)) best = { id: l.id, d };
  }
  return best?.id ?? null;
}
