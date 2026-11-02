import { describe, expect, it } from 'vitest';
import {
  distanceAlong,
  toolpathFrom,
  trimPathStart,
  type Polyline,
  type Toolpath,
} from '../../src';

const open = (...pts: [number, number][]): Polyline => ({
  points: pts.map(([x, y]) => ({ x, y })),
  closed: false,
});
const square: Polyline = { ...open([0, 0], [10, 0], [10, 10], [0, 10]), closed: true };

describe('resume (PLOT-5)', () => {
  it('distanceAlong finds how far along the path a point is', () => {
    expect(distanceAlong(open([0, 0], [10, 0], [10, 10]), { x: 10.3, y: 4 })).toBeCloseTo(14);
    expect(distanceAlong(square, { x: 0, y: 5 })).toBeCloseTo(35); // on the closing side
  });

  it('trimPathStart cuts the beginning off, mid-segment', () => {
    expect(trimPathStart(open([0, 0], [10, 0], [10, 10]), 12)).toEqual(open([10, 2], [10, 10]));
    expect(trimPathStart(square, 35)).toEqual(open([0, 5], [0, 0])); // the rest of the loop
    expect(trimPathStart(open([0, 0], [10, 0]), 20)).toBeNull();
    expect(trimPathStart(square, 0)).toBe(square);
  });

  it('toolpathFrom drops earlier layers and paths and trims the first one', () => {
    const tp: Toolpath = {
      layers: [
        { layerId: 'a', paths: [open([0, 0], [1, 0])] },
        {
          layerId: 'b',
          paths: [open([0, 0], [10, 0]), open([0, 5], [10, 5]), open([0, 9], [10, 9])],
        },
        { layerId: 'c', paths: [open([5, 5], [6, 6])] },
      ],
    };
    const r = toolpathFrom(tp, { layerId: 'b', pathIndex: 1, offset: 4 });
    expect(r.layers.map((l) => l.layerId)).toEqual(['b', 'c']);
    expect(r.layers[0]!.paths).toEqual([open([4, 5], [10, 5]), open([0, 9], [10, 9])]);
    expect(r.layers[1]).toBe(tp.layers[2]);
    // Past the end of the path: start with the next one.
    expect(
      toolpathFrom(tp, { layerId: 'b', pathIndex: 1, offset: 50 }).layers[0]!.paths,
    ).toHaveLength(1);
  });
});
