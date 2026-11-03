import type { Vec2 } from '../geometry/vec2';
import type { PlotDocument, Polyline } from '../model';

/** One editable parameter. The settings UI is generated from these. */
export type ParamSpec =
  | {
      key: string;
      label: string;
      type: 'number';
      default: number;
      min: number;
      max: number;
      step: number;
      suffix?: string;
      /** Round to whole numbers. */
      integer?: boolean;
      help?: string;
    }
  | {
      key: string;
      label: string;
      type: 'select';
      default: string;
      options: { value: string; label: string }[];
      help?: string;
    }
  | { key: string; label: string; type: 'boolean'; default: boolean; help?: string };

export type ParamValues = Record<string, number | string | boolean>;

/** A transform type: name, params schema and the function that applies it. */
export type TransformDef = {
  type: string;
  name: string;
  description: string;
  params: ParamSpec[];
  /** Pure: returns a new document. Add messages to `warnings` for anything the user should know. */
  apply(doc: PlotDocument, params: ParamValues): PlotDocument;
  /**
   * Optional: lets the user adjust the transform by dragging and zooming in the preview.
   * Gets the same input as `apply`.
   */
  guide?(doc: PlotDocument, params: ParamValues): TransformGuide | null;
};

/**
 * What the preview shows and changes while the user adjusts a transform directly: an outline,
 * and how dragging and zooming map to params. Coordinates are the transform's output (mm).
 */
export type TransformGuide = {
  /** Closed outline drawn over the preview (e.g. the kaleidoscope's wedge). */
  outline: Vec2[];
  /**
   * The input artwork where it currently sits, drawn faintly while adjusting so the user sees
   * what goes into the outline. Left out when it's very large.
   */
  source?: Polyline[];
  /**
   * Dragging by (dx, dy) mm changes `xKey` by `perMm[0]·dx + perMm[1]·dy` and `yKey` by
   * `perMm[2]·dx + perMm[3]·dy`.
   */
  drag: { xKey: string; yKey: string; perMm: [number, number, number, number] };
  /** A % param multiplied by the zoom factor. */
  zoomKey: string;
};

/** One step in the user's transform list. */
export type PipelineStep = {
  /** Unique within the list. */
  id: string;
  type: string;
  enabled: boolean;
  params: ParamValues;
};
