import {
  marginBox,
  paperSize,
  type Bounds,
  type Layer,
  type LayerPlacement,
  type Matrix,
  type PageSetup,
  type Vec2,
} from '@plotka/core';

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

// --- turned boxes ("frames") ---

/**
 * A selection that can be turned: its center, its size along its own sides, and its turn in
 * degrees (clockwise on the paper). A layer's frame is its placement applied to its bounds.
 */
export type Frame = { cx: number; cy: number; w: number; h: number; rot: number };
export type FrameHandle = Handle | 'rotate';

const rad = (deg: number) => (deg * Math.PI) / 180;
const turn = (v: Vec2, deg: number): Vec2 => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};

export const frameOfBox = (b: Box): Frame => ({
  cx: (b.minX + b.maxX) / 2,
  cy: (b.minY + b.maxY) / 2,
  w: w(b),
  h: h(b),
  rot: 0,
});

/** Paper point → the frame's own coordinates (origin at its center, along its sides). */
export const toFrame = (f: Frame, p: Vec2): Vec2 => turn({ x: p.x - f.cx, y: p.y - f.cy }, -f.rot);
export const fromFrame = (f: Frame, q: Vec2): Vec2 => {
  const v = turn(q, f.rot);
  return { x: f.cx + v.x, y: f.cy + v.y };
};
const localBox = (f: Frame): Box => ({
  minX: -f.w / 2,
  minY: -f.h / 2,
  maxX: f.w / 2,
  maxY: f.h / 2,
});

export const frameCorners = (f: Frame): Vec2[] =>
  [
    { x: -f.w / 2, y: -f.h / 2 },
    { x: f.w / 2, y: -f.h / 2 },
    { x: f.w / 2, y: f.h / 2 },
    { x: -f.w / 2, y: f.h / 2 },
  ].map((q) => fromFrame(f, q));

/** The box around a frame (as it lies on the paper). */
export function frameBox(f: Frame): Box {
  const c = frameCorners(f);
  return {
    minX: Math.min(...c.map((p) => p.x)),
    minY: Math.min(...c.map((p) => p.y)),
    maxX: Math.max(...c.map((p) => p.x)),
    maxY: Math.max(...c.map((p) => p.y)),
  };
}

/** The rotate handle: `stalk` mm above the middle of the top side. */
export const rotateHandle = (f: Frame, stalk: number): Vec2 =>
  fromFrame(f, { x: 0, y: -f.h / 2 - stalk });

export function frameHandles(f: Frame): { handle: Exclude<Handle, 'move'>; at: Vec2 }[] {
  return handlePoints(localBox(f)).map(({ handle, at }) => ({ handle, at: fromFrame(f, at) }));
}

export function frameHandleAt(f: Frame, p: Vec2, tol: number, stalk: number): FrameHandle | null {
  const r = rotateHandle(f, stalk);
  if (Math.hypot(p.x - r.x, p.y - r.y) <= tol * 1.5) return 'rotate';
  return handleAt(localBox(f), toFrame(f, p), tol);
}

/** The resize cursor for a handle of a turned frame (the nearest of the four directions). */
export function frameCursor(f: Frame, handle: FrameHandle): string {
  if (handle === 'move') return 'move';
  if (handle === 'rotate') return 'grab';
  const dir = {
    x: handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0,
    y: handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0,
  };
  const v = turn(dir, f.rot);
  const a = ((Math.atan2(v.y, v.x) * 180) / Math.PI + 180) % 180; // 0..180
  return a < 22.5 || a >= 157.5
    ? 'ew-resize'
    : a < 67.5
      ? 'nwse-resize'
      : a < 112.5
        ? 'ns-resize'
        : 'nesw-resize';
}

/** Turns snap to quarter turns within a few degrees; ⇧ gives 15° steps; ⌘ turns it off. */
export function snapAngle(deg: number, o: { step15: boolean; off: boolean }): number {
  const norm = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
  if (o.off) return norm(deg);
  if (o.step15) return norm(Math.round(deg / 15) * 15);
  const q = Math.round(deg / 90) * 90;
  return norm(Math.abs(deg - q) <= 3 ? q : deg);
}

/**
 * The frame after dragging `handle` from p0 to p (paper mm). Resizing works along the frame's
 * own sides; turning goes around its center.
 */
