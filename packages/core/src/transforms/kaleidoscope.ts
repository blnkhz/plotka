import { documentBounds, isEmptyBounds } from '../geometry/bounds';
import {
  applyToPoint,
  multiply,
  rotate,
  scaleMatrix,
  translate,
  type Matrix,
} from '../geometry/matrix';
import {
  clipPolylinesToShape,
  intersectShapes,
  regionShape,
  type Shape,
} from '../geometry/polygon';
import { transformFill, transformPolyline } from '../geometry/transform-doc';
import type { Vec2 } from '../geometry/vec2';
import type { FillRegion, Layer, PlotDocument, Polyline } from '../model';
import type { ParamValues, TransformDef, TransformGuide } from './types';

/** Stop adding wedges past this many output points. */
export const MAX_KALEIDOSCOPE_POINTS = 2_000_000;

const num = (p: ParamValues, k: string, d: number) =>
  typeof p[k] === 'number' ? (p[k] as number) : d;

/** Above this, the preview doesn't show the artwork under the wedge while adjusting. */
const MAX_GUIDE_POINTS = 200_000;

/** Wedge 0 points up (y is down, so -90°). */
const UP = -90;

type Frame = {
  /** Kaleidoscope center (output) and radius. */
  o: Vec2;
  r: number;
  /** Artwork width and height used for the % params (never 0). */
  w: number;
  h: number;
  /** Chosen center on the artwork (input). */
  c: Vec2;
  zoom: number;
  angle: number;
  segments: number;
  mirror: boolean;
  /** Degrees per wedge. */
  span: number;
};

function frameOf(doc: PlotDocument, p: ParamValues): Frame | null {
  const b = documentBounds(doc);
  if (isEmptyBounds(b)) return null;
  const bw = b.maxX - b.minX;
  const bh = b.maxY - b.minY;
  const r = (Math.min(bw, bh) || Math.max(bw, bh)) / 2;
  if (!(r > 0)) return null;
  const w = bw || 2 * r;
  const h = bh || 2 * r;
  const o = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  const mirror = p['mirror'] !== false;
  let segments = Math.max(2, Math.min(48, Math.round(num(p, 'segments', 8))));
  // Mirrored wedges only meet seamlessly all the way round with an even count.
  if (mirror && segments % 2) segments++;
  return {
    o,
    r,
    w,
    h,
    c: { x: o.x + (num(p, 'centerX', 0) / 100) * w, y: o.y + (num(p, 'centerY', 0) / 100) * h },
    zoom: Math.max(0.01, num(p, 'zoom', 100) / 100),
    angle: num(p, 'angle', 0),
    segments,
    mirror,
    span: 360 / segments,
  };
}

/** Wedge 0 as a polygon: the center, then the arc (one point per degree at most). */
function wedgePolygon(f: Frame): Vec2[] {
  const n = Math.max(8, Math.ceil(f.span));
  const start = UP - f.span / 2;
  const pts: Vec2[] = [f.o];
  for (let i = 0; i <= n; i++) {
    const a = ((start + (f.span * i) / n) * Math.PI) / 180;
    pts.push({ x: f.o.x + f.r * Math.cos(a), y: f.o.y + f.r * Math.sin(a) });
  }
  return pts;
}

/** Input → output for the wedge mode: center C to O, zoomed, turned by -angle. */
function sourceMatrix(f: Frame): Matrix {
  let m: Matrix = translate(-f.c.x, -f.c.y);
  m = multiply(rotate(-f.angle), m);
  m = multiply(scaleMatrix(f.zoom), m);
  return multiply(translate(f.o.x, f.o.y), m);
}

const clipLayer = (l: Layer, shape: Shape): Layer => ({
  ...l,
  strokes: clipPolylinesToShape(l.strokes, shape, 'inside'),
  fills: l.fills
    .map((fr): FillRegion | null => {
      const s = intersectShapes(regionShape(fr), shape);
      return s.length ? { ...fr, outer: s, fillRule: 'nonzero' } : null;
    })
    .filter((fr): fr is FillRegion => fr !== null),
});

/** Adds points so no segment is longer than `step`. */
function densify(pts: Vec2[], closed: boolean, step: number): Vec2[] {
  const out: Vec2[] = [];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const k = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let j = 0; j < k; j++)
      out.push({ x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k });
  }
  if (!closed && pts.length) out.push(pts[pts.length - 1]!);
  return out;
}

