import { describe, expect, it } from 'vitest';
import { importSvg, TEXT_WARNING } from '../../src';
import { bbox, roundLine } from '../helpers';

const svg = (body: string, attrs = 'width="100mm" height="100mm" viewBox="0 0 100 100"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

const firstStroke = (src: string) => roundLine(importSvg(src).layers[0]!.strokes[0]!);

describe('importSvg: size and units', () => {
  it('converts mm/cm/in/pt/px sizes to mm', () => {
    for (const [w, mm] of [
      ['100mm', 100],
      ['10cm', 100],
      ['2in', 50.8],
      ['144pt', 50.8],
      ['192px', 50.8],
      ['192', 50.8],
    ] as const) {
      const doc = importSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w}"/>`);
      expect(doc.width).toBeCloseTo(mm, 6);
    }
  });
  it('maps viewBox to the physical size', () => {
    const doc = importSvg(
      svg(
        '<path d="M0 0 L1000 1000" stroke="black"/>',
        'width="100mm" height="100mm" viewBox="0 0 1000 1000"',
      ),
    );
    expect(roundLine(doc.layers[0]!.strokes[0]!).points).toEqual([
      [0, 0],
      [100, 100],
    ]);
  });
  it('handles viewBox offset', () => {
    const s = svg(
      '<path d="M10 10 L20 20" stroke="black"/>',
      'width="10mm" height="10mm" viewBox="10 10 10 10"',
    );
    expect(firstStroke(s).points).toEqual([
      [0, 0],
      [10, 10],
    ]);
  });
  it('preserveAspectRatio meet centers, xMinYMin aligns, none stretches, slice fills', () => {
    const base = 'width="200mm" height="100mm" viewBox="0 0 100 100"';
    const d = '<path d="M0 0 L100 100" stroke="black"/>';
    expect(firstStroke(svg(d, base)).points).toEqual([
      [50, 0],
      [150, 100],
    ]);
    expect(firstStroke(svg(d, `${base} preserveAspectRatio="xMinYMin meet"`)).points).toEqual([
      [0, 0],
      [100, 100],
    ]);
    expect(firstStroke(svg(d, `${base} preserveAspectRatio="xMaxYMax"`)).points).toEqual([
      [100, 0],
      [200, 100],
    ]);
    expect(firstStroke(svg(d, `${base} preserveAspectRatio="none"`)).points).toEqual([
      [0, 0],
      [200, 100],
    ]);
    expect(firstStroke(svg(d, `${base} preserveAspectRatio="xMidYMid slice"`)).points).toEqual([
      [0, -50],
      [200, 150],
    ]);
  });
  it('viewBox only: user units are px at 96 dpi', () => {
    const doc = importSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 48"/>');
    expect(doc.width).toBeCloseTo(25.4);
    expect(doc.height).toBeCloseTo(12.7);
  });
  it('one dimension missing keeps viewBox aspect', () => {
    const doc = importSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" viewBox="0 0 200 100"/>',
    );
    expect(doc.height).toBeCloseTo(50);
  });
});