export function dragFrame(
  start: Frame,
  handle: FrameHandle,
  p0: Vec2,
  p: Vec2,
  o: DragOptions,
): Frame {
  if (handle === 'move') return { ...start, cx: start.cx + p.x - p0.x, cy: start.cy + p.y - p0.y };
  if (handle === 'rotate') {
    const a0 = Math.atan2(p0.y - start.cy, p0.x - start.cx);
    const a1 = Math.atan2(p.y - start.cy, p.x - start.cx);
    return { ...start, rot: start.rot + ((a1 - a0) * 180) / Math.PI };
  }
  const d = turn({ x: p.x - p0.x, y: p.y - p0.y }, -start.rot);
  const nb = dragBox(localBox(start), handle, d.x, d.y, o);
  const c = fromFrame(start, boxCenter(nb));
  return { cx: c.x, cy: c.y, w: w(nb), h: h(nb), rot: start.rot };
}

/** The matrix taking frame `a` onto frame `b` (what's drawn in a moves to b). */
export function frameMatrix(a: Frame, b: Frame): Matrix {
  const kx = a.w > 0 ? b.w / a.w : 1;
  const ky = a.h > 0 ? b.h / a.h : 1;
  // T(b) · R(b.rot) · S(kx, ky) · R(−a.rot) · T(−a)
  const r1 = turn({ x: 1, y: 0 }, -a.rot);
  const r2 = turn({ x: 0, y: 1 }, -a.rot);
  // Columns of S·R(−a.rot), then R(b.rot) on them.
  const c1 = turn({ x: kx * r1.x, y: ky * r1.y }, b.rot);
  const c2 = turn({ x: kx * r2.x, y: ky * r2.y }, b.rot);
  return [
    c1.x,
    c1.y,
    c2.x,
    c2.y,
    b.cx - c1.x * a.cx - c2.x * a.cy,
    b.cy - c1.y * a.cx - c2.y * a.cy,
  ];
}

/** A layer's frame: its placement applied to its bounds (before placement). */
export function frameOf(base: Box, p: LayerPlacement | null | undefined): Frame {
  const c = boxCenter(base);
  return {
    cx: c.x + (p?.dx ?? 0),
    cy: c.y + (p?.dy ?? 0),
    w: w(base) * (p?.sx ?? 1),
    h: h(base) * (p?.sy ?? 1),
    rot: p?.rot ?? 0,
  };
}

/** The placement that puts a layer (bounds `base` before placement) at frame `f`. */
export function placementForFrame(
  base: Box,
  f: Frame,
  current: LayerPlacement | null | undefined,
): LayerPlacement {
  const r = (v: number, d = 1000) => Math.round(v * d) / d;
  const c = boxCenter(base);
  const rot = r(snapAngle(f.rot, { step15: false, off: true }), 100);
  return {
    dx: r(f.cx - c.x),
    dy: r(f.cy - c.y),
    sx: r(w(base) > 0 ? f.w / w(base) : (current?.sx ?? 1), 1e5),
    sy: r(h(base) > 0 ? f.h / h(base) : (current?.sy ?? 1), 1e5),
    ...(rot ? { rot } : {}),
  };
}

/** True if a turn isn't a whole number of quarter turns (the layer's sides aren't level). */
export const offAxis = (rot: number) => Math.abs(rot / 90 - Math.round(rot / 90)) > 1e-6;

/**
 * Moving, scaling or turning several layers as a group (the group's frame from → to): each
 * layer's center follows the group, and each turns with it. Scaling stretches each layer along
 * the paper's axes, so it has to be proportional (kx = ky) if any layer is turned off-axis.
 */
export function groupFrames(
  members: Record<string, Frame>,
  from: Frame,
  to: Frame,
): Record<string, Frame> {
  const m = frameMatrix(from, to);
  const turnBy = to.rot - from.rot;
  const kx = from.w > 0 ? to.w / from.w : 1;
  const ky = from.h > 0 ? to.h / from.h : 1;
  const out: Record<string, Frame> = {};
  for (const [id, f] of Object.entries(members)) {
    const c = { x: m[0] * f.cx + m[2] * f.cy + m[4], y: m[1] * f.cx + m[3] * f.cy + m[5] };
    // A layer turned a quarter (or three) has its width along the paper's height.
    const sideways = Math.abs(Math.round(f.rot / 90)) % 2 === 1;
    const [sw, sh] = sideways ? [ky, kx] : [kx, ky];
    out[id] = { cx: c.x, cy: c.y, w: f.w * sw, h: f.h * sh, rot: f.rot + turnBy };
  }
  return out;
}
