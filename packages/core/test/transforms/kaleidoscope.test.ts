import { describe, expect, it } from 'vitest';
import {
  applyTransforms,
  applyTransformsWithGuide,
  createLayer,
  createStep,
  kaleidoscope,
  kaleidoscopeSourcePoint,
  MAX_KALEIDOSCOPE_POINTS,
  processDocument,
  removeDuplicateSegments,
  defaultPageSetup,
  type PlotDocument,
  type Polyline,
} from '../../src';

type P = Record<string, number | string | boolean>;
const line = (x1: number, y1: number, x2: number, y2: number): Polyline => ({
  points: [
    { x: x1, y: y1 },
    { x: x2, y: y2 },
  ],
  closed: false,
});
/** A 100 × 100 artwork: center (50, 50), so the kaleidoscope radius is 50. */
const doc = (strokes: Polyline[]): PlotDocument => {
  const l = createLayer('a', 'A');
  l.strokes = [line(0, 0, 0, 100), line(100, 0, 100, 100), ...strokes]; // sets the bounds
  return { width: 100, height: 100, layers: [l], warnings: [] };
};
const run = (d: PlotDocument, params: P = {}) => {
  const s = createStep('kaleidoscope');
  return applyTransforms(d, [{ ...s, params: { ...s.params, ...params } }]);
};
const all = (d: PlotDocument) => d.layers.flatMap((l) => l.strokes);
const dist = (p: { x: number; y: number }) => Math.hypot(p.x - 50, p.y - 50);

