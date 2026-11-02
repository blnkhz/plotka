import type { Polyline } from '../model';
import type { Toolpath } from '../pipeline/toolpath';

/** Name and display color of each layer, for labelling the export. */
export type ExportLayerInfo = { name: string; color: string };

const r = (n: number) => String(Math.round(n * 1000) / 1000 + 0);
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeColor = (c: string) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : '#000000');

function pathData(p: Polyline): string {
  const [h, ...rest] = p.points;
  if (!h) return '';
  // A dot (both points equal) stays a zero-length line; round caps make it visible.
  const tail = rest.length
    ? rest.map((q) => `L${r(q.x)} ${r(q.y)}`).join('')
    : `L${r(h.x)} ${r(h.y)}`;
  return `M${r(h.x)} ${r(h.y)}${tail}${p.closed ? 'Z' : ''}`;
}

/**
 * PREVIEW-6: what will be plotted, as an SVG in mm on the paper: one Inkscape-style layer group
 * per toolpath layer (in plot order), strokes in the layer's display color, no fills.
 */
export function toolpathToSvg(
  tp: Toolpath,
  paper: { width: number; height: number },
  info: (layerId: string) => ExportLayerInfo,
  penWidth = 0.4,
): string {
  const groups = tp.layers.map((l) => {
    const { name, color } = info(l.layerId);
    const d = l.paths.map(pathData).filter(Boolean);
    return [
      `  <g id="${esc(l.layerId)}" inkscape:groupmode="layer" inkscape:label="${esc(name)}" fill="none" stroke="${safeColor(color)}" stroke-width="${r(penWidth)}" stroke-linecap="round" stroke-linejoin="round">`,
      ...d.map((x) => `    <path d="${x}"/>`),
      '  </g>',
    ].join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- Exported from Plotter Studio: the processed paths, as they will be plotted. -->',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${r(paper.width)}mm" height="${r(paper.height)}mm" viewBox="0 0 ${r(paper.width)} ${r(paper.height)}">`,
    ...groups,
    '</svg>',
    '',
  ].join('\n');
}

export const TOOLPATH_FORMAT = 'plotter-studio-toolpath';

/**
 * PREVIEW-6: the planned toolpath as JSON. Coordinates in mm from the paper's top-left corner
 * (y down), rounded to 0.001 mm; layers and paths in plot order; `closed` paths return to their
 * first point.
 */
export function toolpathToJson(
  tp: Toolpath,
  paper: { width: number; height: number },
  info: (layerId: string) => ExportLayerInfo,
): string {
  const round = (n: number) => Math.round(n * 1000) / 1000 + 0;
  return JSON.stringify(
    {
      format: TOOLPATH_FORMAT,
      version: 1,
      units: 'mm',
      paper: { width: round(paper.width), height: round(paper.height) },
      layers: tp.layers.map((l) => ({
        id: l.layerId,
        ...info(l.layerId),
        paths: l.paths.map((p) => ({
          closed: p.closed,
          points: p.points.map((q) => [round(q.x), round(q.y)]),
        })),
      })),
    },
    null,
    1,
  );
}
