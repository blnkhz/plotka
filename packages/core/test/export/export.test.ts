import { describe, expect, it } from 'vitest';
import {
  importSvg,
  toolpathToJson,
  toolpathToSvg,
  TOOLPATH_FORMAT,
  type Toolpath,
} from '../../src';

const tp: Toolpath = {
  layers: [
    {
      layerId: 'a',
      paths: [
        {
          points: [
            { x: 10, y: 10 },
            { x: 50.12345, y: 10 },
          ],
          closed: false,
        },
        {
          points: [
            { x: 20, y: 20 },
            { x: 30, y: 20 },
            { x: 25, y: 30 },
          ],
          closed: true,
        },
        {
          points: [
            { x: 5, y: 5 },
            { x: 5, y: 5 },
          ],
          closed: false,
        },
      ],
    },
    {
      layerId: 'b',
      paths: [
        {
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
          closed: false,
        },
      ],
    },
  ],
};
const info = (id: string) => ({
  name: id === 'a' ? 'Ink & <lines>' : 'B',
  color: id === 'a' ? '#ff0000' : 'red;x',
});
const paper = { width: 210, height: 297 };

describe('export (PREVIEW-6)', () => {
  it('SVG: mm page, one layer group per layer, paths that import back the same', () => {
    const svg = toolpathToSvg(tp, paper, info);
    expect(svg).toContain('width="210mm" height="297mm" viewBox="0 0 210 297"');
    expect(svg).toContain('inkscape:label="Ink &amp; &lt;lines&gt;"');
    expect(svg).toContain('stroke="#ff0000"');
    expect(svg).toContain('stroke="#000000"'); // unsafe color replaced
    expect(svg).toContain('d="M10 10L50.123 10"');
    expect(svg).toContain('d="M20 20L30 20L25 30Z"');
    expect(svg).toContain('d="M5 5L5 5"'); // a dot
    const back = importSvg(svg);
    expect(back.width).toBeCloseTo(210);
    expect(back.layers.map((l) => l.name)).toEqual(['Ink & <lines>', 'B']);
    expect(back.layers[0]!.strokes).toHaveLength(3);
  });

  it('JSON: documented format, rounded mm coordinates, plot order', () => {
    const j = JSON.parse(toolpathToJson(tp, paper, info));
    expect(j.format).toBe(TOOLPATH_FORMAT);
    expect(j.units).toBe('mm');
    expect(j.layers.map((l: { id: string }) => l.id)).toEqual(['a', 'b']);
    expect(j.layers[0].paths[0]).toEqual({
      closed: false,
      points: [
        [10, 10],
        [50.123, 10],
      ],
    });
    expect(j.layers[0].paths[1].closed).toBe(true);
  });
});
