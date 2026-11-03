import type { Polyline } from '../model';
import type { Vec2 } from '../geometry/vec2';

/**
 * Image dithering: a picture becomes a grid of pen marks, darker areas getting more of them.
 * Works on RGBA pixels already sampled one per grid cell (the app scales the image down with
 * the browser), so nothing here decodes images.
 */

/**
 * Ordered: a fixed threshold pattern, tidy and regular. Diffusion: Floyd–Steinberg, organic.
 * Halftone: a mark in every cell, bigger where it's darker.
 */
export type DitherMethod = 'ordered' | 'diffusion' | 'halftone';

/** The mark drawn in each inked cell. `dot` is a single pen tap. */
export type MarkShape = 'square' | 'circle' | 'x' | 'plus' | 'line' | 'dot';

export type DitherSettings = {
  /** Width of the result on paper, mm (the height follows the image). */
  width: number;
  /** Grid cell size, mm. */
  cell: number;
  method: DitherMethod;
  /** -100 (darker) .. 100 (lighter). */
  brightness: number;
  /** 0.2 .. 3; 1 = as is. */
  contrast: number;
  /** Ink the light parts instead (light ink on dark paper). */
  invert: boolean;
  shape: MarkShape;
  /** Mark size as a share of the cell, 10 .. 100 %. */
  markSize: number;
  /** For `line` marks: degrees, counterclockwise from horizontal. */
  lineAngle: number;
};

export const defaultDitherSettings = (): DitherSettings => ({
  width: 150,
  cell: 1,
  method: 'ordered',
  brightness: 0,
  contrast: 1,
  invert: false,
  shape: 'circle',
  markSize: 80,
  lineAngle: 45,
});

export const DITHER_METHODS: readonly DitherMethod[] = ['ordered', 'diffusion', 'halftone'];

/** Halftone: cells lighter than this get no mark (it would be smaller than the pen). */
export const HALFTONE_MIN_INK = 0.03;
export const MARK_SHAPES: readonly MarkShape[] = ['square', 'circle', 'x', 'plus', 'line', 'dot'];

/** Most cells in a grid; past this the cells get bigger (a plot of more marks takes days). */
export const MAX_CELLS = 250_000;

export type DitherGrid = {
  cols: number;
  rows: number;
  /** The cell size actually used, mm (bigger than asked if the grid was capped). */
  cell: number;
  /** Size of the result, mm. */
  width: number;
  height: number;
  /** The cell size was raised to stay under MAX_CELLS. */
  capped: boolean;
};

/** The grid for an image of this many pixels, at these settings. */
export function ditherGrid(imageW: number, imageH: number, s: DitherSettings): DitherGrid {
  const aspect = imageH / Math.max(1, imageW);
  const height = s.width * aspect;
  let cell = Math.max(0.05, s.cell);
  let capped = false;
  if ((s.width / cell) * (height / cell) > MAX_CELLS) {
    cell = Math.sqrt((s.width * height) / MAX_CELLS);
    capped = true;
  }
  const cols = Math.max(1, Math.round(s.width / cell));
  const size = s.width / cols;
  const rows = Math.max(1, Math.round(height / size));
  return { cols, rows, cell: size, width: cols * size, height: rows * size, capped };
}

/** How much ink each cell wants, 0 (paper) .. 1 (black), after brightness, contrast, invert. */
export function inkLevels(rgba: ArrayLike<number>, s: DitherSettings): Float32Array {
  const n = Math.floor(rgba.length / 4);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3]! / 255;
    const lum = (0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!) / 255;
    // Transparent parts count as white paper.
    let v = lum * a + (1 - a);
    v += s.brightness / 100;
    v = (v - 0.5) * s.contrast + 0.5;
    const ink = 1 - Math.min(1, Math.max(0, v));
    out[i] = s.invert ? 1 - ink : ink;
  }
  return out;
}

/** The 8 × 8 Bayer threshold matrix (values 0..63). */
const BAYER8: number[] = (() => {
  let m = [[0]];
  for (let size = 1; size < 8; size *= 2) {
    const next: number[][] = Array.from({ length: size * 2 }, () => []);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const v = m[y]![x]! * 4;
        next[y]![x] = v;
        next[y]![x + size] = v + 2;
        next[y + size]![x] = v + 3;
        next[y + size]![x + size] = v + 1;
      }
    m = next;
  }
  return m.flat();
})();

/** Which cells get a mark. */
export function ditherCells(
  ink: Float32Array,
  cols: number,
  rows: number,
  method: Exclude<DitherMethod, 'halftone'>,
) {
  const on = new Uint8Array(cols * rows);
  if (method === 'ordered') {
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const t = (BAYER8[(y % 8) * 8 + (x % 8)]! + 0.5) / 64;
        on[y * cols + x] = ink[y * cols + x]! > t ? 1 : 0;
      }
    return on;
  }
  // Floyd–Steinberg, rows in alternating directions so the error doesn't drift one way.
  const e = Float32Array.from(ink);
  for (let y = 0; y < rows; y++) {
    const ltr = y % 2 === 0;
    for (let k = 0; k < cols; k++) {
      const x = ltr ? k : cols - 1 - k;
      const i = y * cols + x;
      const v = e[i]! >= 0.5 ? 1 : 0;
      on[i] = v;
      const err = e[i]! - v;
      const f = ltr ? 1 : -1;
      if (x + f >= 0 && x + f < cols) e[i + f] = e[i + f]! + (err * 7) / 16;
      if (y + 1 < rows) {
        const d = i + cols;
        if (x - f >= 0 && x - f < cols) e[d - f] = e[d - f]! + (err * 3) / 16;
        e[d] = e[d]! + (err * 5) / 16;
        if (x + f >= 0 && x + f < cols) e[d + f] = e[d + f]! + (err * 1) / 16;
      }
    }
  }
  return on;
}

