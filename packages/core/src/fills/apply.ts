import { emptyBounds, extendBounds } from '../geometry/bounds';
import { append } from '../util/array';
import {
  clipPolylinesToShape,
  differenceShapes,
  regionShape,
  shapeArea,
  shapeCentroid,
  shapeRegion,
  type Shape,
} from '../geometry/polygon';
import type {
  Bounds,
  FillRegion,
  FillSettings,
  FillType,
  Layer,
  PlotDocument,
  Polyline,
} from '../model';
import type { Vec2 } from '../geometry/vec2';
import { hatchRegion } from './hatch';
import { hexagonFill, triangleFill } from './grids';
import { flowFill, stippleFill } from './organic';
import { concentricFill, dotFill, insetArea, rippleFill, spiralFill } from './patterns';
import { wavyFill } from './wavy';

export const SUPPORTED_FILL_TYPES = [
  'none',
  'lines',
  'crosshatch',
  'waves',
  'noise',
  'flow',
  'triangles',
  'hexagons',
  'concentric',
  'spiral',
  'ripples',
  'dots',
  'stipple',
] as const;

/** Waves and noise settings when a fill doesn't have them yet. */
export const WAVY_DEFAULTS = {
  amplitude: 2,
  wavelength: 10,
  phase: 0,
  noiseScale: 15,
  seed: 1,
} as const;

export const defaultFillSettings = (): FillSettings => ({
  type: 'lines',
  spacing: 0.6,
  angle: 45,
  inset: 0,
  connect: true,
});

/** Spacing never grows past this multiple of the set spacing with density from color. */
export const MAX_DENSITY_FACTOR = 10;
/** Shapes lighter than this darkness (0..1) aren't filled with density from color. */
export const MIN_DARKNESS = 0.05;

