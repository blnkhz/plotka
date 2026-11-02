import { describe, expect, it } from 'vitest';
import {
  applyFills,
  buildToolpath,
  createLayer,
  moveTime,
  toolpathStats,
  type PlotDocument,
} from '../../src';

const limits = { maxSpeedPenDown: 100, maxSpeedPenUp: 200, acceleration: 1000, penLiftDelay: 0.1 };

function twoPathDoc(): PlotDocument {
  const a = createLayer('a', 'A');
  a.strokes.push({
    points: [
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ],
    closed: false,
  });
  a.strokes.push({
    points: [
      { x: 20, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 20 },
      { x: 20, y: 20 },
    ],
    closed: true,
  });
  a.fills.push({
    outer: [
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
    ],
    fillRule: 'nonzero',
  });
  const b = createLayer('b', 'B');
  b.plot = false;
  b.strokes.push({
    points: [
      { x: 0, y: 0 },
      { x: 99, y: 0 },
    ],
    closed: false,
  });
  return { width: 100, height: 100, layers: [a, b], warnings: [] };
}

describe('toolpath and stats (PREVIEW-3)', () => {
  it('only plotted layers, fill outlines only with drawOutline', () => {
    const d = twoPathDoc();
    expect(buildToolpath(d).layers.map((l) => [l.layerId, l.paths.length])).toEqual([['a', 2]]);
    d.layers[0]!.settings.drawOutline = true;
    // Outlines are added by the fills step, not buildToolpath.
    expect(buildToolpath(applyFills(d)).layers[0]!.paths).toHaveLength(3);
  });
  it('distances, lifts and path count', () => {
    const s = toolpathStats(buildToolpath(twoPathDoc()), limits, () => ({
      penDown: 100,
      penUp: 100,
    }));
    expect(s.total.penDownDistance).toBeCloseTo(10 + 40);
    // home->(10,0)=10, (20,0)->(20,10)=10, closed square ends at (20,10), back home = sqrt(500)
    expect(s.total.travelDistance).toBeCloseTo(20 + Math.sqrt(500));
    expect(s.total.penLifts).toBe(2);
    expect(s.total.pathCount).toBe(2);
    expect(s.layers.get('a')!.pathCount).toBe(2);
    expect(s.total.estimatedTime).toBeGreaterThan(0.4); // 4 pen moves at 0.1 s
  });
  it('slower speed % gives a longer estimate', () => {
    const fast = toolpathStats(buildToolpath(twoPathDoc()), limits, () => ({
      penDown: 100,
      penUp: 100,
    }));
    const slow = toolpathStats(buildToolpath(twoPathDoc()), limits, () => ({
      penDown: 25,
      penUp: 100,
    }));
    expect(slow.total.estimatedTime).toBeGreaterThan(fast.total.estimatedTime);
  });
  it('moveTime: triangular and trapezoidal profiles', () => {
    expect(moveTime(0, 100, 1000)).toBe(0);
    // 100 mm at 100 mm/s, a=1000: accel distance 10 mm total -> 1 s + 0.1 s
    expect(moveTime(100, 100, 1000)).toBeCloseTo(1.1);
    // 1 mm never reaches full speed: 2*sqrt(1/1000)
    expect(moveTime(1, 100, 1000)).toBeCloseTo(2 * Math.sqrt(0.001));
  });
});