describe('kaleidoscope (GEN-1)', () => {
  it('cuts a wedge and repeats it, staying inside the circle', () => {
    // A chord across the top of wedge 0 (which points up).
    const out = run(doc([line(0, 20, 100, 20)]));
    const pieces = all(out);
    expect(pieces).toHaveLength(8);
    for (const s of pieces) for (const p of s.points) expect(dist(p)).toBeLessThanOrEqual(50.001);
  });

  it('is seamless: mirrored pieces meet at the wedge edges', () => {
    const out = run(doc([line(0, 20, 100, 20), line(30, 0, 90, 40)]));
    const ends = all(out).flatMap((s) => [s.points[0]!, s.points[s.points.length - 1]!]);
    // Ends on the wedge edges (not the rim, and not the frame lines) each meet a mirrored twin.
    const seamEnds = ends.filter((e) => dist(e) < 49.9);
    expect(seamEnds.length).toBeGreaterThan(8);
    for (const e of seamEnds) {
      const twins = ends.filter((q) => Math.hypot(q.x - e.x, q.y - e.y) < 1e-9);
      expect(twins.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('turns without mirroring, and rounds odd counts up when mirroring', () => {
    const d = doc([line(0, 20, 100, 20)]);
    expect(all(run(d, { segments: 5, mirror: false }))).toHaveLength(5);
    expect(all(run(d, { segments: 5, mirror: true }))).toHaveLength(6);
  });

  it('center and zoom choose what goes in the wedge', () => {
    const d = doc([]);
    const p = (params: P, q: { x: number; y: number }) =>
      kaleidoscopeSourcePoint(d, { zoom: 100, centerX: 0, centerY: 0, angle: 0, ...params }, q)!;
    // The chosen center lands on the kaleidoscope's center.
    const c = p({ centerX: 20, centerY: -10 }, { x: 70, y: 40 });
    expect(c.x).toBeCloseTo(50);
    expect(c.y).toBeCloseTo(50);
    // 200% zoom: 10 mm from the center becomes 20 mm.
    const z = p({ zoom: 200 }, { x: 60, y: 50 });
    expect(z.x).toBeCloseTo(70);
  });

  it('squeeze bends the whole artwork in: top edge on the rim, bottom at the center', () => {
    const out = run(doc([line(0, 0, 100, 0), line(0, 100, 100, 100)]), { source: 'squeeze' });
    const pts = all(out).flatMap((s) => s.points);
    const rim = pts.filter((p) => Math.abs(dist(p) - 50) < 1e-6);
    const center = pts.filter((p) => dist(p) < 1e-6);
    expect(rim.length).toBeGreaterThan(100); // the top edge, densified into arcs
    expect(center.length).toBeGreaterThan(0);
    for (const p of pts) expect(dist(p)).toBeLessThanOrEqual(50.001);
  });

  it('the guide moves the artwork by exactly the dragged distance', () => {
    const d = doc([]);
    const params: P = { zoom: 150, centerX: 10, centerY: -5, angle: 30 };
    const g = kaleidoscope.guide!(d, params)!;
    const [a, b, c, e] = g.drag.perMm;
    const [dx, dy] = [3, -2];
    const moved: P = {
      ...params,
      centerX: (params['centerX'] as number) + a * dx + b * dy,
      centerY: (params['centerY'] as number) + c * dx + e * dy,
    };
    const q = { x: 40, y: 30 };
    const before = kaleidoscopeSourcePoint(d, params, q)!;
    const after = kaleidoscopeSourcePoint(d, moved, q)!;
    expect(after.x - before.x).toBeCloseTo(dx);
    expect(after.y - before.y).toBeCloseTo(dy);
    expect(g.outline[0]).toEqual({ x: 50, y: 50 });
    // The artwork, where it sits: q lands where the source matrix puts it.
    expect(g.source).toHaveLength(2); // the artwork's two frame lines
    const corner = kaleidoscopeSourcePoint(d, params, { x: 0, y: 0 })!;
    expect(g.source![0]!.points[0]!.x).toBeCloseTo(corner.x);
    expect(g.source![0]!.points[0]!.y).toBeCloseTo(corner.y);
  });

  it('only the last transform offers its guide, mapped onto the page', () => {
    const d = doc([line(0, 20, 100, 20)]);
    const k = createStep('kaleidoscope');
    expect(applyTransformsWithGuide(d, [k]).guide?.stepId).toBe(k.id);
    expect(applyTransformsWithGuide(d, [k, createStep('tile')]).guide).toBeNull();
    const r = processDocument({
      doc: d,
      page: defaultPageSetup(),
      bed: { width: 430, height: 297 },
      transforms: [k],
    });
    const apex = r.guide!.outline[0]!;
    const placedApex = {
      x: r.placement[0] * 50 + r.placement[2] * 50 + r.placement[4],
      y: r.placement[1] * 50 + r.placement[3] * 50 + r.placement[5],
    };
    expect(apex.x).toBeCloseTo(placedApex.x);
    expect(apex.y).toBeCloseTo(placedApex.y);
  });

  it('keeps the page placement still while the artwork moves, even out of the wedge', () => {
    const d = doc([line(0, 20, 100, 20)]);
    const place = (params: P) => {
      const k = createStep('kaleidoscope');
      return processDocument({
        doc: d,
        page: defaultPageSetup(),
        bed: { width: 430, height: 297 },
        transforms: [{ ...k, params: { ...k.params, ...params } }],
      }).placement;
    };
    const base = place({});
    expect(place({ centerX: 30, zoom: 300 })).toEqual(base);
    expect(place({ centerY: 100 })).toEqual(base); // nothing left in the wedge
    // A later transform works from the drawn bounds, not the kaleidoscope's frame.
    const out = applyTransforms(d, [createStep('kaleidoscope'), createStep('tile')]);
    expect(out.frame).toBeUndefined();
  });

  it('lines on a mirror seam are drawn once after duplicate removal', () => {
    // A line along wedge 0's right edge: every mirror seam gets it from both sides.
    const a = ((-90 + 22.5) * Math.PI) / 180;
    const edge = line(50, 50, 50 + 40 * Math.cos(a), 50 + 40 * Math.sin(a));
    const out = run(doc([edge]));
    const onSeams = all(out).filter((s) => dist(s.points[0]!) < 1e-6 || dist(s.points[1]!) < 1e-6);
    expect(onSeams.length).toBe(8); // each seam twice
    expect(removeDuplicateSegments(onSeams, 0.01).length).toBe(4);
  });

  it('caps the output with a warning', () => {
    const n = Math.ceil(MAX_KALEIDOSCOPE_POINTS / 4);
    const pts = Array.from({ length: n }, (_, i) => ({
      x: 49 + (i % 2) * 2,
      y: 10 + (i / n) * 30,
    }));
    const out = run(doc([{ points: pts, closed: false }]));
    expect(out.warnings.some((w) => w.startsWith('Kaleidoscope stopped'))).toBe(true);
  });
});
