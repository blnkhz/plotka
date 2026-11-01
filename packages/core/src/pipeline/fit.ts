import { documentBounds, isEmptyBounds } from '../geometry/bounds';
import { clipPolylines, clipRing } from '../geometry/clip';
import {
  IDENTITY,
  multiply,
  rotate,
  scaleMatrix,
  translate,
  type Matrix,
} from '../geometry/matrix';
import { transformDocument } from '../geometry/transform-doc';
import type { Bounds, PlotDocument } from '../model';
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
  const bounds = documentBounds(doc);
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

/**
 * Fit-to-page pipeline step: places the artwork on the paper. The resulting document's
 * width/height are the paper size. In 'fill' mode the overflow outside the margins is cropped.
 */
export function fitToPage(doc: PlotDocument, page: PageSetup): PlotDocument {
  const placed = transformDocument(doc, fitMatrix(doc, page));
  const { width, height } = paperSize(page);
  const out: PlotDocument = { ...placed, width, height };
  return page.fit === 'fill' && page.align !== 'file'
    ? clipDocument(out, marginBox(page)).doc
    : out;
}

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
