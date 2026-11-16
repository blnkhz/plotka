import { describe, expect, it } from 'vitest';
import {
  applyFills,
  createLayer,
  hatchRegion,
  layerHatches,
  MAX_CONNECT_SPACINGS,
  type FillRegion,
  type HatchOptions,
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
const opts = (o: Partial<HatchOptions> = {}): HatchOptions => ({
  spacing: 1,
  angle: 0,
  inset: 0,
  connect: false,
  ...o,
});
const allPoints = (lines: Polyline[]) => lines.flatMap((l) => l.points);

/** Samples every segment densely and returns the sample points. */
function samples(lines: Polyline[], step = 0.05): Vec2[] {
  const out: Vec2[] = [];
  for (const l of lines)
    for (let i = 1; i < l.points.length; i++) {
      const a = l.points[i - 1]!;
      const b = l.points[i]!;
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
      for (let k = 0; k <= n; k++)
        out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
  return out;
}

describe('hatchRegion: lines (HATCH-1)', () => {
  it('fills a square with lines on a half-spacing offset grid', () => {
    const lines = hatchRegion({ outer: [rect(0, 0, 10, 10)], fillRule: 'nonzero' }, opts());
    expect(lines).toHaveLength(10);
    expect(lines.map((l) => l.points[0]!.y)).toEqual([
      0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5,
    ]);
    for (const l of lines) {
      const xs = l.points.map((p) => p.x).sort((a, b) => a - b);
      expect(xs[0]).toBeCloseTo(0);
      expect(xs[1]).toBeCloseTo(10);
    }
  });

  it('a square with a hole produces no lines inside the hole (evenodd)', () => {
    const region: FillRegion = {
      outer: [rect(0, 0, 30, 30), rect(10, 10, 10, 10)],
      fillRule: 'evenodd',
    };
    for (const angle of [0, 30, 45, 90, 137]) {
      const pts = samples(hatchRegion(region, opts({ angle, spacing: 0.7 })));
      expect(pts.length).toBeGreaterThan(0);
      for (const p of pts)
        expect(p.x > 10 + 1e-6 && p.x < 20 - 1e-6 && p.y > 10 + 1e-6 && p.y < 20 - 1e-6).toBe(
          false,
        );
    }
  });

  it('nonzero: hole only when the inner ring winds the other way', () => {
    const same: FillRegion = {
      outer: [rect(0, 0, 30, 30), rect(10, 10, 10, 10)],
      fillRule: 'nonzero',
    };
    const opposite: FillRegion = {
      outer: [rect(0, 0, 30, 30), rect(10, 10, 10, 10, true)],
      fillRule: 'nonzero',
    };
    const inHole = (r: FillRegion) =>
      samples(hatchRegion(r, opts())).some((p) => p.x > 11 && p.x < 19 && p.y > 11 && p.y < 19);
    expect(inHole(same)).toBe(true);
    expect(inHole(opposite)).toBe(false);
  });

  it('angle rotates the lines', () => {
    const lines = hatchRegion(
      { outer: [rect(0, 0, 10, 10)], fillRule: 'nonzero' },
      opts({ angle: 90 }),
    );
    for (const l of lines) expect(l.points[0]!.x).toBeCloseTo(l.points[1]!.x);
    const diag = hatchRegion(
      { outer: [rect(0, 0, 10, 10)], fillRule: 'nonzero' },
      opts({ angle: 45 }),
    );
    for (const l of diag) {
      const [a, b] = l.points as [Vec2, Vec2];
      // y is down, so +45° goes down-right
      expect(Math.abs((b.y - a.y) / (b.x - a.x) - 1)).toBeLessThan(1e-9);
    }
  });

  it('spacing sets line density', () => {
    const n = (spacing: number) =>
      hatchRegion({ outer: [rect(0, 0, 10, 10)], fillRule: 'nonzero' }, opts({ spacing })).length;
    expect(n(0.5)).toBe(20);
    expect(n(2)).toBe(5);
  });

  it('inset keeps every hatch point at least inset from the outline', () => {
    const region: FillRegion = {
      outer: [
        [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 10, y: 15 },
        ],
      ],
      fillRule: 'nonzero',
    };
    const inset = 1.5;
    const lines = hatchRegion(region, opts({ inset, spacing: 0.5, angle: 20 }));
    expect(lines.length).toBeGreaterThan(5);
    const ring = region.outer[0]!;
    for (const p of allPoints(lines)) {
      let d = Infinity;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const t = Math.max(
          0,
          Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)),
        );
        d = Math.min(d, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
      }
      expect(d).toBeGreaterThanOrEqual(inset - 1e-6);
    }
  });

  it('inset larger than the shape leaves nothing', () => {
    expect(
      hatchRegion({ outer: [rect(0, 0, 4, 4)], fillRule: 'nonzero' }, opts({ inset: 2.5 })),
    ).toEqual([]);
  });

  it('lines sit on a global grid, so neighbors line up', () => {
    const a = hatchRegion({ outer: [rect(0, 0.2, 5, 5)], fillRule: 'nonzero' }, opts());
    const b = hatchRegion({ outer: [rect(6, 0.7, 5, 5)], fillRule: 'nonzero' }, opts());
    const ys = (ls: Polyline[]) => new Set(ls.map((l) => l.points[0]!.y));
    const shared = [...ys(a)].filter((y) => ys(b).has(y));
    expect(shared.length).toBeGreaterThan(3);
  });
});

