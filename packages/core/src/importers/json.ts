import { createLayer, type Layer, type PlotDocument, type Polyline } from '../model';
import { decodeUtf8 } from '../svg/utf8';
import { ImportError, type Importer, type ImportOptions } from './types';

/**
 * IMPORT-7: plain JSON paths, for art made by code. Accepted shapes (see docs/guide):
 *
 *   { "units": "mm", "width": 200, "height": 150,
 *     "layers": [ { "name": "Ink", "color": "#1d3557",
 *                   "paths": [ [[0,0],[10,0]], { "points": [[0,0],[5,5],[0,10]], "closed": true } ] } ] }
 *   { "units": "in", "paths": [ ... ] }      one layer
 *   [ [[0,0],[10,0]], ... ]                   one layer, millimetres
 *
 * Points are [x, y] (or {x, y}), y pointing down. Plotka's own exported toolpath JSON
 * imports too.
 */

/** Millimetres per unit. px are CSS pixels (96 per inch). */
const UNITS: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, px: 25.4 / 96 };

/** Refuse absurdly large inputs before they hang the app. */
const MAX_POINTS = 5_000_000;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function importJsonPaths(text: string, opts: ImportOptions = {}): PlotDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError("This JSON file couldn't be read (it isn't valid JSON).");
  }
  const root: Obj = Array.isArray(raw) ? { paths: raw } : isObj(raw) ? raw : {};
  const unit = typeof root['units'] === 'string' ? root['units'].toLowerCase() : 'mm';
  const k = UNITS[unit];
  if (k === undefined)
    throw new ImportError(`Unknown units "${unit}". Use one of: ${Object.keys(UNITS).join(', ')}.`);

  let pointCount = 0;
  const point = (v: unknown, where: string) => {
    const [x, y] = Array.isArray(v) ? v : isObj(v) ? [v['x'], v['y']] : [];
    if (!isNum(x) || !isNum(y)) throw new ImportError(`${where}: a point must be [x, y] numbers.`);
    if (++pointCount > MAX_POINTS)
      throw new ImportError(`Too many points (over ${MAX_POINTS.toLocaleString('en')}).`);
    return { x: x * k, y: y * k };
  };
  const path = (v: unknown, where: string): Polyline | null => {
    const pts = Array.isArray(v) ? v : isObj(v) ? v['points'] : undefined;
    if (!Array.isArray(pts)) throw new ImportError(`${where}: a path must be a list of points.`);
    const points = pts.map((p, i) => point(p, `${where}, point ${i + 1}`));
    if (points.length === 0) return null;
    // A single point is a dot: a pen tap.
    if (points.length === 1) points.push({ ...points[0]! });
    return { points, closed: isObj(v) && v['closed'] === true && points.length > 2 };
  };

  const layerDefs: Obj[] = Array.isArray(root['layers'])
    ? root['layers'].filter(isObj)
    : [{ paths: root['paths'] }];
  if (layerDefs.length === 0) throw new ImportError('This JSON file has no layers or paths.');

  const layers: Layer[] = layerDefs.map((def, li) => {
    const name = typeof def['name'] === 'string' && def['name'] ? def['name'] : `Layer ${li + 1}`;
    const color =
      typeof def['color'] === 'string' && /^#[0-9a-f]{6}$/i.test(def['color'])
        ? def['color']
        : '#000000';
    const layer = createLayer(`layer-${li + 1}`, name, color);
    const paths = def['paths'];
    if (!Array.isArray(paths)) throw new ImportError(`${name}: "paths" must be a list of paths.`);
    paths.forEach((p, pi) => {
      const pl = path(p, `${name}, path ${pi + 1}`);
      if (pl) layer.strokes.push(pl);
    });
    return layer;
  });
  if (pointCount === 0) throw new ImportError('This JSON file has no points to draw.');
  const grouped = regroup(layers, opts.layerMode ?? 'auto');

  // Size: as given (plus the paper of an exported toolpath), else the drawing's extent.
  const paper = isObj(root['paper']) ? root['paper'] : root;
  let width = isNum(paper['width']) ? paper['width'] * k : 0;
  let height = isNum(paper['height']) ? paper['height'] * k : 0;
  if (!(width > 0 && height > 0)) {
    let maxX = 0;
    let maxY = 0;
    for (const l of layers)
      for (const s of l.strokes)
        for (const p of s.points) {
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
    width = maxX;
    height = maxY;
  }
  return {
    width,
    height,
    layers: grouped,
    warnings: [],
    source: { importer: 'json', hasLayers: Array.isArray(root['layers']) && layers.length > 1 },
  };
}

/** The Layers panel's modes: the file's layers, one layer, or one layer per color. */
function regroup(layers: Layer[], mode: NonNullable<ImportOptions['layerMode']>): Layer[] {
  if (mode === 'auto' || layers.length < 2) return layers;
  const groups = new Map<string, Layer>();
  for (const l of layers) {
    const key = mode === 'single' ? 'all' : l.color;
    let g = groups.get(key);
    if (!g) {
      const name = mode === 'single' ? 'Layer 1' : l.color;
      g = createLayer(`layer-${groups.size + 1}`, name, l.color);
      groups.set(key, g);
    }
    for (const s of l.strokes) g.strokes.push(s);
  }
  return [...groups.values()];
}

export const jsonImporter: Importer = {
  id: 'json',
  label: 'JSON paths',
  extensions: ['.json'],
  canImport(bytes, filename) {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.plot.json')) return false; // projects are opened by the app itself
    if (lower.endsWith('.json')) return true;
    const head = decodeUtf8(bytes.subarray(0, 64)).trimStart();
    return head.startsWith('{') || head.startsWith('[');
  },
  async import(bytes, _filename, opts) {
    return importJsonPaths(decodeUtf8(bytes), opts);
  },
};
