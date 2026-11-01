import type { Vec2 } from './geometry/vec2';

/**
 * Core data model. All coordinates are in millimeters, origin top left, y pointing down.
 */

export type Polyline = { points: Vec2[]; closed: boolean };

/** A closed area that can be hatched. `outer` holds every ring (outer boundaries and holes). */
export type FillRegion = {
  outer: Vec2[][];
  fillRule: 'nonzero' | 'evenodd';
  /** Source fill color, normalized to `#rrggbb` when possible. Used for density mapping later. */
  color?: string;
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
  /** Join adjacent hatch lines without lifting the pen when safe. */
  connect: boolean;
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
};

export const DEFAULT_PEN_ID = 'default';

export const defaultLayerSettings = (): LayerSettings => ({
  speedPenDown: 25,
  speedPenUp: 75,
  penPosUp: 60,
  penPosDown: 30,
  fill: null,
  drawOutline: false,
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