describe('crosshatch (HATCH-2)', () => {
  it('two passes; second defaults to angle + 90 and is editable', () => {
    const layer = createLayer('l', 'L');
    layer.fills.push({ outer: [rect(0, 0, 10, 10)], fillRule: 'nonzero' });
    layer.settings.fill = { type: 'crosshatch', spacing: 1, angle: 0, inset: 0, connect: false };
    const lines = layerHatches(layer);
    const horizontal = lines.filter((l) => Math.abs(l.points[0]!.y - l.points[1]!.y) < 1e-9);
    const vertical = lines.filter((l) => Math.abs(l.points[0]!.x - l.points[1]!.x) < 1e-9);
    expect(horizontal).toHaveLength(10);
    expect(vertical).toHaveLength(10);

    layer.settings.fill.crossAngle = 45;
    const diag = layerHatches(layer).filter((l) => {
      const [a, b] = l.points as [Vec2, Vec2];
      return Math.abs(Math.abs(b.y - a.y) - Math.abs(b.x - a.x)) < 1e-9 && a.x !== b.x;
    });
    expect(diag.length).toBeGreaterThan(5);
  });
});

describe('connect / zigzag (HATCH-3)', () => {
  const check = (region: FillRegion, o: Partial<HatchOptions>) => {
    const lines = hatchRegion(region, opts({ connect: true, ...o }));
    // Every point on every connected chain must be inside the region (sampled).
    const unconnected = hatchRegion(region, opts({ ...o, connect: false }));
    return { lines, unconnected };
  };

  it('a convex shape becomes one pen-down chain', () => {
    const { lines } = check({ outer: [rect(0, 0, 10, 10)], fillRule: 'nonzero' }, {});
    expect(lines).toHaveLength(1);
    expect(lines[0]!.points).toHaveLength(20);
  });

  it('does not jump across a gap (U shape)', () => {
    // U: two 4mm wide arms joined at the bottom, open at the top.
    const u: Vec2[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 16 },
      { x: 10, y: 16 },
      { x: 10, y: 0 },
      { x: 14, y: 0 },
      { x: 14, y: 20 },
      { x: 0, y: 20 },
    ];
    const region: FillRegion = { outer: [u], fillRule: 'nonzero' };
    const { lines } = check(region, { spacing: 0.5 });
    expect(lines.length).toBeGreaterThan(1);
    for (const p of samples(lines)) {
      const inGap = p.x > 4 + 1e-6 && p.x < 10 - 1e-6 && p.y < 16 - 1e-6;
      expect(inGap).toBe(false);
    }
  });

  it('does not cross a hole', () => {
    const region: FillRegion = {
      outer: [rect(0, 0, 20, 20), rect(5, 5, 10, 10)],
      fillRule: 'evenodd',
    };
    const { lines } = check(region, { spacing: 0.5, angle: 0 });
    for (const p of samples(lines)) {
      expect(p.x > 5 + 1e-6 && p.x < 15 - 1e-6 && p.y > 5 + 1e-6 && p.y < 15 - 1e-6).toBe(false);
    }
  });

  it('connectors respect the inset', () => {
    const region: FillRegion = { outer: [rect(0, 0, 10, 10)], fillRule: 'nonzero' };
    const { lines } = check(region, { inset: 1, spacing: 0.5, angle: 30 });
    for (const p of samples(lines)) {
      expect(p.x).toBeGreaterThanOrEqual(1 - 1e-6);
      expect(p.x).toBeLessThanOrEqual(9 + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(1 - 1e-6);
      expect(p.y).toBeLessThanOrEqual(9 + 1e-6);
    }
  });

  it('never makes connectors longer than the cap', () => {
    // A shallow sawtooth bottom makes long steps between rows.
    const region: FillRegion = {
      outer: [
        [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 1 },
          { x: 0, y: 3 },
        ],
      ],
      fillRule: 'nonzero',
    };
    const spacing = 0.5;
    const { lines } = check(region, { spacing });
    for (const l of lines)
      for (let i = 1; i < l.points.length; i += 2) {
        const a = l.points[i]!;
        const b = l.points[i + 1];
        if (b)
          expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThanOrEqual(
            MAX_CONNECT_SPACINGS * spacing + 1e-9,
          );
      }
  });

  it('lines with the pen kept down make one zigzag; without, one path per line', () => {
    const layer = createLayer('l', 'L');
    layer.fills.push({ outer: [rect(0, 0, 10, 10)], fillRule: 'nonzero' });
    layer.settings.fill = { type: 'lines', spacing: 1, angle: 0, inset: 0, connect: true };
    expect(layerHatches(layer)).toHaveLength(1);
    layer.settings.fill = { type: 'lines', spacing: 1, angle: 0, inset: 0, connect: false };
    expect(layerHatches(layer).length).toBeGreaterThan(5);
  });
});

