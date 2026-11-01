import type { PlotDocument } from '../model';

export type LayerMode =
  /** Use the file's own layers (Inkscape layers). If there are none, fall back to `single`. */
  | 'auto'
  /** Everything in one layer. */
  | 'single'
  /** One layer per stroke color (fill color for shapes without a stroke). */
  | 'byColor';

export type ImportOptions = {
  /** Max distance in mm between a curve and its flattened polyline. Default 0.05. */
  tolerance?: number;
  layerMode?: LayerMode;
  /**
   * Pixels per inch for `px` and unitless lengths. Default 96 (CSS), or 72 for files
   * exported by Adobe Illustrator, whose "px" are really points.
   */
  pxPerInch?: number;
};

export interface Importer {
  /** 'svg', 'dxf', ... */
  id: string;
  label: string;
  /** Lowercase, with dot: ['.svg'] */
  extensions: string[];
  canImport(bytes: Uint8Array, filename: string): boolean;
  import(bytes: Uint8Array, filename: string, opts: ImportOptions): Promise<PlotDocument>;
}

export class ImportError extends Error {}