/** Wedge 0 with the source (already in output units, around O) taken from the artwork. */
function wedgeContent(doc: PlotDocument, f: Frame, squeeze: boolean): Layer[] {
  const m = sourceMatrix(f);
  const placed = doc.layers.map((l) => ({
    ...l,
    strokes: l.strokes.map((s) => transformPolyline(s, m)),
    fills: l.fills.map((fr) => transformFill(fr, m)),
  }));
  if (!squeeze)
    return placed.map((l) => {
      const c = clipLayer(l, [wedgePolygon(f)]);
      return { ...c, strokes: c.strokes.map((s) => snapEnds(s, f)) };
    });

  // Squeeze: the artwork's frame (w × h around O after the zoom) is bent into the wedge.
  const { w, h, o, r, span } = f;
  // A little bigger, so lines on the artwork's edge (a border) aren't lost to the clip.
  const g = 1e-4 * Math.max(w, h);
  const box: Vec2[] = [
    { x: o.x - w / 2 - g, y: o.y - h / 2 - g },
    { x: o.x + w / 2 + g, y: o.y - h / 2 - g },
    { x: o.x + w / 2 + g, y: o.y + h / 2 + g },
    { x: o.x - w / 2 - g, y: o.y + h / 2 + g },
  ];
  const step = Math.min(w, h) / 200;
  const start = UP - span / 2;
  const bend = (q: Vec2): Vec2 => {
    const clamp = (t: number) => Math.min(1, Math.max(0, t));
    const u = clamp((q.x - (o.x - w / 2)) / w); // 0..1 across the wedge
    const v = clamp((q.y - (o.y - h / 2)) / h); // 0 = top = outer edge
    const a = ((start + u * span) * Math.PI) / 180;
    const rad = r * (1 - v);
    return { x: o.x + rad * Math.cos(a), y: o.y + rad * Math.sin(a) };
  };
  return placed.map((l) => {
    const c = clipLayer(l, [box]);
    return {
      ...c,
      strokes: c.strokes.map((s) => ({
        points: densify(s.points, s.closed, step).map(bend),
        closed: s.closed,
      })),
      fills: c.fills.map((fr) => ({
        ...fr,
        outer: fr.outer.map((ring) => densify(ring, true, step).map(bend)),
      })),
    };
  });
}

/**
 * Clipping rounds to about 0.001 mm, so a cut end sits just off the wedge edge and its mirror
 * image a hair away from it. Snapping cut ends onto the edge makes the seams meet exactly.
 */
function snapEnds(s: Polyline, f: Frame): Polyline {
  if (s.closed || s.points.length < 2) return s;
  const tol = 1e-6 * f.r + 0.005;
  const edges = [UP - f.span / 2, UP + f.span / 2].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return { x: Math.cos(a), y: Math.sin(a) };
  });
  const snap = (p: Vec2): Vec2 => {
    const d = { x: p.x - f.o.x, y: p.y - f.o.y };
    for (const e of edges) {
      const t = d.x * e.x + d.y * e.y;
      if (t >= -tol && Math.abs(d.x * e.y - d.y * e.x) <= tol)
        return { x: f.o.x + Math.max(0, t) * e.x, y: f.o.y + Math.max(0, t) * e.y };
    }
    return p;
  };
  const pts = [...s.points];
  pts[0] = snap(pts[0]!);
  pts[pts.length - 1] = snap(pts[pts.length - 1]!);
  return { points: pts, closed: false };
}

/** The matrix that takes wedge 0 to wedge k. */
function wedgeMatrix(f: Frame, k: number): Matrix {
  const turn = (deg: number) => rotate(deg, f.o.x, f.o.y);
  if (!f.mirror || k % 2 === 0) return turn(k * f.span);
  // Reflect across wedge 0's right edge (giving wedge 1), then turn.
  const edge = UP + f.span / 2;
  const flip = multiply(
    translate(f.o.x, f.o.y),
    multiply(scaleMatrix(1, -1), translate(-f.o.x, -f.o.y)),
  );
  const reflect = multiply(turn(edge), multiply(flip, turn(-edge)));
  return multiply(turn((k - 1) * f.span), reflect);
}

const pointCount = (layers: Layer[]) =>
  layers.reduce(
    (s, l) =>
      s +
      l.strokes.reduce((m, x) => m + x.points.length, 0) +
      l.fills.reduce((m, fr) => m + fr.outer.reduce((k, ring) => k + ring.length, 0), 0),
    0,
  );

/**
 * GEN-1: a kaleidoscope. A wedge of the artwork (or the whole artwork bent into a wedge) is
 * repeated around a center, every other wedge mirrored so the seams match.
 */
