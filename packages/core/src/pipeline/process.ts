import { intersectRects } from '../geometry/clip';
import type { Vec2 } from '../geometry/vec2';
import type { PlotDocument, Polyline } from '../model';
import { optimizePaths, type OptimizeSettings } from '../optimize/order';
import { paperSize, type PageSetup, type Rect } from '../page/paper';
import { applyFills } from '../fills/apply';
import { clipDocument, fitToPage } from './fit';
import { applyPasses } from './passes';
import { applyTransforms, type PipelineStep } from '../transforms';
import { buildToolpath, type Toolpath } from './toolpath';

export type ProcessInput = {
  doc: PlotDocument;
  page: PageSetup;
  /** Machine travel in mm. The paper's top-left corner sits at the machine's home. */
  bed: { width: number; height: number };
  /** Path optimization. Omit to keep the file's order. */
  optimize?: OptimizeSettings;
  /** Transform steps (tile, ...), applied to the artwork before it's placed on the page. */
  transforms?: readonly PipelineStep[];
};

export type ProcessResult = {
  /** Artwork placed on the paper (before clipping), for the "original" overlay. */
  placed: PlotDocument;
  /** After fills and clipping to the printable area. */
  clipped: PlotDocument;
  /** Pieces cut off by the printable area, per layer id. */
  outside: Map<string, Polyline[]>;
  printable: Rect;
  /** What will be plotted, in order. */
  toolpath: Toolpath;
  /** The same paths in file order, before optimization (for before/after stats). */
  unoptimized: Toolpath;
  /** True when the paper is larger than the machine travel. Blocks plotting. */
  paperExceedsBed: boolean;
};

/**
 * Runs the page-level pipeline: transforms → fit to page → fills → passes → clip to printable area → toolpath →
 * optimize (per layer, layers stay in order, each starting where the previous one ended).
 */
export function processDocument({
  doc,
  page,
  bed,
  optimize,
  transforms,
}: ProcessInput): ProcessResult {
  const art = transforms?.length ? applyTransforms(doc, transforms) : doc;
  const placed = fitToPage(art, page);
  const paper = paperSize(page);
  const printable = intersectRects(
    { x: 0, y: 0, width: paper.width, height: paper.height },
    { x: 0, y: 0, width: bed.width, height: bed.height },
  );
  const { doc: clipped, removed } = clipDocument(applyPasses(applyFills(placed)), printable);
  const unoptimized = buildToolpath(clipped);
  const EPS = 1e-6;
  return {
    placed,
    clipped,
    outside: removed,
    printable,
    unoptimized,
    toolpath: optimize ? optimizeToolpath(unoptimized, optimize) : unoptimized,
    paperExceedsBed: paper.width > bed.width + EPS || paper.height > bed.height + EPS,
  };
}

export function optimizeToolpath(
  tp: Toolpath,
  settings: OptimizeSettings,
  home: Vec2 = { x: 0, y: 0 },
): Toolpath {
  let pos = home;
  return {
    layers: tp.layers.map((layer) => {
      const paths = optimizePaths(layer.paths, pos, settings);
      const last = paths[paths.length - 1];
      if (last) pos = last.closed ? last.points[0]! : last.points[last.points.length - 1]!;
      return { ...layer, paths };
    }),
  };
}
