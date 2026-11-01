import { IDENTITY, multiply, scaleMatrix, translate, type Matrix } from '../geometry/matrix';
import {
  createLayer,
  type FillRegion,
  type Layer,
  type PlotDocument,
  type Polyline,
} from '../model';
import { ImportError, type ImportOptions } from '../importers/types';
import { matchRules, parseDeclarations, parseStylesheet, type CssRule } from './css';
import { normalizeColor } from './color';
import { ellipseToPath, pathToPolylines, pointsToPath, rectToPath } from './path';
import { parseTransform } from './transform';
import { lengthToMm, num } from './units';
import { isElement, parseXml, textContent, XmlParseError, type XmlElement } from './xml';

/** Inherited style state while walking the tree. */
type Style = {
  fill: string;
  stroke: string;
  fillRule: 'nonzero' | 'evenodd';
  visibility: string;
  color: string;
};

const ROOT_STYLE: Style = {
  fill: 'black',
  stroke: 'none',
  fillRule: 'nonzero',
  visibility: 'visible',
  color: 'black',
};

const SKIP = new Set([
  'defs',
  'symbol',
  'clipPath',
  'mask',
  'marker',
  'pattern',
  'metadata',
  'title',
  'desc',
  'style',
  'script',
  'linearGradient',
  'radialGradient',
  'filter',
  'sodipodi:namedview',
  'foreignObject',
]);

const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);

const MAX_USE_DEPTH = 32;

type Item = { strokes: Polyline[]; fill: FillRegion | null; colorKey: string };

type Bucket = { key: string; name: string; items: Item[] };

export const TEXT_WARNING = "Text isn't supported, convert to paths first";

