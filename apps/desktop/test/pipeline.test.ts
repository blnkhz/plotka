import { describe, expect, it } from 'vitest';
import {
  createLayer,
  defaultOptimizeSettings,
  defaultPageSetup,
  type PlotDocument,
} from '@plotter-studio/core';
import { DEFAULT_PROFILE_ID } from '@plotter-studio/plotter';
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
  profileId: DEFAULT_PROFILE_ID,
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

  it('an unknown profile is a clear error', () => {
    expect(() => computeProcessed(input({ profileId: 'nope' }))).toThrow(/Unknown machine profile/);
  });
});