export const kaleidoscope: TransformDef = {
  type: 'kaleidoscope',
  name: 'Kaleidoscope',
  description: 'Repeat a wedge of the artwork around a center, mirrored like a kaleidoscope.',
  params: [
    {
      key: 'segments',
      label: 'Wedges',
      type: 'number',
      default: 8,
      min: 2,
      max: 48,
      step: 1,
      integer: true,
      help: 'How many wedges make the circle. With Mirror, odd counts go up by one so every seam matches.',
    },
    {
      key: 'mirror',
      label: 'Mirror every other wedge',
      type: 'boolean',
      default: true,
      help: 'Mirror alternate wedges, like a real kaleidoscope. Off just turns the copies.',
    },
    {
      key: 'source',
      label: 'Source',
      type: 'select',
      default: 'wedge',
      options: [
        { value: 'wedge', label: 'Cut a wedge' },
        { value: 'squeeze', label: 'Squeeze it all in' },
      ],
      help: 'Cut a wedge out of the artwork, or bend the whole artwork into each wedge.',
    },
    {
      key: 'zoom',
      label: 'Zoom',
      type: 'number',
      default: 100,
      min: 10,
      max: 2000,
      step: 5,
      suffix: '%',
      help: 'Zoom into the artwork: more zoom takes a smaller part of it. Scroll in the preview while adjusting.',
    },
    {
      key: 'centerX',
      label: 'Center X',
      type: 'number',
      default: 0,
      min: -100,
      max: 100,
      step: 1,
      suffix: '%',
      help: 'Where the center sits on the artwork, from its middle, as a share of its width. Drag in the preview while adjusting.',
    },
    {
      key: 'centerY',
      label: 'Center Y',
      type: 'number',
      default: 0,
      min: -100,
      max: 100,
      step: 1,
      suffix: '%',
      help: 'The same, as a share of its height.',
    },
    {
      key: 'angle',
      label: 'Wedge angle',
      type: 'number',
      default: 0,
      min: -360,
      max: 360,
      step: 5,
      suffix: '°',
      help: 'Turn the wedge over the artwork to take a different slice.',
    },
  ],

  apply(doc, p) {
    const f = frameOf(doc, p);
    if (!f) return doc;
    const wedge = wedgeContent(doc, f, p['source'] === 'squeeze');
    const maxWedges = Math.max(
      1,
      Math.floor(MAX_KALEIDOSCOPE_POINTS / Math.max(1, pointCount(wedge))),
    );
    const made = Math.min(f.segments, maxWedges);
    const layers: Layer[] = wedge.map((l) => ({ ...l, strokes: [], fills: [] }));
    for (let k = 0; k < made; k++) {
      const m = wedgeMatrix(f, k);
      wedge.forEach((l, li) => {
        const out = layers[li]!;
        for (const s of l.strokes) out.strokes.push(transformPolyline(s, m));
        for (const fr of l.fills) out.fills.push(transformFill(fr, m));
      });
    }
    const warnings =
      made < f.segments
        ? [
            ...doc.warnings,
            `Kaleidoscope stopped at ${made} of ${f.segments} wedges to keep the app responsive.`,
          ]
        : doc.warnings;
    // The page fit uses the whole circle, so dragging or zooming never moves the layout.
    const frame = { minX: f.o.x - f.r, minY: f.o.y - f.r, maxX: f.o.x + f.r, maxY: f.o.y + f.r };
    return { ...doc, layers, warnings, frame, width: 2 * f.r, height: 2 * f.r };
  },

  guide(doc, p): TransformGuide | null {
    const f = frameOf(doc, p);
    if (!f) return null;
    // Moving the content by d needs the center to move by -(1/zoom)·rot(angle)·d (in mm).
    const a = (f.angle * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const kx = -100 / (f.zoom * f.w);
    const ky = -100 / (f.zoom * f.h);
    const squeeze = p['source'] === 'squeeze';
    // The artwork where it sits now: in squeeze mode the frame's rectangle is what's bent in.
    const m = sourceMatrix(f);
    const source: Polyline[] = [];
    let points = 0;
    for (const l of doc.layers) {
      if (!l.visible) continue;
      for (const s of l.strokes) {
        source.push(transformPolyline(s, m));
        points += s.points.length;
      }
      for (const fr of l.fills)
        for (const ring of fr.outer) {
          source.push(transformPolyline({ points: ring, closed: true }, m));
          points += ring.length;
        }
    }
    const { o, w, h } = f;
    return {
      outline: squeeze
        ? [
            { x: o.x - w / 2, y: o.y - h / 2 },
            { x: o.x + w / 2, y: o.y - h / 2 },
            { x: o.x + w / 2, y: o.y + h / 2 },
            { x: o.x - w / 2, y: o.y + h / 2 },
          ]
        : wedgePolygon(f),
      ...(points <= MAX_GUIDE_POINTS ? { source } : {}),
      drag: {
        xKey: 'centerX',
        yKey: 'centerY',
        perMm: [kx * cos, -kx * sin, ky * sin, ky * cos],
      },
      zoomKey: 'zoom',
    };
  },
};

/** Exposed for tests: input point → where wedge 0 puts it (wedge mode). */
export function kaleidoscopeSourcePoint(doc: PlotDocument, p: ParamValues, q: Vec2): Vec2 | null {
  const f = frameOf(doc, p);
  if (!f) return null;
  return applyToPoint(sourceMatrix(f), q.x, q.y);
}
