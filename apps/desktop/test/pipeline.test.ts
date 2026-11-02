import { describe, expect, it } from 'vitest';
import {
  createLayer,
  defaultOptimizeSettings,
  defaultPageSetup,
  type PlotDocument,
} from '@plotter-studio/core';
import { DEFAULT_PROFILE_ID, getProfile } from '@plotter-studio/plotter';
import { computeProcessed, type PipelineInput } from '../src/renderer/src/lib/pipeline';

const doc = (): PlotDocument => {
  const l = createLayer('a', 'A');
  l.strokes = [
    {
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
      ],
      closed: false,
    },
  ];
  return { width: 50, height: 50, layers: [l], warnings: [] };
};
const input = (o: Partial<PipelineInput> = {}): PipelineInput => ({
  doc: doc(),
  page: defaultPageSetup(),
  optimize: defaultOptimizeSettings(),
  transforms: [],
  profile: getProfile(DEFAULT_PROFILE_ID)!,
  penHeights: { up: 60, down: 30 },
  ...o,
});

describe('computeProcessed (the worker job)', () => {
  it('places, optimizes and estimates with the motion plan', () => {
    const r = computeProcessed(input());
    expect(r.toolpath.layers[0]!.paths).toHaveLength(1);
    expect(r.stats.total.penDownDistance).toBeGreaterThan(100);
    expect(r.stats.total.estimatedTime).toBeGreaterThan(1);
    expect(r.stats.layers.get('a')!.estimatedTime).toBeGreaterThan(0);
  });

  it('timeline: each path draw window in plot order, within the plan total time', () => {
    const d = doc();
    d.layers[0]!.strokes.push({
      points: [
        { x: 0, y: 40 },
        { x: 30, y: 40 },
      ],
      closed: false,
    });
    const r = computeProcessed(input({ doc: d }));
    const tl = r.timeline;
    expect(tl.start.length).toBe(2);
    expect(tl.totalMs).toBeCloseTo(r.stats.total.estimatedTime * 1000, 6);
    for (let i = 0; i < 2; i++) {
      expect(tl.end[i]!).toBeGreaterThan(tl.start[i]!);
      expect(tl.end[i]!).toBeLessThanOrEqual(tl.totalMs);
    }
    expect(tl.start[1]!).toBeGreaterThan(tl.end[0]!); // in order, with the pen lift and travel between
    expect([...tl.path].sort()).toEqual([0, 1]);
  });

  it('results survive structured cloning (what crossing to and from the worker does)', () => {
    const r = computeProcessed(input());
    const copy = structuredClone(r);
    expect(copy.stats.layers instanceof Map).toBe(true);
    expect(copy.toolpath).toEqual(r.toolpath);
  });

  it('pen heights change the estimate (pen move time)', () => {
    const near = computeProcessed(input({ penHeights: { up: 35, down: 30 } }));
    const far = computeProcessed(input({ penHeights: { up: 90, down: 10 } }));
    expect(far.stats.total.estimatedTime).toBeGreaterThan(near.stats.total.estimatedTime);
  });

  it("the machine profile's speeds drive the estimate", () => {
    const base = getProfile(DEFAULT_PROFILE_ID)!;
    const slow = {
      ...base,
      motion: { ...base.motion, maxSpeedPenDown: base.motion.maxSpeedPenDown / 4 },
    };
    const t = (profile: typeof base) =>
      computeProcessed(input({ profile })).stats.total.estimatedTime;
    expect(t(slow)).toBeGreaterThan(t(base));
  });
});
