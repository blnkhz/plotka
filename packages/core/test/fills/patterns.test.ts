import { describe, expect, it } from 'vitest';
import {
  applyFills,
  colorDarkness,
  concentricFill,
  createLayer,
  dotFill,
  layerFillPaths,
  regionSpacing,
  ShapeTester,
  spiralCenters,
  spiralFill,
  undrawnFillCount,
  type FillRegion,
  type FillSettings,
  type Layer,
  type PatternOptions,
  type Polyline,
  type Vec2,
} from '../../src';

const rect = (x: number, y: number, w: number, h: number, reverse = false): Vec2[] => {
  const r = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  return reverse ? r.reverse() : r;
};
const region = (rings: Vec2[][], extra: Partial<FillRegion> = {}): FillRegion => ({
  outer: rings,
  fillRule: 'nonzero',
  ...extra,
});
const opts = (o: Partial<PatternOptions> = {}): PatternOptions => ({
  spacing: 1,
  angle: 0,
  inset: 0,
  connect: false,
  ...o,
});
const fill = (o: Partial<FillSettings> = {}): FillSettings => ({
  type: 'lines',
  spacing: 1,
  angle: 0,
  inset: 0,
  connect: false,
  ...o,
});
const layerWith = (fills: FillRegion[], f: FillSettings | null, extra = {}): Layer => {
  const l = createLayer('a', 'A');
  l.fills = fills;
  l.settings = { ...l.settings, fill: f, ...extra };
  return l;
};
const pts = (lines: Polyline[]) => lines.flatMap((l) => l.points);
const inRect = (p: Vec2, x: number, y: number, w: number, h: number, eps = 1e-6) =>
  p.x >= x - eps && p.x <= x + w + eps && p.y >= y - eps && p.y <= y + h + eps;

/** Densely samples every segment. */
function samples(lines: Polyline[], step = 0.05): Vec2[] {
  const out: Vec2[] = [];
  for (const l of lines) {
    const p = l.closed ? [...l.points, l.points[0]!] : l.points;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]!;
      const b = p[i]!;
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
      for (let k = 0; k <= n; k++)
        out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
  }
  return out;
}

describe('ShapeTester', () => {
  it('nonzero winding with holes', () => {
    const t = new ShapeTester([rect(0, 0, 10, 10), rect(3, 3, 4, 4, true)], 1);
    expect(t.contains({ x: 1, y: 1 })).toBe(true);
    expect(t.contains({ x: 5, y: 5 })).toBe(false);
    expect(t.contains({ x: 11, y: 5 })).toBe(false);
  });
});

describe('hide covered shapes', () => {
  const bottom = region([rect(0, 0, 20, 20)]);
  const top = region([rect(10, 10, 20, 20)]);

  /** Hatch lines crossing x = 15 inside the overlap (10 < y < 20). */
  const crossingOverlap = (lines: Polyline[]) =>
    lines.filter((l) => {
      const [a, b] = [l.points[0]!, l.points[l.points.length - 1]!];
      return Math.min(a.x, b.x) < 15 && Math.max(a.x, b.x) > 15 && a.y > 10 && a.y < 20;
    });

  it('no hatch of the lower shape under the upper shape', () => {
    const lines = layerFillPaths(layerWith([bottom, top], fill()));
    // Only the top square's 10 rows cross the overlap.
    expect(crossingOverlap(lines)).toHaveLength(10);
    // The lower square still has its 10 rows above the overlap.
    expect(lines.filter((l) => l.points[0]!.y < 10)).toHaveLength(10);
  });

  it('turning it off hatches both fully (old behavior)', () => {
    const lines = layerFillPaths(layerWith([bottom, top], fill(), { hideCovered: false }));
    expect(crossingOverlap(lines)).toHaveLength(20); // 10 rows from each square
  });

  it('a white knockout hides what is under it and is not drawn', () => {
    const ko = region([rect(5, 5, 10, 10)], { knockout: true, color: '#ffffff' });
    const lines = layerFillPaths(layerWith([bottom, ko], fill(), { drawOutline: true }));
    const inside = samples(lines).filter(
      (p) => p.x > 5.01 && p.x < 14.99 && p.y > 5.01 && p.y < 14.99,
    );
    expect(inside).toHaveLength(0);
  });

  it('outlines of a covered shape are clipped where the upper shape covers them', () => {
    const lines = layerFillPaths(layerWith([bottom, top], null, { drawOutline: true }));
    const s = samples(lines);
    // The lower square's corner (20, 20) is under the top square: not drawn.
    expect(s.some((p) => Math.abs(p.x - 20) < 1e-6 && p.y > 10.01 && p.y < 19.99)).toBe(false);
    // The top square's outline is complete (closed).
    expect(lines.some((l) => l.closed && l.points.some((p) => p.x === 30 && p.y === 30))).toBe(
      true,
    );
  });

  it('applyFills adds outlines only with drawOutline', () => {
    const doc = { width: 50, height: 50, warnings: [], layers: [layerWith([bottom], null)] };
    expect(applyFills(doc).layers[0]!.strokes).toHaveLength(0);
    doc.layers[0]!.settings.drawOutline = true;
    expect(applyFills(doc).layers[0]!.strokes).toHaveLength(1);
  });
});

