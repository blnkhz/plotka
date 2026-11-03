import { describe, expect, it } from 'vitest';
import { importFile, layoutText, svgImporter, supportedExtensions, TEXT_WARNING } from '../../src';
import { roundDoc } from '../helpers';
import illustrator from '../fixtures/svg/illustrator.svg?raw';
import inkscape from '../fixtures/svg/inkscape.svg?raw';
import figma from '../fixtures/svg/figma.svg?raw';
import affinity from '../fixtures/svg/affinity.svg?raw';

const bytes = (s: string) =>
  new Uint8Array([...unescape(encodeURIComponent(s))].map((c) => c.charCodeAt(0)));
const load = (s: string, name: string) => importFile(bytes(s), name);

describe('importer registry (IMPORT-6)', () => {
  it('registers SVG', () => {
    expect(supportedExtensions()).toContain('.svg');
    expect(svgImporter.canImport(bytes('<svg></svg>'), 'drawing.txt')).toBe(true);
  });
  it('rejects unknown files', async () => {
    await expect(importFile(bytes('hello'), 'notes.txt')).rejects.toThrow(/No importer/);
  });
});

describe('fixtures (IMPORT-1)', () => {
  it('Illustrator: px are points, classes from CDATA style, text in a single-stroke font', async () => {
    const doc = await load(illustrator, 'illustrator.svg');
    expect(doc.source?.generator).toBe('illustrator');
    // A4 artboard: 595.28 x 841.89 pt
    expect(doc.width).toBeCloseTo(210, 1);
    expect(doc.height).toBeCloseTo(297, 1);
    expect(doc.warnings).toContain(TEXT_WARNING);
    const layer = doc.layers[0]!;
    expect(layer.fills).toHaveLength(1); // the red circle
    expect(layer.fills[0]!.color).toBe('#e52421');
    // Rect, wave, triangle, and "Title" in single-stroke sans (LATER-6).
    const title = layoutText('Title', { font: 'sans', size: 1 }).lines.length;
    expect(layer.strokes).toHaveLength(3 + title);
    expect(roundDoc(doc)).toMatchSnapshot();
  });

  it('Inkscape: mm units, layers, hidden layer skipped, evenodd hole', async () => {
    const doc = await load(inkscape, 'inkscape.svg');
    expect(doc.source?.generator).toBe('inkscape');
    expect(doc.width).toBe(210);
    expect(doc.height).toBe(297);
    expect(doc.layers.map((l) => l.name)).toEqual(['Outlines', 'Fills']);
    const fills = doc.layers[1]!;
    expect(fills.fills.map((f) => f.fillRule)).toEqual(['evenodd', 'nonzero']);
    expect(fills.fills[0]!.outer).toHaveLength(2);
    expect(roundDoc(doc)).toMatchSnapshot();
  });

  it('Figma: px size at 96 dpi, clip-path warning, white background is a knockout', async () => {
    const doc = await load(figma, 'figma.svg');
    expect(doc.width).toBeCloseTo((400 / 96) * 25.4, 6);
    expect(doc.warnings.some((w) => /Clipping/.test(w))).toBe(true);
    const layer = doc.layers[0]!;
    // white background rect is a knockout (not drawn); the evenodd square is the real fill
    expect(layer.fills.map((f) => [f.color, !!f.knockout])).toEqual([
      ['#ffffff', true],
      ['#1e1e1e', false],
    ]);
    // circle, line, curve
    expect(layer.strokes).toHaveLength(3);
    expect(roundDoc(doc)).toMatchSnapshot();
  });

  it('Affinity: 100% size, nested matrices, <use> of an ellipse, hidden group', async () => {
    const doc = await load(affinity, 'affinity.svg');
    expect(doc.source?.generator).toBe('affinity');
    expect(doc.warnings.some((w) => /no absolute size/.test(w))).toBe(true);
    const layer = doc.layers[0]!;
    expect(layer.strokes).toHaveLength(1); // triangle (diagonal is hidden)
    expect(layer.fills).toHaveLength(1); // the used ellipse
    expect(layer.fills[0]!.color).toBe('#0080ff');
    expect(roundDoc(doc)).toMatchSnapshot();
  });
});
