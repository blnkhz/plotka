import { describe, expect, it } from 'vitest';
import { nibHalf, nibQuads, PARALLEL_SIZES } from '../src/renderer/src/lib/nib';
import type { Vec2 } from '@plotter-studio/core';

const signedArea = (q: Vec2[]) =>
  q.reduce((a, p, i) => {
    const n = q[(i + 1) % q.length]!;
    return a + (p.x * n.y - n.x * p.y);
  }, 0) / 2;

/** How wide the swept band is across a straight stroke (area / length). */
const bandWidth = (pts: Vec2[], angle: number, width = 4) => {
  const quads = nibQuads(pts, false, { width, angle }, 0);
  const len = Math.hypot(pts[1]!.x - pts[0]!.x, pts[1]!.y - pts[0]!.y);
  return quads.reduce((a, q) => a + Math.abs(signedArea(q)), 0) / len;
};

describe('parallel pen preview (flat nib)', () => {
  it('has the Pilot Parallel sizes', () => {
    expect(PARALLEL_SIZES).toEqual([1.5, 2.4, 3.0, 3.8, 4.5, 6.0]);
  });

  it('angle is counterclockwise from horizontal as seen (y down)', () => {
    const h = nibHalf({ width: 2, angle: 90 });
    expect(h.x).toBeCloseTo(0);
    expect(h.y).toBeCloseTo(-1); // up on the paper
  });

  it('is widest across the nib and only a hairline along its edge', () => {
    const horizontal = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(bandWidth(horizontal, 90)).toBeCloseTo(4); // nib upright: full width
    expect(bandWidth(horizontal, 30)).toBeCloseTo(4 * Math.sin(Math.PI / 6)); // 2 mm
    expect(nibQuads(horizontal, false, { width: 4, angle: 0 }, 0)).toHaveLength(0);
    // With the hairline: a fine line remains along the edge.
    const hair = nibQuads(horizontal, false, { width: 4, angle: 0 }, 0.15);
    expect(hair).toHaveLength(1);
    expect(Math.abs(signedArea(hair[0]!)) / 10).toBeCloseTo(0.15);
  });

  it('winds every quad the same way, whichever way the line goes', () => {
    const zigzag = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 10 },
      { x: 10, y: 15 },
      { x: 3, y: 1 },
    ];
    const quads = nibQuads(zigzag, true, { width: 3, angle: 45 });
    expect(quads).toHaveLength(10); // closed: back to the start too; nib band + hairline each
    const signs = quads.map((q) => Math.sign(signedArea(q)));
    expect(new Set(signs).size).toBe(1);
  });
});
