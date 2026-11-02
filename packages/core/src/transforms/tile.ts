import { documentBounds, isEmptyBounds } from '../geometry/bounds';
import {
  IDENTITY,
  multiply,
  rotate,
  scaleMatrix,
  translate,
  type Matrix,
} from '../geometry/matrix';
import { transformFill, transformPolyline } from '../geometry/transform-doc';
import type { Layer, PlotDocument } from '../model';
import { seededRandom } from './random';
import type { ParamValues, TransformDef } from './types';

/** Stop adding tiles past this many output points. */
export const MAX_TILE_POINTS = 2_000_000;

const num = (p: ParamValues, k: string, d: number) =>
  typeof p[k] === 'number' ? (p[k] as number) : d;
const str = (p: ParamValues, k: string, d: string) =>
  typeof p[k] === 'string' ? (p[k] as string) : d;

/**
 * Repeats the artwork on a grid (GEN-4). The cell is the artwork's bounds plus the gap; tiles
 * can be shifted per row/column (brick, half-drop), mirrored alternately, rotated, and jittered.
 */
export const tile: TransformDef = {
  type: 'tile',
  name: 'Tile',
  description: 'Repeat the artwork on a grid.',
  params: [
    {
      key: 'columns',
      label: 'Columns',
      type: 'number',
      default: 4,
      min: 1,
      max: 100,
      step: 1,
      integer: true,
    },
    {
      key: 'rows',
      label: 'Rows',
      type: 'number',
      default: 4,
      min: 1,
      max: 100,
      step: 1,
      integer: true,
    },
    {
      key: 'gapX',
      label: 'Gap X',
      type: 'number',
      default: 0,
      min: -1000,
      max: 1000,
      step: 0.5,
      suffix: 'mm',
      help: 'Space between columns, in the artwork’s own size. Negative values overlap.',
    },
    {
      key: 'gapY',
      label: 'Gap Y',
      type: 'number',
      default: 0,
      min: -1000,
      max: 1000,
      step: 0.5,
      suffix: 'mm',
      help: 'Space between rows. Negative values overlap.',
    },
    {
      key: 'rowShift',
      label: 'Row shift',
      type: 'number',
      default: 0,
      min: -100,
      max: 100,
      step: 5,
      suffix: '%',
      help: 'Shift every other row by this share of a tile width. 50% makes a brick pattern.',
    },
    {
      key: 'columnShift',
      label: 'Column shift',
      type: 'number',
      default: 0,
      min: -100,
      max: 100,
      step: 5,
      suffix: '%',
      help: 'Shift every other column by this share of a tile height (half-drop).',
    },
    {
      key: 'mirror',
      label: 'Mirror',
      type: 'select',
      default: 'none',
      options: [
        { value: 'none', label: 'None' },
        { value: 'columns', label: 'Every other column' },
        { value: 'rows', label: 'Every other row' },
        { value: 'both', label: 'Both (checker)' },
      ],
      help: 'Flip alternate tiles, for mirrored patterns.',
    },
    {
      key: 'rotation',
      label: 'Tile rotation',
      type: 'number',
      default: 0,
      min: -360,
      max: 360,
      step: 5,
      suffix: '°',
      help: 'Rotate every tile around its center.',
    },
    {
      key: 'rotationStep',
      label: 'Rotation step',
      type: 'number',
      default: 0,
      min: -360,
      max: 360,
      step: 5,
      suffix: '°',
      help: 'Extra rotation added for each tile, row by row.',
    },
    {
      key: 'angle',
      label: 'Grid angle',
      type: 'number',
      default: 0,
      min: -360,
      max: 360,
      step: 5,
      suffix: '°',
      help: 'Rotate the whole grid.',
    },
    {
      key: 'rotationJitter',
      label: 'Rotation jitter',
      type: 'number',
      default: 0,
      min: 0,
      max: 180,
      step: 1,
      suffix: '°',
      help: 'Random rotation per tile, up to this much either way.',
    },
    {
      key: 'scaleJitter',
      label: 'Size jitter',
      type: 'number',
      default: 0,
      min: 0,
      max: 90,
      step: 1,
      suffix: '%',
      help: 'Random size change per tile, up to this much either way.',
    },
    {
      key: 'seed',
      label: 'Seed',
      type: 'number',
      default: 1,
      min: 0,
      max: 999999,
      step: 1,
      integer: true,
      help: 'Change for a different random result. The same seed always gives the same pattern.',
    },
  ],

  apply(doc, p) {
    const bounds = documentBounds(doc);
    if (isEmptyBounds(bounds)) return doc;
    const columns = Math.max(1, Math.round(num(p, 'columns', 4)));
    const rows = Math.max(1, Math.round(num(p, 'rows', 4)));
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const cellW = w + num(p, 'gapX', 0);
    const cellH = h + num(p, 'gapY', 0);
    const rowShift = (num(p, 'rowShift', 0) / 100) * cellW;
    const columnShift = (num(p, 'columnShift', 0) / 100) * cellH;
    const mirror = str(p, 'mirror', 'none');
    const rotation = num(p, 'rotation', 0);
    const rotationStep = num(p, 'rotationStep', 0);
    const rotationJitter = num(p, 'rotationJitter', 0);
    const scaleJitter = num(p, 'scaleJitter', 0) / 100;
    const rand = seededRandom(Math.round(num(p, 'seed', 1)));
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;

    const gridW = (columns - 1) * cellW;
    const gridH = (rows - 1) * cellH;
    const angle = num(p, 'angle', 0);
    const gridRot: Matrix = angle ? rotate(angle, cx + gridW / 2, cy + gridH / 2) : IDENTITY;

    const motifPoints = doc.layers.reduce(
      (n, l) =>
        n +
        l.strokes.reduce((m, s) => m + s.points.length, 0) +
        l.fills.reduce((m, f) => m + f.outer.reduce((k, r) => k + r.length, 0), 0),
      0,
    );
    const maxTiles = Math.max(1, Math.floor(MAX_TILE_POINTS / Math.max(1, motifPoints)));

    const layers: Layer[] = doc.layers.map((l) => ({ ...l, strokes: [], fills: [] }));
    let placed = 0;
    outer: for (let r = 0; r < rows; r++)
      for (let c = 0; c < columns; c++) {
        if (placed >= maxTiles) break outer;
        const i = r * columns + c;
        // Draw the random numbers for every tile in a fixed order, so changing one setting
        // doesn't reshuffle the others.
        const jr = (rand() * 2 - 1) * rotationJitter;
        const js = 1 + (rand() * 2 - 1) * scaleJitter;
        const fx = (mirror === 'columns' || mirror === 'both') && c % 2 === 1 ? -1 : 1;
        const fy = (mirror === 'rows' || mirror === 'both') && r % 2 === 1 ? -1 : 1;
        const tx = c * cellW + (r % 2 === 1 ? rowShift : 0);
        const ty = r * cellH + (c % 2 === 1 ? columnShift : 0);
        let m: Matrix = translate(-cx, -cy);
        m = multiply(scaleMatrix(fx * js, fy * js), m);
        m = multiply(rotate(rotation + i * rotationStep + jr), m);
        // The first tile stays where the artwork is.
        m = multiply(translate(cx + tx, cy + ty), m);
        m = multiply(gridRot, m);
        doc.layers.forEach((l, li) => {
          const out = layers[li]!;
          for (const s of l.strokes) out.strokes.push(transformPolyline(s, m));
          for (const f of l.fills) out.fills.push(transformFill(f, m));
        });
        placed++;
      }

    const warnings = [...doc.warnings];
    if (placed < rows * columns)
      warnings.push(
        `Tile stopped at ${placed} of ${rows * columns} tiles to keep the app responsive.`,
      );
    const result: PlotDocument = { ...doc, layers, warnings };
    const b = documentBounds(result);
    return { ...result, width: b.maxX - b.minX, height: b.maxY - b.minY };
  },
};