export function importSvg(source: string, opts: ImportOptions = {}): PlotDocument {
  let root: XmlElement;
  let comments: string[];
  try {
    ({ root, comments } = parseXml(source));
  } catch (e) {
    throw new ImportError(
      `Couldn't read SVG: ${e instanceof XmlParseError ? e.message : String(e)}`,
    );
  }
  if (localName(root.name) !== 'svg') throw new ImportError('Not an SVG file');

  const warnings = new Set<string>();
  const tolerance = opts.tolerance ?? 0.05;
  const isIllustrator = comments.some((c) => /Adobe Illustrator/i.test(c));
  const pxPerInch = opts.pxPerInch ?? (isIllustrator ? 72 : 96);

  // Index ids and collect stylesheets.
  const byId = new Map<string, XmlElement>();
  const rules: CssRule[] = [];
  const index = (el: XmlElement) => {
    const id = el.attrs['id'];
    if (id && !byId.has(id)) byId.set(id, el);
    if (localName(el.name) === 'style')
      rules.push(...parseStylesheet(textContent(el), rules.length));
    for (const c of el.children) if (isElement(c)) index(c);
  };
  index(root);

  const viewport = rootViewport(root, pxPerInch, warnings);

  const buckets = new Map<string, Bucket>();
  const order: string[] = [];
  const bucket = (key: string, name: string): Bucket => {
    let b = buckets.get(key);
    if (!b) {
      b = { key, name, items: [] };
      buckets.set(key, b);
      order.push(key);
    }
    return b;
  };
  let hasSourceLayers = false;
  const UNLAYERED = '\u0000unlayered';

  const walk = (
    el: XmlElement,
    ctm: Matrix,
    parentStyle: Style,
    layerKey: string | null,
    useDepth: number,
  ): void => {
    const name = localName(el.name);
    const decls = computeDecls(el, rules);
    if (decls['display'] === 'none') return;
    if (SKIP.has(el.name) || SKIP.has(name)) return;

    const style = inheritStyle(parentStyle, decls);
    const m = multiply(ctm, parseTransform(el.attrs['transform']));

    if (decls['clip-path'] && decls['clip-path'] !== 'none')
      warnings.add("Clipping paths aren't applied yet; clipped content is drawn in full");
    if (decls['mask'] && decls['mask'] !== 'none')
      warnings.add("Masks aren't supported and are ignored");

    switch (name) {
      case 'text':
        if (style.visibility === 'visible') warnings.add(TEXT_WARNING);
        return;
      case 'image':
        warnings.add('Images are ignored');
        return;
      case 'g':
      case 'a':
      case 'switch': {
        let key = layerKey;
        if (name === 'g' && el.attrs['inkscape:groupmode'] === 'layer' && layerKey === null) {
          hasSourceLayers = true;
          const id = el.attrs['id'] ?? `layer${order.length + 1}`;
          key = `ink:${id}`;
          bucket(key, el.attrs['inkscape:label'] ?? id);
        }
        for (const c of el.children) if (isElement(c)) walk(c, m, style, key, useDepth);
        return;
      }
      case 'svg': {
        // Nested viewport.
        const nm = multiply(m, nestedViewport(el));
        for (const c of el.children) if (isElement(c)) walk(c, nm, style, layerKey, useDepth);
        return;
      }
      case 'use': {
        if (useDepth >= MAX_USE_DEPTH) {
          warnings.add('Some <use> references are nested too deeply and were skipped');
          return;
        }
        const href = el.attrs['href'] ?? el.attrs['xlink:href'] ?? '';
        const target = href.startsWith('#') ? byId.get(href.slice(1)) : undefined;
        if (!target) {
          warnings.add(`Couldn't resolve <use> reference ${href || '(empty)'}`);
          return;
        }
        let um = multiply(m, translate(num(el.attrs['x']), num(el.attrs['y'])));
        if (localName(target.name) === 'symbol') {
          um = multiply(um, symbolViewport(target, el));
          const tDecls = computeDecls(target, rules);
          const tStyle = inheritStyle(style, tDecls);
          for (const c of target.children)
            if (isElement(c)) walk(c, um, tStyle, layerKey, useDepth + 1);
        } else {
          walk(target, um, style, layerKey, useDepth + 1);
        }
        return;
      }
    }

    if (!SHAPES.has(name)) return;
    if (style.visibility !== 'visible') return;

    const d = shapeToPath(name, el);
    if (!d) return;
    const lines = pathToPolylines(d, m, tolerance);
    if (lines.length === 0) return;

    const fillColor = name === 'line' ? null : resolvePaint(style.fill, style.color);
    const strokeColor = resolvePaint(style.stroke, style.color);
    if (fillColor === null && strokeColor === null) return;

    const item: Item = { strokes: [], fill: null, colorKey: strokeColor ?? fillColor ?? '#000000' };
    if (strokeColor !== null) item.strokes = lines;
    if (fillColor !== null) {
      const rings = lines.map((l) => l.points).filter((r) => r.length >= 3);
      if (rings.length) item.fill = { outer: rings, fillRule: style.fillRule, color: fillColor };
    }
    if (item.strokes.length === 0 && item.fill === null) return;

    const mode = opts.layerMode ?? 'auto';
    if (layerKey !== null) bucket(layerKey, '').items.push(item);
    else if (mode === 'byColor') bucket(`color:${item.colorKey}`, item.colorKey).items.push(item);
    else bucket(UNLAYERED, hasSourceLayers ? 'Other' : 'Layer 1').items.push(item);
  };

  for (const c of root.children)
    if (isElement(c))
      walk(c, viewport.matrix, inheritStyle(ROOT_STYLE, computeDecls(root, rules)), null, 0);

  // If the file has Inkscape layers but the user asked for single/byColor, regroup.
  let finalBuckets = order.map((k) => buckets.get(k)!);
  const mode = opts.layerMode ?? 'auto';
  if (hasSourceLayers && mode !== 'auto') {
    const all = finalBuckets.flatMap((b) => b.items);
    if (mode === 'single') finalBuckets = [{ key: 'single', name: 'Layer 1', items: all }];
    else {
      const map = new Map<string, Bucket>();
      for (const it of all) {
        const b = map.get(it.colorKey) ?? { key: it.colorKey, name: it.colorKey, items: [] };
        b.items.push(it);
        map.set(it.colorKey, b);
      }
      finalBuckets = [...map.values()];
    }
  } else if (hasSourceLayers) {
    const unlayered = buckets.get(UNLAYERED);
    if (unlayered) unlayered.name = 'Other';
    // Unlayered content goes last.
    finalBuckets.sort((a, b) => Number(a.key === UNLAYERED) - Number(b.key === UNLAYERED));
  }

  const layers: Layer[] = finalBuckets
    .filter((b) => b.items.length > 0)
    .map((b, i) => {
      const layer = createLayer(
        `layer-${i + 1}`,
        b.name || `Layer ${i + 1}`,
        dominantColor(b.items),
      );
      for (const it of b.items) {
        layer.strokes.push(...it.strokes);
        if (it.fill) layer.fills.push(it.fill);
      }
      return layer;
    });

  return {
    width: viewport.width,
    height: viewport.height,
    layers,
    warnings: [...warnings],
    source: {
      importer: 'svg',
      hasLayers: hasSourceLayers,
      generator: isIllustrator ? 'illustrator' : detectGenerator(root, comments),
    },
  };
}