/**
 * The pen marks for the inked cells, row by row in alternating directions. With `scale` (one
 * value 0..1 per cell), each mark is that share of its full size: halftone.
 */
export function ditherMarks(
  on: Uint8Array,
  grid: DitherGrid,
  s: DitherSettings,
  scale?: Float32Array,
): Polyline[] {
  const { cols, rows, cell } = grid;
  const full = (Math.min(100, Math.max(10, s.markSize)) / 100) * (cell / 2);
  const a = (s.lineAngle * Math.PI) / 180;
  const out: Polyline[] = [];
  const line = (pts: Vec2[], closed = false) => out.push({ points: pts, closed });
  for (let y = 0; y < rows; y++) {
    const ltr = y % 2 === 0;
    for (let k = 0; k < cols; k++) {
      const x = ltr ? k : cols - 1 - k;
      if (!on[y * cols + x]) continue;
      const r = scale ? full * scale[y * cols + x]! : full;
      const ux = Math.cos(a) * r;
      const uy = -Math.sin(a) * r;
      const cx = (x + 0.5) * cell;
      const cy = (y + 0.5) * cell;
      switch (s.shape) {
        case 'square':
          line(
            [
              { x: cx - r, y: cy - r },
              { x: cx + r, y: cy - r },
              { x: cx + r, y: cy + r },
              { x: cx - r, y: cy + r },
            ],
            true,
          );
          break;
        case 'circle': {
          const pts: Vec2[] = [];
          for (let j = 0; j < 12; j++) {
            const t = (j / 12) * Math.PI * 2;
            pts.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
          }
          line(pts, true);
          break;
        }
        case 'x':
          line([
            { x: cx - r, y: cy - r },
            { x: cx + r, y: cy + r },
          ]);
          line([
            { x: cx + r, y: cy - r },
            { x: cx - r, y: cy + r },
          ]);
          break;
        case 'plus':
          line([
            { x: cx - r, y: cy },
            { x: cx + r, y: cy },
          ]);
          line([
            { x: cx, y: cy - r },
            { x: cx, y: cy + r },
          ]);
          break;
        case 'line':
          line([
            { x: cx - ux, y: cy - uy },
            { x: cx + ux, y: cy + uy },
          ]);
          break;
        case 'dot':
          // Two equal points: a deliberate tap, kept by path cleanup.
          line([
            { x: cx, y: cy },
            { x: cx, y: cy },
          ]);
          break;
      }
    }
  }
  return out;
}

export type DitherResult = { grid: DitherGrid; marks: Polyline[] };

/** RGBA pixels, one per grid cell (`grid.cols` × `grid.rows`), to pen marks. */
export function ditherImage(rgba: ArrayLike<number>, grid: DitherGrid, s: DitherSettings) {
  const ink = inkLevels(rgba, s);
  // Halftone: every cell that wants ink gets a mark, its size following the ink. Marks are
  // outlines, so the ink they leave grows with their size (not their area): size = ink.
  // Dots can't change size, so they're placed like ordered dithering.
  if (s.method === 'halftone' && s.shape !== 'dot') {
    const on = ink.map((v) => (v > HALFTONE_MIN_INK ? 1 : 0));
    return {
      grid,
      marks: ditherMarks(Uint8Array.from(on), grid, s, ink),
    } satisfies DitherResult;
  }
  const method = s.method === 'halftone' ? 'ordered' : s.method;
  const on = ditherCells(ink, grid.cols, grid.rows, method);
  return { grid, marks: ditherMarks(on, grid, s) } satisfies DitherResult;
}

const f = (n: number) => String(Math.round(n * 1000) / 1000);

/** The marks as an SVG document in mm, ready to import or save. */
export function ditherSvg({ grid, marks }: DitherResult, title = 'Dithered image'): string {
  const d = marks
    .map(
      (m) =>
        `M${f(m.points[0]!.x)} ${f(m.points[0]!.y)}` +
        m.points
          .slice(1)
          .map((p) => `L${f(p.x)} ${f(p.y)}`)
          .join('') +
        (m.closed ? 'Z' : ''),
    )
    .join('');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- Dithered in Plotka -->',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(grid.width)}mm" height="${f(grid.height)}mm" viewBox="0 0 ${f(grid.width)} ${f(grid.height)}">`,
    `  <title>${title.replace(/[<>&"]/g, '')}</title>`,
    `  <path d="${d}" fill="none" stroke="#000000" stroke-width="0.3" stroke-linecap="round" stroke-linejoin="round"/>`,
    '</svg>',
    '',
  ].join('\n');
}
