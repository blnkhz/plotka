import type { Vec2 } from './geometry/vec2';

/**
 * Core data model. All coordinates are in millimeters, origin top left, y pointing down.
 */

export type Polyline = { points: Vec2[]; closed: boolean };

/** A closed area that can be hatched. `outer` holds every ring (outer boundaries and holes). */
export type FillRegion = {
  outer: Vec2[][];
  fillRule: 'nonzero' | 'evenodd';
  /** Source fill color, normalized to `#rrggbb` when possible. Used for density from color. */
  color?: string;
  /**
   * Paper-colored (white) fill: never drawn, but hides shapes under it when the layer's
   * `hideCovered` is on.
   */
  knockout?: boolean;
};

export type FillType =
  'none' | 'lines' | 'crosshatch' | 'zigzag' | 'concentric' | 'spiral' | 'dots';

export type FillSettings = {
  type: FillType;
  /** mm between lines ("line density"). */
  spacing: number;
  /** Degrees. */
  angle: number;
  /** Second pass angle for crosshatch. Defaults to angle + 90. */
  crossAngle?: number;
  /** mm pulled in from the outline so fills don't overrun the stroke. */
  inset: number;
  /** Join adjacent hatch lines (or concentric rings) without lifting the pen when safe. */
  connect: boolean;
  /** Dots: random offset as a fraction of spacing, 0..1. */
  jitter?: number;
  /** Darker source colors get tighter spacing (spacing ÷ darkness). */
  densityFromColor?: boolean;
};

/**
 * Plot the layer several times, each pass shifted / turned / scaled slightly from the last,
 * usually with different pen colors.
 */
export type PassSettings = {
  /** Number of passes; 1 = off. */
  count: number;
  /** mm between neighboring passes. */
  offsetX: number;
  offsetY: number;
  /** Degrees between neighboring passes. */
  rotate: number;
  /** % size change between neighboring passes. */
  scale: number;
  /** Pen color per pass, cycled. */
  colors: string[];
};

export type LayerSettings = {
  /** % of max. */
  speedPenDown: number;
  speedPenUp: number;
  /** 0..100 */
  penPosUp: number;
  penPosDown: number;
  fill: FillSettings | null;
  drawOutline: boolean;
  /** Later shapes in the layer hide the parts of earlier ones they cover, like in the SVG. */
  hideCovered: boolean;
  /** Repeat the layer with slight shifts. Null or count 1 = off. */
  passes?: PassSettings | null;
};

export type Layer = {
  id: string;
  name: string;
  /** Display color, also used for pen mapping. */
  color: string;
  visible: boolean;
  /** Include in plot. */
  plot: boolean;
  /** Which physical pen. Single pen for now, kept for multi-pen later. */
  penId: string;
  /** Outlines from the source. */
  strokes: Polyline[];
  /** Closed shapes that can be hatched. */
  fills: FillRegion[];
  settings: LayerSettings;
  /** Set on layers made by the passes step: which layer and pass they came from. */
  passOf?: { layerId: string; index: number; count: number };
};

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export type PlotDocument = {
  /** Size of the source artwork in mm (from width/height or viewBox). */
  width: number;
  height: number;
  layers: Layer[];
  /** Non-fatal problems found while importing or processing, shown to the user. */
  warnings: string[];
  /** Info about where the document came from, used by the UI (e.g. to offer layer options). */
  source?: {
    importer: string;
    /** True if the file defined its own layers (e.g. Inkscape layers). */
    hasLayers: boolean;
    /** 'illustrator', 'inkscape', 'figma', 'affinity', ... when detected. */
    generator?: string;
  };
  /**
   * The area the page fit places, when it should differ from the drawn bounds. Set by a
   * transform whose output must not jump around while it's adjusted (the kaleidoscope's circle).
   * Only the last transform's frame counts: transforms get their input without one.
   */
  frame?: Bounds;
};

export const DEFAULT_PEN_ID = 'default';

export const defaultLayerSettings = (): LayerSettings => ({
  speedPenDown: 25,
  speedPenUp: 75,
  penPosUp: 60,
  penPosDown: 30,
  fill: null,
  drawOutline: false,
  hideCovered: true,
});

export function createLayer(id: string, name: string, color = '#000000'): Layer {
  return {
    id,
    name,
    color,
    visible: true,
    plot: true,
    penId: DEFAULT_PEN_ID,
    strokes: [],
    fills: [],
    settings: defaultLayerSettings(),
  };
}