function localName(name: string): string {
  // Strip a default "svg:" prefix some exporters use; keep other prefixes (inkscape:, sodipodi:).
  return name.startsWith('svg:') ? name.slice(4) : name;
}

const STYLE_PROPS = [
  'fill',
  'stroke',
  'fill-rule',
  'visibility',
  'display',
  'color',
  'clip-path',
  'mask',
];

/** Presentation attributes < stylesheet rules < inline style. */
function computeDecls(el: XmlElement, rules: CssRule[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of STYLE_PROPS) {
    const v = el.attrs[p];
    if (v !== undefined) out[p] = v.trim();
  }
  if (rules.length) {
    const classes = (el.attrs['class'] ?? '').split(/\s+/).filter(Boolean);
    Object.assign(out, matchRules(rules, localName(el.name), el.attrs['id'], classes));
  }
  if (el.attrs['style']) Object.assign(out, parseDeclarations(el.attrs['style']));
  return out;
}

function inheritStyle(parent: Style, d: Record<string, string>): Style {
  const pick = (key: string, inherited: string) => {
    const v = d[key];
    return v === undefined || v === 'inherit' ? inherited : v;
  };
  const fr = pick('fill-rule', parent.fillRule);
  return {
    fill: pick('fill', parent.fill),
    stroke: pick('stroke', parent.stroke),
    fillRule: fr === 'evenodd' ? 'evenodd' : 'nonzero',
    visibility: pick('visibility', parent.visibility),
    color: pick('color', parent.color),
  };
}

/** Returns a normalized color, or null if the paint is none. Gradients/patterns map to gray. */
function resolvePaint(paint: string, currentColor: string): string | null {
  const p = paint.trim();
  if (p.toLowerCase() === 'currentcolor') return normalizeColor(currentColor);
  if (p.startsWith('url(')) {
    // url(#grad) optionally followed by a fallback color.
    const fallback = p.replace(/^url\([^)]*\)\s*/, '');
    return fallback ? normalizeColor(fallback) : '#808080';
  }
  return normalizeColor(p);
}

function shapeToPath(name: string, el: XmlElement): string {
  const a = el.attrs;
  switch (name) {
    case 'path':
      return a['d'] ?? '';
    case 'rect': {
      const w = num(a['width']);
      const h = num(a['height']);
      // rx/ry: if only one is given, the other uses the same value.
      const rxA = a['rx'] !== undefined && a['rx'] !== 'auto' ? num(a['rx']) : undefined;
      const ryA = a['ry'] !== undefined && a['ry'] !== 'auto' ? num(a['ry']) : undefined;
      const rx = rxA ?? ryA ?? 0;
      const ry = ryA ?? rxA ?? 0;
      return rectToPath(num(a['x']), num(a['y']), w, h, rx, ry);
    }
    case 'circle': {
      const r = num(a['r']);
      return ellipseToPath(num(a['cx']), num(a['cy']), r, r);
    }
    case 'ellipse':
      return ellipseToPath(num(a['cx']), num(a['cy']), num(a['rx']), num(a['ry']));
    case 'line':
      return `M${num(a['x1'])} ${num(a['y1'])}L${num(a['x2'])} ${num(a['y2'])}`;
    case 'polyline':
      return pointsToPath(a['points'] ?? '', false);
    case 'polygon':
      return pointsToPath(a['points'] ?? '', true);
  }
  return '';
}

type ViewBox = { x: number; y: number; w: number; h: number };