describe('round turns', () => {
  const square: FillRegion = { outer: [rect(0, 0, 10, 10)], fillRule: 'nonzero' };
  const length = (l: Polyline) =>
    l.points
      .slice(1)
      .reduce((s, p, i) => s + Math.hypot(p.x - l.points[i]!.x, p.y - l.points[i]!.y), 0);

  it('keeps one chain with the same ends, and only cuts corners (shorter)', () => {
    const sharp = hatchRegion(square, opts({ connect: true }));
    const round = hatchRegion(square, opts({ connect: true, roundTurns: true }));
    expect(round).toHaveLength(1);
    expect(round[0]!.points.length).toBeGreaterThan(sharp[0]!.points.length);
    expect(round[0]!.points[0]).toEqual(sharp[0]!.points[0]);
    expect(round[0]!.points.at(-1)).toEqual(sharp[0]!.points.at(-1));
    expect(length(round[0]!)).toBeLessThan(length(sharp[0]!));
  });

  it('a level U-turn is about a half circle of half the spacing', () => {
    const [chain] = hatchRegion(square, opts({ connect: true, roundTurns: true }));
    // The first turn, at x = 10 between y = 0.5 and 1.5: centered at (9.5, 1), radius 0.5.
    const turn = chain!.points.filter((p) => p.x > 9.5 + 1e-9 && p.y > 0.5 && p.y < 1.5);
    expect(turn.length).toBeGreaterThan(2);
    // A cubic is a close (not exact) half circle: within 0.02 mm, far below a pen line.
    for (const p of turn) expect(Math.abs(Math.hypot(p.x - 9.5, p.y - 1) - 0.5)).toBeLessThan(0.02);
  });

  it('stays inside the shape and its inset, at any angle', () => {
    for (const angle of [0, 30, 45, 80]) {
      const lines = hatchRegion(square, opts({ connect: true, roundTurns: true, inset: 1, angle }));
      for (const p of samples(lines)) {
        expect(p.x).toBeGreaterThanOrEqual(1 - 1e-6);
        expect(p.x).toBeLessThanOrEqual(9 + 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(1 - 1e-6);
        expect(p.y).toBeLessThanOrEqual(9 + 1e-6);
      }
    }
  });

  it('does nothing without connect, and short lines are not overrun', () => {
    expect(hatchRegion(square, opts({ roundTurns: true }))).toEqual(hatchRegion(square, opts()));
    // A thin diamond: lines near the tips are shorter than the spacing.
    const diamond: FillRegion = {
      outer: [
        [
          { x: 5, y: 0 },
          { x: 6, y: 5 },
          { x: 5, y: 10 },
          { x: 4, y: 5 },
        ],
      ],
      fillRule: 'nonzero',
    };
    const lines = hatchRegion(diamond, opts({ connect: true, roundTurns: true, spacing: 0.8 }));
    for (const p of samples(lines)) {
      expect(p.x).toBeGreaterThanOrEqual(4 - 1e-6);
      expect(p.x).toBeLessThanOrEqual(6 + 1e-6);
    }
  });

  it('the layer setting reaches lines and crosshatch', () => {
    const layer = createLayer('l', 'L');
    layer.fills.push(square);
    const count = () => layerHatches(layer).reduce((n, l) => n + l.points.length, 0);
    for (const type of ['lines', 'crosshatch'] as const) {
      layer.settings.fill = { type, spacing: 1, angle: 0, inset: 0, connect: true };
      const sharp = count();
      layer.settings.fill = { ...layer.settings.fill, roundTurns: true };
      expect(count()).toBeGreaterThan(sharp);
    }
  });
});

describe('applyFills', () => {
  it('adds hatches to strokes only for layers with a fill', () => {
    const a = createLayer('a', 'A');
    a.fills.push({ outer: [rect(0, 0, 10, 10)], fillRule: 'nonzero' });
    a.settings.fill = { type: 'lines', spacing: 1, angle: 0, inset: 0, connect: false };
    const b = createLayer('b', 'B');
    b.fills.push({ outer: [rect(0, 0, 10, 10)], fillRule: 'nonzero' });
    const out = applyFills({ width: 10, height: 10, layers: [a, b], warnings: [] });
    expect(out.layers[0]!.strokes).toHaveLength(10);
    expect(out.layers[1]!.strokes).toHaveLength(0);
    expect(out.layers[0]!.fills).toHaveLength(1);
  });
});
