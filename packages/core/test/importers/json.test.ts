import { describe, expect, it } from 'vitest';
import {
  findImporter,
  importJsonPaths,
  supportedExtensions,
  toolpathToJson,
  type Toolpath,
} from '../../src';

/** ASCII text as bytes (the core package has no TextEncoder). */
const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe('JSON paths import (IMPORT-7)', () => {
  it('a bare list of paths, in mm', () => {
    const doc = importJsonPaths(
      JSON.stringify([
        [
          [0, 0],
          [10, 0],
        ],
        [
          [0, 5],
          [10, 5],
          [10, 20],
        ],
      ]),
    );
    expect(doc.layers).toHaveLength(1);
    expect(doc.layers[0]!.strokes).toHaveLength(2);
    expect(doc.width).toBe(10);
    expect(doc.height).toBe(20);
  });

  it('layers, names, colors, closed paths, {x, y} points, units and size', () => {
    const doc = importJsonPaths(
      JSON.stringify({
        units: 'in',
        width: 4,
        height: 3,
        layers: [
          {
            name: 'Ink',
            color: '#1d3557',
            paths: [
              {
                points: [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                ],
                closed: true,
              },
            ],
          },
          {
            name: 'Red',
            color: '#e63946',
            paths: [
              [
                { x: 2, y: 2 },
                { x: 3, y: 2 },
              ],
            ],
          },
        ],
      }),
    );
    expect(doc.width).toBeCloseTo(101.6);
    expect(doc.layers.map((l) => [l.name, l.color])).toEqual([
      ['Ink', '#1d3557'],
      ['Red', '#e63946'],
    ]);
    expect(doc.layers[0]!.strokes[0]!.closed).toBe(true);
    const p = doc.layers[1]!.strokes[0]!.points[1]!;
    expect(p.x).toBeCloseTo(76.2, 9);
    expect(p.y).toBeCloseTo(50.8, 9);
  });

  it('a single point is a dot (pen tap)', () => {
    const doc = importJsonPaths(JSON.stringify({ paths: [[[5, 5]]] }));
    expect(doc.layers[0]!.strokes[0]!.points).toEqual([
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ]);
  });

  it('round-trips the exported toolpath JSON', () => {
    const tp: Toolpath = {
      layers: [
        {
          layerId: 'a',
          paths: [
            {
              points: [
                { x: 1, y: 2 },
                { x: 3, y: 4 },
              ],
              closed: false,
            },
          ],
        },
      ],
    };
    const doc = importJsonPaths(
      toolpathToJson(tp, { width: 210, height: 297 }, () => ({ name: 'A', color: '#ff0000' })),
    );
    expect(doc.width).toBe(210);
    expect(doc.layers[0]!.name).toBe('A');
    expect(doc.layers[0]!.strokes[0]!.points).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
  });

  it('layer modes: one layer, or by color', () => {
    const text = JSON.stringify({
      layers: [
        {
          color: '#ff0000',
          paths: [
            [
              [0, 0],
              [1, 1],
            ],
          ],
        },
        {
          color: '#0000ff',
          paths: [
            [
              [0, 0],
              [2, 2],
            ],
          ],
        },
        {
          color: '#ff0000',
          paths: [
            [
              [0, 0],
              [3, 3],
            ],
          ],
        },
      ],
    });
    expect(importJsonPaths(text, { layerMode: 'single' }).layers).toHaveLength(1);
    const byColor = importJsonPaths(text, { layerMode: 'byColor' }).layers;
    expect(byColor.map((l) => l.strokes.length)).toEqual([2, 1]);
  });

  it('clear errors for bad input', () => {
    expect(() => importJsonPaths('{nope')).toThrow(/isn't valid JSON/);
    expect(() => importJsonPaths(JSON.stringify({ units: 'furlong', paths: [] }))).toThrow(
      /Unknown units/,
    );
    expect(() => importJsonPaths(JSON.stringify([[[0, 'a']]]))).toThrow(/point must be \[x, y\]/);
    expect(() => importJsonPaths(JSON.stringify({ paths: [] }))).toThrow(/no points/);
  });

  it('is registered for .json, but not for projects', () => {
    expect(supportedExtensions()).toContain('.json');
    expect(findImporter(enc('[[[0,0],[1,1]]]'), 'art.json')?.id).toBe('json');
    expect(findImporter(enc('{}'), 'x.plot.json')?.id).not.toBe('json');
  });
});