describe('importSvg: shapes', () => {
  it('rect', () => {
    const l = firstStroke(
      svg('<rect x="10" y="20" width="30" height="40" fill="none" stroke="black"/>'),
    );
    expect(l).toEqual({
      closed: true,
      points: [
        [10, 20],
        [40, 20],
        [40, 60],
        [10, 60],
      ],
    });
  });
  it('rounded rect: ry defaults to rx and is clamped to half the size', () => {
    const l = importSvg(svg('<rect width="20" height="10" rx="50" fill="none" stroke="black"/>'))
      .layers[0]!.strokes[0]!;
    expect(bbox(l.points)).toEqual({ minX: 0, minY: 0, maxX: 20, maxY: 10 });
    expect(l.closed).toBe(true);
    // Corners are cut, so (0,0) is not on the outline.
    expect(l.points.some((p) => p.x === 0 && p.y === 0)).toBe(false);
  });
  it('circle and ellipse', () => {
    const c = importSvg(svg('<circle cx="50" cy="50" r="10" fill="none" stroke="black"/>'))
      .layers[0]!.strokes[0]!;
    expect(bbox(c.points)).toEqual({ minX: 40, minY: 40, maxX: 60, maxY: 60 });
    const e = importSvg(
      svg('<ellipse cx="50" cy="50" rx="20" ry="10" fill="none" stroke="black"/>'),
    ).layers[0]!.strokes[0]!;
    expect(bbox(e.points)).toEqual({ minX: 30, minY: 40, maxX: 70, maxY: 60 });
  });
  it('line, polyline, polygon', () => {
    expect(firstStroke(svg('<line x1="1" y1="2" x2="3" y2="4" stroke="black"/>'))).toEqual({
      closed: false,
      points: [
        [1, 2],
        [3, 4],
      ],
    });
    expect(
      firstStroke(svg('<polyline points="0,0 10,0 10,10" fill="none" stroke="black"/>')),
    ).toEqual({
      closed: false,
      points: [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
    });
    expect(
      firstStroke(svg('<polygon points="0 0 10 0 10 10" fill="none" stroke="black"/>')),
    ).toEqual({
      closed: true,
      points: [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
    });
  });
  it('zero-size shapes are skipped', () => {
    expect(
      importSvg(svg('<rect width="0" height="10" stroke="black"/><circle r="0" stroke="black"/>'))
        .layers,
    ).toEqual([]);
  });
});

describe('importSvg: transforms and <use>', () => {
  it('nested group transforms compose', () => {
    const s = svg(
      '<g transform="translate(10,0)"><g transform="scale(2)"><path d="M0 0 L5 5" stroke="black"/></g></g>',
    );
    expect(firstStroke(s).points).toEqual([
      [10, 0],
      [20, 10],
    ]);
  });
  it('element transform applies inside parent transform', () => {
    const s = svg(
      '<g transform="translate(50,50)"><rect width="10" height="10" transform="rotate(90)" fill="none" stroke="black"/></g>',
    );
    expect(bbox(importSvg(s).layers[0]!.strokes[0]!.points)).toEqual({
      minX: 40,
      minY: 50,
      maxX: 50,
      maxY: 60,
    });
  });
  it('<use> with href and xlink:href, x/y offset, and transform', () => {
    const s = svg(
      '<defs><path id="p" d="M0 0 L10 0" stroke="black"/></defs>' +
        '<use href="#p" x="5" y="5"/>' +
        '<use xlink:href="#p" transform="translate(0,20)"/>',
      'width="100mm" height="100mm" viewBox="0 0 100 100" xmlns:xlink="http://www.w3.org/1999/xlink"',
    );
    const strokes = importSvg(s).layers[0]!.strokes.map(roundLine);
    expect(strokes.map((l) => l.points)).toEqual([
      [
        [5, 5],
        [15, 5],
      ],
      [
        [0, 20],
        [10, 20],
      ],
    ]);
  });
  it('<use> inherits style from the use element', () => {
    const s = svg(
      '<defs><path id="p" d="M0 0 L10 0"/></defs><use href="#p" stroke="red" fill="none"/>',
    );
    const doc = importSvg(s);
    expect(doc.layers[0]!.strokes).toHaveLength(1);
    expect(doc.layers[0]!.color).toBe('#ff0000');
  });
  it('<use> of a <symbol> with viewBox scales into width/height', () => {
    const s = svg(
      '<symbol id="s" viewBox="0 0 10 10"><path d="M0 0 L10 10" stroke="black"/></symbol>' +
        '<use href="#s" x="20" y="20" width="40" height="40"/>',
    );
    expect(firstStroke(s).points).toEqual([
      [20, 20],
      [60, 60],
    ]);
  });
  it('defs and symbols are not drawn directly', () => {
    const s = svg(
      '<defs><path id="p" d="M0 0 L10 0" stroke="black"/></defs><symbol id="s"><path d="M0 0 L1 1" stroke="black"/></symbol>',
    );
    expect(importSvg(s).layers).toEqual([]);
  });
  it('warns on an unresolved <use>', () => {
    expect(importSvg(svg('<use href="#nope"/>')).warnings[0]).toMatch(/Couldn't resolve/);
  });
  it('survives a <use> cycle', () => {
    const s = svg('<g id="a"><use href="#a"/></g>');
    expect(() => importSvg(s)).not.toThrow();
  });
});

describe('importSvg: styles, visibility and warnings', () => {
  it('skips display:none subtrees and visibility:hidden elements', () => {
    const s = svg(
      '<g style="display:none"><path d="M0 0 L1 1" stroke="black"/></g>' +
        '<g visibility="hidden"><path d="M0 0 L2 2" stroke="black"/><path d="M0 0 L3 3" stroke="black" visibility="visible"/></g>' +
        '<path d="M0 0 L4 4" stroke="black" display="none"/>',
    );
    const strokes = importSvg(s).layers[0]!.strokes.map(roundLine);
    expect(strokes.map((l) => l.points[1])).toEqual([[3, 3]]);
  });
  it('warns once about text', () => {
    const doc = importSvg(svg('<text>Hi</text><text>There</text>'));
    expect(doc.warnings).toEqual([TEXT_WARNING]);
  });
  it('stylesheet classes, ids and inline style cascade', () => {
    const s = svg(
      '<style>.a{stroke:blue;fill:none} #x{stroke:red} path{stroke:green}</style>' +
        '<path class="a" d="M0 0L1 0"/><path class="a" id="x" d="M0 0L2 0"/>' +
        '<path class="a" id="x" style="stroke:#123456" d="M0 0L3 0"/><path d="M0 0L4 0" fill="none"/>',
      'width="100mm" height="100mm" viewBox="0 0 100 100"',
    );
    const doc = importSvg(s, { layerMode: 'byColor' });
    expect(doc.layers.map((l) => l.name)).toEqual(['#0000ff', '#ff0000', '#123456', '#008000']);
  });
  it('fill defaults to black, so unstyled shapes become fill regions', () => {
    const doc = importSvg(svg('<rect width="10" height="10"/>'));
    expect(doc.layers[0]!.fills).toHaveLength(1);
    expect(doc.layers[0]!.strokes).toHaveLength(0);
  });
  it('currentColor resolves through color', () => {
    const doc = importSvg(svg('<g color="#00ff00"><path d="M0 0L1 1" stroke="currentColor"/></g>'));
    expect(doc.layers[0]!.color).toBe('#00ff00');
  });
});

describe('importSvg: fills (IMPORT-4)', () => {
  it('filled shape becomes a FillRegion with its fill-rule, no stroke', () => {
    const doc = importSvg(
      svg('<path fill-rule="evenodd" fill="#f00" d="M0 0H50V50H0Z M10 10V40H40V10Z"/>'),
    );
    const layer = doc.layers[0]!;
    expect(layer.strokes).toHaveLength(0);
    expect(layer.fills).toHaveLength(1);
    expect(layer.fills[0]!.fillRule).toBe('evenodd');
    expect(layer.fills[0]!.outer).toHaveLength(2);
    expect(layer.fills[0]!.color).toBe('#ff0000');
  });
  it('fill and stroke gives both', () => {
    const layer = importSvg(svg('<circle cx="5" cy="5" r="5" fill="red" stroke="black"/>'))
      .layers[0]!;
    expect(layer.fills).toHaveLength(1);
    expect(layer.strokes).toHaveLength(1);
  });
  it('lines never fill', () => {
    const layer = importSvg(svg('<line x2="10" stroke="black" fill="red"/>')).layers[0]!;
    expect(layer.fills).toHaveLength(0);
  });
  it('fill-rule inherits from groups', () => {
    const layer = importSvg(svg('<g fill-rule="evenodd"><rect width="10" height="10"/></g>'))
      .layers[0]!;
    expect(layer.fills[0]!.fillRule).toBe('evenodd');
  });
});

describe('importSvg: layers (IMPORT-3)', () => {
  const ink = (body: string) =>
    svg(
      body,
      'width="100mm" height="100mm" viewBox="0 0 100 100" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"',
    );
  const twoLayers = ink(
    '<g inkscape:groupmode="layer" inkscape:label="One"><path d="M0 0L1 1" stroke="red"/></g>' +
      '<path d="M0 0L9 9" stroke="black"/>' +
      '<g inkscape:groupmode="layer" inkscape:label="Two"><path d="M0 0L2 2" stroke="blue"/>' +
      '<g inkscape:groupmode="layer" inkscape:label="Sub"><path d="M0 0L3 3" stroke="blue"/></g></g>',
  );
  it('Inkscape layers become app layers with labels; sublayers merge; unlayered goes last', () => {
    const doc = importSvg(twoLayers);
    expect(doc.source?.hasLayers).toBe(true);
    expect(doc.layers.map((l) => [l.name, l.strokes.length, l.color])).toEqual([
      ['One', 1, '#ff0000'],
      ['Two', 2, '#0000ff'],
      ['Other', 1, '#000000'],
    ]);
  });
  it('layerMode single merges everything', () => {
    const doc = importSvg(twoLayers, { layerMode: 'single' });
    expect(doc.layers.map((l) => [l.name, l.strokes.length])).toEqual([['Layer 1', 4]]);
  });
  it('without Inkscape layers: one layer by default, or split by stroke color', () => {
    const s = svg(
      '<path d="M0 0L1 1" stroke="red"/><path d="M0 0L2 2" stroke="#00f"/><path d="M0 0L3 3" stroke="red"/>',
    );
    expect(importSvg(s).layers).toHaveLength(1);
    expect(importSvg(s).source?.hasLayers).toBe(false);
    const byColor = importSvg(s, { layerMode: 'byColor' });
    expect(byColor.layers.map((l) => [l.name, l.color, l.strokes.length])).toEqual([
      ['#ff0000', '#ff0000', 2],
      ['#0000ff', '#0000ff', 1],
    ]);
  });
  it('layer ids are stable and unique', () => {
    expect(importSvg(twoLayers).layers.map((l) => l.id)).toEqual(['layer-1', 'layer-2', 'layer-3']);
  });
});

describe('importSvg: errors', () => {
  it('rejects non-SVG XML', () => {
    expect(() => importSvg('<html></html>')).toThrow(/Not an SVG/);
  });
  it('rejects broken XML with a readable message', () => {
    expect(() => importSvg('<svg><g></svg>')).toThrow(/Couldn't read SVG/);
  });
});

describe('importSvg: white fills', () => {
  const s = svg(
    '<rect width="10" height="10" fill="#fff"/><rect width="5" height="5" fill="#f5f5f5" stroke="black"/>',
  );
  it('keeps white and near-white fills as knockouts by default, and their strokes', () => {
    const doc = importSvg(s);
    expect(doc.layers[0]!.fills.map((f) => f.knockout)).toEqual([true, true]);
    expect(doc.layers[0]!.strokes).toHaveLength(1);
  });
  it('drops white fills in by-color mode (no empty white layer)', () => {
    const doc = importSvg(s, { layerMode: 'byColor' });
    expect(doc.layers).toHaveLength(1);
    expect(doc.layers[0]!.fills).toHaveLength(0);
  });
  it('drops a layer that only has knockouts', () => {
    expect(importSvg(svg('<rect width="10" height="10" fill="#fff"/>')).layers).toHaveLength(0);
  });
  it('can keep them', () => {
    const fills = importSvg(s, { ignoreWhiteFills: false }).layers[0]!.fills;
    expect(fills.map((f) => f.knockout)).toEqual([undefined, undefined]);
  });
});
