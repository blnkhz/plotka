import { describe, expect, it } from 'vitest';
import type { Polyline } from '@plotka/core';
import { completedCount, fmtClock, partialRoute, penAt } from '../src/renderer/src/lib/playback';
import type { Timeline } from '../src/renderer/src/lib/pipeline';

const line = (x0: number, y0: number, x1: number, y1: number): Polyline => ({
  points: [
    { x: x0, y: y0 },
    { x: x1, y: y1 },
  ],
  closed: false,
});
const paths = [line(10, 0, 20, 0), line(30, 0, 40, 0)];
const tl: Timeline = {
  totalMs: 1000,
  layer: Int32Array.from([0, 0]),
  path: Int32Array.from([0, 1]),
  start: Float64Array.from([100, 500]),
  end: Float64Array.from([300, 700]),
};
const pathOf = (_l: number, p: number) => paths[p];

describe('playback (PREVIEW-4)', () => {
  it('counts finished paths', () => {
    expect(completedCount(tl, 0)).toBe(0);
    expect(completedCount(tl, 300)).toBe(1);
    expect(completedCount(tl, 699)).toBe(1);
    expect(completedCount(tl, 1000)).toBe(2);
  });
  it('partial routes by length, closed paths go round to the start', () => {
    expect(partialRoute(line(0, 0, 10, 0), 0.25)).toEqual([
      { x: 0, y: 0 },
      { x: 2.5, y: 0 },
    ]);
    const sq: Polyline = {
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      closed: true,
    };
    expect(partialRoute(sq, 1).at(-1)).toEqual({ x: 0, y: 0 });
  });
  it('pen position: home, travelling, drawing, back home', () => {
    expect(penAt(tl, pathOf, 0)).toEqual({ x: 0, y: 0, down: false });
    expect(penAt(tl, pathOf, 50)).toEqual({ x: 5, y: 0, down: false }); // halfway to (10, 0)
    expect(penAt(tl, pathOf, 200)).toEqual({ x: 15, y: 0, down: true });
    expect(penAt(tl, pathOf, 400)).toEqual({ x: 25, y: 0, down: false }); // between the two paths
    expect(penAt(tl, pathOf, 1000)).toEqual({ x: 0, y: 0, down: false });
  });
  it('formats the clock', () => {
    expect(fmtClock(65_000)).toBe('1:05');
    expect(fmtClock(3_725_000)).toBe('1:02:05');
  });
});
