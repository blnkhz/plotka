import {
  documentBounds,
  emptyBounds,
  extendBounds,
  isEmptyBounds,
  polylinesBounds,
} from '../geometry/bounds';
import { clipPolylines, clipRing } from '../geometry/clip';
import {
  applyToPoint,
  IDENTITY,
  multiply,
  rotate,
  scaleMatrix,
  translate,
  type Matrix,
} from '../geometry/matrix';
import { transformDocument, transformLayer } from '../geometry/transform-doc';
import type { Bounds, Layer, LayerPlacement, PlotDocument } from '../model';
import { marginBox, paperSize, type Alignment, type PageSetup, type Rect } from '../page/paper';

const ANCHORS: Record<Exclude<Alignment, 'file'>, [number, number]> = {
  'top-left': [0, 0],
  top: [0.5, 0],
  'top-right': [1, 0],
  left: [0, 0.5],
  center: [0.5, 0.5],
  right: [1, 0.5],
  'bottom-left': [0, 1],
  bottom: [0.5, 1],
  'bottom-right': [1, 1],
};

/**
 * The matrix that places the artwork on the paper (paper coordinates, mm, origin top left).
 * Order: rotate around the artwork center, scale (fit mode x manual %), align, offset.
 */
export function fitMatrix(doc: PlotDocument, page: PageSetup): Matrix {
  const box = marginBox(page);
  const bounds = doc.frame ?? documentBounds(doc);
  const empty = isEmptyBounds(bounds);

  if (page.align === 'file') {
    // Keep the file's own layout: the artboard's top-left sits at the paper's top-left.
    const s = page.scale / 100;
    let m: Matrix = scaleMatrix(s);
    if (page.rotation) {
      const c = { x: (doc.width * s) / 2, y: (doc.height * s) / 2 };
      m = multiply(rotate(page.rotation, c.x, c.y), m);
    }
    return multiply(translate(page.offsetX, page.offsetY), m);
  }
  if (empty) return translate(page.offsetX, page.offsetY);

  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const rot = page.rotation ? rotate(page.rotation, cx, cy) : IDENTITY;
  const rb = rotatedBounds(bounds, rot);
  const w = rb.maxX - rb.minX;
  const h = rb.maxY - rb.minY;

  let s = 1;
  if (page.fit !== 'original' && w > 0 && h > 0) {
    const sx = box.width / w;
    const sy = box.height / h;
    s = page.fit === 'fit' ? Math.min(sx, sy) : Math.max(sx, sy);
  } else if (page.fit !== 'original') {
    // Degenerate (a single horizontal or vertical line): scale the one dimension we have.
    s = w > 0 ? box.width / w : h > 0 ? box.height / h : 1;
  }
  s *= page.scale / 100;

  const [ax, ay] = ANCHORS[page.align];
  const tx = box.x + (box.width - w * s) * ax - rb.minX * s + page.offsetX;
  const ty = box.y + (box.height - h * s) * ay - rb.minY * s + page.offsetY;
  return multiply(translate(tx, ty), multiply(scaleMatrix(s), rot));
}

function rotatedBounds(b: Bounds, m: Matrix): Bounds {
  const corners = [
    [b.minX, b.minY],
    [b.maxX, b.minY],
    [b.maxX, b.maxY],
    [b.minX, b.maxY],
  ] as const;
  const out: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const [x, y] of corners) {
    const px = m[0] * x + m[2] * y + m[4];
    const py = m[1] * x + m[3] * y + m[5];
    out.minX = Math.min(out.minX, px);
    out.maxX = Math.max(out.maxX, px);
    out.minY = Math.min(out.minY, py);
    out.maxY = Math.max(out.maxY, py);
  }
  return out;
}

/** The bounds of a layer's strokes and fill outlines (white knockouts don't count). */
export function layerBounds(layer: Layer): Bounds {
  const b = polylinesBounds(layer.strokes);
  for (const f of layer.fills)
    if (!f.knockout) for (const r of f.outer) for (const p of r) extendBounds(b, p);
  return b;
}

const isIdentity = (p: LayerPlacement | null | undefined): p is null | undefined =>
  !p || (p.dx === 0 && p.dy === 0 && p.sx === 1 && p.sy === 1);

/** The matrix of a layer placement, for a layer whose bounds (before it) are `b`. */
export function placementMatrix(b: Bounds, p: LayerPlacement): Matrix {
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return multiply(
    translate(cx + p.dx, cy + p.dy),
    multiply(scaleMatrix(p.sx, p.sy), translate(-cx, -cy)),
  );
}

export type PagePlacement = {
  /** On the paper, with each layer's own placement applied (and the 'fill' crop). */
  doc: PlotDocument;
  /** Artwork → paper. */
  matrix: Matrix;
  /** Each layer's bounds on the paper before its own placement. */
  layerBounds: Record<string, Bounds>;
  /** The box the page setup fits (the artwork's bounds, or its frame), on the paper. */
  artBounds: Bounds;
};

/**
 * Places the artwork on the paper, then each layer where the user moved it. In 'fill' mode the
 * overflow outside the margins is cropped after that.
 */
export function placeOnPage(doc: PlotDocument, page: PageSetup): PagePlacement {
  const matrix = fitMatrix(doc, page);
  const fitted = transformDocument(doc, matrix);
  const bounds: Record<string, Bounds> = {};
  const layers = fitted.layers.map((l) => {
    const b = layerBounds(l);
    bounds[l.id] = b;
    const p = l.settings.placement;
    return isIdentity(p) || isEmptyBounds(b) ? l : transformLayer(l, placementMatrix(b, p));
  });
  const box = doc.frame ?? documentBounds(doc);
  const corners = isEmptyBounds(box)
    ? []
    : [
        [box.minX, box.minY],
        [box.maxX, box.minY],
        [box.maxX, box.maxY],
        [box.minX, box.maxY],
      ];
  const artBounds = emptyBounds();
  for (const [x, y] of corners) extendBounds(artBounds, applyToPoint(matrix, x!, y!));
  const { width, height } = paperSize(page);
  const out: PlotDocument = { ...fitted, layers, width, height, frame: undefined };
  return {
    doc:
      page.fit === 'fill' && page.align !== 'file' ? clipDocument(out, marginBox(page)).doc : out,
    matrix,
    layerBounds: bounds,
    artBounds,
  };
}

/**
 * Fit-to-page pipeline step: places the artwork on the paper (see `placeOnPage`). The resulting
 * document's width/height are the paper size.
 */
export const fitToPage = (doc: PlotDocument, page: PageSetup): PlotDocument =>
  placeOnPage(doc, page).doc;

export type ClippedDocument = {
  doc: PlotDocument;
  /** Pieces removed by the clip, per layer id, for highlighting in the preview. */
  removed: Map<string, ReturnType<typeof clipPolylines>['outside']>;
};

/** Clips strokes and fill regions to a rectangle. */
export function clipDocument(doc: PlotDocument, rect: Rect): ClippedDocument {
  const removed: ClippedDocument['removed'] = new Map();
  const layers = doc.layers.map((layer) => {
    const { inside, outside } = clipPolylines(layer.strokes, rect);
    if (outside.length) removed.set(layer.id, outside);
    const fills = layer.fills
      .map((f) => ({
        ...f,
        outer: f.outer.map((r) => clipRing(r, rect)).filter((r) => r.length >= 3),
      }))
      .filter((f) => f.outer.length > 0);
    return { ...layer, strokes: inside, fills };
  });
  return { doc: { ...doc, layers }, removed };
}
