import type { PlotDocument } from '../model';

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
};

/** One step in the user's transform list. */
export type PipelineStep = {
  /** Unique within the list. */
  id: string;
  type: string;
  enabled: boolean;
  params: ParamValues;
};