describe('concentric (HATCH-4)', () => {
  it('rings at spacing × (k + ½) until the square vanishes', () => {
    const rings = concentricFill(region([rect(0, 0, 10, 10)]), opts());
    expect(rings).toHaveLength(5); // offsets 0.5, 1.5, 2.5, 3.5, 4.5
    expect(rings.every((r) => r.closed)).toBe(true);
    const xs = rings.map((r) => Math.min(...r.points.map((p) => p.x)));
    expect(xs.map((x) => +x.toFixed(2))).toEqual([0.5, 1.5, 2.5, 3.5, 4.5]);
  });

  it('respects inset and holes', () => {
    const rings = concentricFill(
      region([rect(0, 0, 20, 20), rect(8, 8, 4, 4, true)]),
      opts({ inset: 1 }),
    );
    for (const p of pts(rings)) {
      expect(inRect(p, 1, 1, 18, 18)).toBe(true);
      expect(inRect(p, 7.01, 7.01, 5.98, 5.98, 0)).toBe(false);
    }
    expect(rings.length).toBeGreaterThan(4);
  });

  it('keeps the pen down by joining rings with short connectors', () => {
    const rings = concentricFill(region([rect(0, 0, 10, 10)]), opts({ connect: true }));
    expect(rings).toHaveLength(1);
    const s = samples(rings);
    expect(s.every((p) => inRect(p, 0, 0, 10, 10))).toBe(true);
  });

  it('does not join across a gap (two separate islands)', () => {
    // A dumbbell: after a few rings the thin bridge vanishes and the rings split in two.
    const shape = [[...rect(0, 0, 10, 10)], [...rect(20, 0, 10, 10)], [...rect(9, 4, 12, 2)]];
    const rings = concentricFill(region(shape), opts({ connect: true }));
    expect(rings.length).toBeGreaterThanOrEqual(2);
  });
});

describe('spiral (HATCH-5)', () => {
  it('stays inside a circle and has turns at the spacing', () => {
    const circle = Array.from({ length: 128 }, (_, i) => {
      const a = (i / 128) * 2 * Math.PI;
      return { x: 50 + 10 * Math.cos(a), y: 50 + 10 * Math.sin(a) };
    });
    const lines = spiralFill(region([circle]), opts({ spacing: 1 }));
    expect(lines.length).toBeGreaterThanOrEqual(1);
    for (const p of pts(lines)) expect(Math.hypot(p.x - 50, p.y - 50)).toBeLessThanOrEqual(10.01);
    // Crossing the +x axis: radii at roughly 1 mm steps.
    const crossings = samples(lines, 0.02)
      .filter((p) => Math.abs(p.y - 50) < 0.01 && p.x > 50)
      .map((p) => Math.round(p.x - 50));
    expect(new Set(crossings).size).toBeGreaterThanOrEqual(9);
  });

  it('is clipped to non-round shapes and their holes', () => {
    const lines = spiralFill(
      region([rect(0, 0, 20, 10), rect(8, 3, 4, 4, true)]),
      opts({ inset: 0.5 }),
    );
    expect(lines.length).toBeGreaterThan(1);
    for (const p of samples(lines)) {
      expect(inRect(p, 0.5, 0.5, 19, 9, 1e-3)).toBe(true);
      // The hole grown by the inset has round corners; stay clear of them.
      expect(inRect(p, 7.9, 2.9, 4.2, 4.2, 0)).toBe(false);
    }
  });
});