/** 0 for white, 1 for black, from a `#rrggbb` color. Null if the color can't be read. */
export function colorDarkness(color: string | undefined): number | null {
  const m = color && /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 1 - (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Spacing for one region, or null to leave it unfilled (too light). */
export function regionSpacing(f: FillSettings, region: FillRegion): number | null {
  if (!f.densityFromColor) return f.spacing;
  const d = colorDarkness(region.color);
  if (d === null) return f.spacing;
  if (d < MIN_DARKNESS) return null;
  return f.spacing / Math.max(d, 1 / MAX_DENSITY_FACTOR);
}

/** Fill polylines for one region (already reduced to its visible area). */
export function fillRegion(region: FillRegion, f: FillSettings, center?: Vec2): Polyline[] {
  if (f.type === 'none' || !(f.spacing > 0)) return [];
  const spacing = regionSpacing(f, region);
  if (spacing === null) return [];
  const base = { spacing, angle: f.angle, inset: f.inset, connect: f.connect };
  switch (f.type) {
    case 'lines':
      return hatchRegion(region, base);
    case 'crosshatch':
      return [
        ...hatchRegion(region, base),
        ...hatchRegion(region, { ...base, angle: f.crossAngle ?? f.angle + 90 }),
      ];
    case 'waves':
    case 'noise':
      return wavyFill(region, {
        ...base,
        kind: f.type,
        amplitude: f.amplitude ?? WAVY_DEFAULTS.amplitude,
        wavelength: f.wavelength ?? WAVY_DEFAULTS.wavelength,
        phase: f.phase ?? WAVY_DEFAULTS.phase,
        shape: f.waveShape ?? 'sine',
        noiseScale: f.noiseScale ?? WAVY_DEFAULTS.noiseScale,
        seed: f.seed ?? WAVY_DEFAULTS.seed,
        allowCross: !!f.allowCross,
      });
    case 'concentric':
      return concentricFill(region, base);
    case 'spiral':
      return spiralFill(region, center ? { ...base, center } : base);
    case 'ripples':
      return rippleFill(region, center ? { ...base, center } : base);
    case 'triangles':
      return triangleFill(region, base);
    case 'hexagons':
      return hexagonFill(region, base);
    case 'stipple':
      return dashes(
        stippleFill(region, { spacing, inset: f.inset, seed: f.seed ?? WAVY_DEFAULTS.seed }),
        region,
        f,
      );
    case 'flow':
      return flowFill(region, {
        spacing,
        angle: f.angle,
        inset: f.inset,
        noiseScale: f.noiseScale ?? WAVY_DEFAULTS.noiseScale,
        strokeLength: f.strokeLength ?? 0,
        seed: f.seed ?? WAVY_DEFAULTS.seed,
      });
    case 'dots':
      return dashes(dotFill(region, { ...base, jitter: f.jitter }), region, f);
  }
}

/**
 * Dots and stipple with a dash length: each dot becomes a short line centered on it, pointing
 * along the dash angle (the fill's angle by default), cut to the (inset) shape.
 */
function dashes(dots: Polyline[], region: FillRegion, f: FillSettings): Polyline[] {
  const len = f.dashLength ?? 0;
  if (!(len > 0) || !dots.length) return dots;
  const a = ((f.dashAngle ?? f.angle) * Math.PI) / 180;
  const hx = (Math.cos(a) * len) / 2;
  const hy = (Math.sin(a) * len) / 2;
  const lines = dots.map(({ points: [p] }) => ({
    points: [
      { x: p!.x - hx, y: p!.y - hy },
      { x: p!.x + hx, y: p!.y + hy },
    ],
    closed: false,
  }));
  return clipPolylinesToShape(lines, insetArea(region, f.inset), 'inside');
}

/**
 * Where each region's spiral or ripples center (centered fills only, else null): the centroid of its inset
 * area, or with `sharedCenter` of all the layer's drawn regions together, moved by the center
 * offset. Uses whole regions (not what's left visible), so covered parts don't shift it.
 */
/** Fill types that grow from a movable center. */
export const CENTERED_FILLS: readonly FillType[] = ['spiral', 'ripples'];

export function fillCenters(layer: Layer): (Vec2 | null)[] | null {
  const f = layer.settings.fill;
  if (!f || !CENTERED_FILLS.includes(f.type)) return null;
  const dx = f.centerX ?? 0;
  const dy = f.centerY ?? 0;
  // The inset area's centroid, as the spiral always used, so no offset changes nothing.
  const areas = layer.fills.map((r) => (r.knockout ? [] : insetArea(r, f.inset)));
  const own = areas.map((a) => (a.length ? shapeCentroid(a) : null));
  let shared: Vec2 | null = null;
  if (f.sharedCenter) {
    let a = 0;
    let x = 0;
    let y = 0;
    layer.fills.forEach((r, i) => {
      const c = own[i];
      if (!c) return;
      const w = Math.abs(shapeArea(areas[i]!));
      a += w;
      x += c.x * w;
      y += c.y * w;
    });
    shared = a > 0 ? { x: x / a, y: y / a } : null;
  }
  return own.map((c) => {
    const base = f.sharedCenter ? shared : c;
    return base && { x: base.x + dx, y: base.y + dy };
  });
}

const regionBounds = (r: FillRegion): Bounds => {
  const b = emptyBounds();
  for (const ring of r.outer) for (const p of ring) extendBounds(b, p);
  return b;
};
const overlaps = (a: Bounds, b: Bounds) =>
  a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

const outlineOf = (r: FillRegion): Polyline[] =>
  r.outer.map((points) => ({ points, closed: true }));

/**
 * What the pen draws for a layer's fill regions: hatches (per the fill settings) and outlines
 * (with `drawOutline`). With `hideCovered`, later regions hide the parts of earlier ones they
 * cover, and white knockouts hide without being drawn.
 */
export function layerFillPaths(layer: Layer): Polyline[] {
  const f = layer.settings.fill;
  const filling = !!f && f.type !== 'none' && f.spacing > 0;
  const outlines = layer.settings.drawOutline;
  if (!filling && !outlines) return [];
  const regions = layer.fills;
  const hide = layer.settings.hideCovered ?? true;
  const bounds = hide ? regions.map(regionBounds) : [];
  const shapes = new Map<number, Shape>();
  const shapeOf = (i: number) => {
    let s = shapes.get(i);
    if (!s) shapes.set(i, (s = regionShape(regions[i]!)));
    return s;
  };

  const centers = fillCenters(layer);
  const out: Polyline[] = [];
  regions.forEach((region, i) => {
    if (region.knockout) return;
    const center = centers?.[i] ?? undefined;
    // Shapes painted later that overlap this one.
    const above: Shape = [];
    if (hide)
      for (let j = i + 1; j < regions.length; j++)
        if (overlaps(bounds[i]!, bounds[j]!)) append(above, shapeOf(j));
    if (!above.length) {
      if (outlines) append(out, outlineOf(region));
      if (filling) append(out, fillRegion(region, f!, center));
      return;
    }
    if (outlines) append(out, clipPolylinesToShape(outlineOf(region), above, 'outside'));
    if (filling) {
      const visible = differenceShapes(shapeOf(i), above);
      if (visible.length) append(out, fillRegion(shapeRegion(visible, region.color), f!, center));
    }
  });
  return out;
}

/**
 * Filled shapes in a layer that nothing will draw: the layer has no fill type and doesn't draw
 * outlines. (White knockouts don't count; they're never drawn.)
 */
export function undrawnFillCount(layer: Layer): number {
  const f = layer.settings.fill;
  if ((f && f.type !== 'none') || layer.settings.drawOutline) return 0;
  return layer.fills.filter((r) => !r.knockout).length;
}

/** Fill hatches only, without outlines. */
export const layerHatches = (layer: Layer): Polyline[] =>
  layerFillPaths({ ...layer, settings: { ...layer.settings, drawOutline: false } });

/**
 * Fills pipeline step: adds fill hatches and outlines to each layer's strokes. Fill regions are
 * kept for the preview.
 */
export function applyFills(doc: PlotDocument): PlotDocument {
  return {
    ...doc,
    layers: doc.layers.map((l) => {
      const paths = layerFillPaths(l);
      return paths.length ? { ...l, strokes: [...l.strokes, ...paths] } : l;
    }),
  };
}