function parseViewBox(v: string | undefined): ViewBox | null {
  if (!v) return null;
  const n = v
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (n.length !== 4 || n.some((x) => !Number.isFinite(x))) return null;
  const [x, y, w, h] = n as [number, number, number, number];
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

/** Maps a viewBox into a viewport of size (vw, vh) per preserveAspectRatio. */
function viewBoxTransform(vb: ViewBox, vw: number, vh: number, par: string | undefined): Matrix {
  const [alignRaw, meetOrSlice] = (par ?? 'xMidYMid meet').trim().split(/\s+/);
  const align = alignRaw ?? 'xMidYMid';
  const sx = vw / vb.w;
  const sy = vh / vb.h;
  if (align === 'none') {
    return multiply(scaleMatrix(sx, sy), translate(-vb.x, -vb.y));
  }
  const s = meetOrSlice === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
  const ax = align.includes('xMid') ? 0.5 : align.includes('xMax') ? 1 : 0;
  const ay = align.includes('YMid') ? 0.5 : align.includes('YMax') ? 1 : 0;
  const tx = (vw - vb.w * s) * ax;
  const ty = (vh - vb.h * s) * ay;
  return multiply(translate(tx, ty), multiply(scaleMatrix(s), translate(-vb.x, -vb.y)));
}

/** Root viewport: maps user units to mm and returns the document size in mm. */
function rootViewport(
  root: XmlElement,
  pxPerInch: number,
  warnings: Set<string>,
): { matrix: Matrix; width: number; height: number } {
  const vb = parseViewBox(root.attrs['viewBox']);
  const pxToMm = 25.4 / pxPerInch;
  let wMm = lengthToMm(root.attrs['width'], pxPerInch);
  let hMm = lengthToMm(root.attrs['height'], pxPerInch);

  if (vb) {
    if (wMm === null && hMm === null) {
      wMm = vb.w * pxToMm;
      hMm = vb.h * pxToMm;
      if (root.attrs['width'] || root.attrs['height'])
        warnings.add(`The file has no absolute size; assumed ${pxPerInch} px per inch`);
    } else if (wMm === null) wMm = (hMm! * vb.w) / vb.h;
    else if (hMm === null) hMm = (wMm * vb.h) / vb.w;
    return {
      matrix: viewBoxTransform(vb, wMm!, hMm!, root.attrs['preserveAspectRatio']),
      width: wMm!,
      height: hMm!,
    };
  }
  if (wMm === null || hMm === null) {
    warnings.add(`The file has no size or viewBox; assumed ${pxPerInch} px per inch`);
  }
  return { matrix: scaleMatrix(pxToMm), width: wMm ?? 0, height: hMm ?? 0 };
}

function nestedViewport(el: XmlElement): Matrix {
  const x = num(el.attrs['x']);
  const y = num(el.attrs['y']);
  const vb = parseViewBox(el.attrs['viewBox']);
  const w = el.attrs['width'] !== undefined ? num(el.attrs['width']) : null;
  const h = el.attrs['height'] !== undefined ? num(el.attrs['height']) : null;
  let m = translate(x, y);
  if (vb && w !== null && h !== null)
    m = multiply(m, viewBoxTransform(vb, w, h, el.attrs['preserveAspectRatio']));
  return m;
}

function symbolViewport(symbol: XmlElement, use: XmlElement): Matrix {
  const vb = parseViewBox(symbol.attrs['viewBox']);
  if (!vb) return IDENTITY;
  const w = use.attrs['width'] ?? symbol.attrs['width'];
  const h = use.attrs['height'] ?? symbol.attrs['height'];
  const vw = w !== undefined ? num(w, vb.w) : vb.w;
  const vh = h !== undefined ? num(h, vb.h) : vb.h;
  return viewBoxTransform(vb, vw, vh, symbol.attrs['preserveAspectRatio']);
}

function dominantColor(items: Item[]): string {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.colorKey, (counts.get(it.colorKey) ?? 0) + 1);
  let best = '#000000';
  let bestN = 0;
  for (const [c, n] of counts) if (n > bestN && c.startsWith('#')) [best, bestN] = [c, n];
  return best;
}

function detectGenerator(root: XmlElement, comments: string[]): string | undefined {
  if (root.attrs['xmlns:inkscape'] || root.attrs['inkscape:version']) return 'inkscape';
  if (root.attrs['xmlns:serif'] || comments.some((c) => /Affinity/i.test(c))) return 'affinity';
  if (comments.some((c) => /Figma/i.test(c))) return 'figma';
  return undefined;
}