describe('movable spiral center', () => {
  /** Where the spiral starts: the first point of the first path (the innermost turn). */
  const start = (l: Layer) => layerFillPaths(l)[0]!.points[0]!;

  it('starts at the inset centroid by default, and moves by the offset', () => {
    const sq = region([rect(0, 0, 20, 20)]);
    expect(start(layerWith([sq], fill({ type: 'spiral' })))).toEqual({ x: 10, y: 10 });
    const moved = start(layerWith([sq], fill({ type: 'spiral', centerX: 4, centerY: -3 })));
    expect(moved.x).toBeCloseTo(14);
    expect(moved.y).toBeCloseTo(7);
  });

  it('a center outside the shape still fills all of it, clipped to it', () => {
    const l = layerWith([region([rect(0, 0, 20, 20)])], fill({ type: 'spiral', centerX: 25 }));
    const p = pts(layerFillPaths(l));
    for (const q of p) expect(inRect(q, 0, 0, 20, 20, 1e-3)).toBe(true);
    // The far corner (35 mm from the center) is reached: turns cross the left edge's area.
    expect(p.some((q) => q.x < 1)).toBe(true);
  });

  it('a shared center is the centroid of all the shapes together', () => {
    const shapes = [region([rect(0, 0, 10, 10)]), region([rect(30, 0, 10, 10)])];
    const own = spiralCenters(layerWith(shapes, fill({ type: 'spiral' })))!;
    expect(own).toEqual([
      { x: 5, y: 5 },
      { x: 35, y: 5 },
    ]);
    const shared = spiralCenters(layerWith(shapes, fill({ type: 'spiral', sharedCenter: true })))!;
    expect(shared[0]).toEqual({ x: 20, y: 5 });
    expect(shared[1]).toEqual({ x: 20, y: 5 });
    expect(spiralCenters(layerWith(shapes, fill({ type: 'lines' })))).toBeNull();
  });
});

describe('dots (HATCH-6)', () => {
  it('a grid of zero-length taps on a square', () => {
    const dots = dotFill(region([rect(0, 0, 10, 10)]), opts());
    expect(dots).toHaveLength(100);
    for (const d of dots) {
      expect(d.points).toHaveLength(2);
      expect(d.points[0]).toEqual(d.points[1]);
    }
  });

  it('skips holes and respects the inset', () => {
    const dots = dotFill(region([rect(0, 0, 10, 10), rect(3, 3, 4, 4, true)]), opts({ inset: 1 }));
    for (const p of pts(dots)) {
      expect(inRect(p, 1, 1, 8, 8)).toBe(true);
      expect(inRect(p, 2, 2, 6, 6, 0) && !inRect(p, 2, 2, 6, 6, -1e-6)).toBe(false);
    }
    expect(dots.length).toBe(64 - 16 - 20); // 8×8 inner grid minus the hole grown by the inset
  });

  it('jitter is deterministic and stays inside', () => {
    const a = dotFill(region([rect(0, 0, 20, 20)]), opts({ jitter: 0.8, angle: 30 }));
    const b = dotFill(region([rect(0, 0, 20, 20)]), opts({ jitter: 0.8, angle: 30 }));
    expect(a).toEqual(b);
    for (const p of pts(a)) expect(inRect(p, 0, 0, 20, 20)).toBe(true);
    const straight = dotFill(region([rect(0, 0, 20, 20)]), opts({ angle: 30 }));
    expect(a).not.toEqual(straight);
  });
});

describe('density from color (HATCH-8)', () => {
  it('darkness from the source color', () => {
    expect(colorDarkness('#000000')).toBe(1);
    expect(colorDarkness('#ffffff')).toBeCloseTo(0, 9);
    expect(colorDarkness('#808080')).toBeCloseTo(0.498, 2);
    expect(colorDarkness('red')).toBeNull();
  });
  it('darker = tighter spacing, very light = skipped, capped at 10×', () => {
    const f = fill({ spacing: 0.5, densityFromColor: true });
    expect(regionSpacing(f, region([], { color: '#000000' }))).toBe(0.5);
    expect(regionSpacing(f, region([], { color: '#808080' }))).toBeCloseTo(1.004, 2);
    expect(regionSpacing(f, region([], { color: '#fafafa' }))).toBeNull();
    expect(regionSpacing(f, region([], { color: '#e8e8e8' }))).toBe(5);
    expect(regionSpacing(fill({ spacing: 0.5 }), region([], { color: '#808080' }))).toBe(0.5);
  });
  it('grey shapes get fewer lines than black ones', () => {
    const f = fill({ densityFromColor: true });
    const black = layerFillPaths(
      layerWith([region([rect(0, 0, 10, 10)], { color: '#000000' })], f),
    );
    const grey = layerFillPaths(layerWith([region([rect(0, 0, 10, 10)], { color: '#808080' })], f));
    expect(grey.length).toBeLessThan(black.length * 0.6);
  });
});

describe('undrawnFillCount', () => {
  it('counts filled shapes nothing draws', () => {
    const shapes = [
      region([rect(0, 0, 5, 5)]),
      region([rect(10, 0, 5, 5)]),
      region([rect(20, 0, 5, 5)], { knockout: true }),
    ];
    expect(undrawnFillCount(layerWith(shapes, null))).toBe(2);
    expect(undrawnFillCount(layerWith(shapes, fill({ type: 'none' })))).toBe(2);
    expect(undrawnFillCount(layerWith(shapes, fill()))).toBe(0);
    expect(undrawnFillCount(layerWith(shapes, null, { drawOutline: true }))).toBe(0);
  });
});
