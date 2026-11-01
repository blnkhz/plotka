import { intersectRects } from '../geometry/clip';
import type { PlotDocument, Polyline } from '../model';
import { paperSize, type PageSetup, type Rect } from '../page/paper';
import { clipDocument, fitToPage } from './fit';
import { buildToolpath, type Toolpath } from './toolpath';

export type ProcessInput = {
  doc: PlotDocument;
  page: PageSetup;
  /** Machine travel in mm. The paper's top-left corner sits at the machine's home. */
  bed: { width: number; height: number };
};

export type ProcessResult = {
  /** Artwork placed on the paper (before clipping), for the "original" overlay. */
  placed: PlotDocument;
  /** After clipping to the printable area. */
  clipped: PlotDocument;
  /** Pieces cut off by the printable area, per layer id. */
  outside: Map<string, Polyline[]>;
  printable: Rect;
  toolpath: Toolpath;
  /** True when the paper is larger than the machine travel. Blocks plotting. */
  paperExceedsBed: boolean;
};

/** Runs the page-level pipeline: fit to page, clip to printable area, collect toolpath. */
export function processDocument({ doc, page, bed }: ProcessInput): ProcessResult {
  const placed = fitToPage(doc, page);
  const paper = paperSize(page);
  const printable = intersectRects(
    { x: 0, y: 0, width: paper.width, height: paper.height },
    { x: 0, y: 0, width: bed.width, height: bed.height },
  );
  const { doc: clipped, removed } = clipDocument(placed, printable);
  const EPS = 1e-6;
  return {
    placed,
    clipped,
    outside: removed,
    printable,
    toolpath: buildToolpath(clipped),
    paperExceedsBed: paper.width > bed.width + EPS || paper.height > bed.height + EPS,
  };
}
