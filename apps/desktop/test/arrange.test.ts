import { describe, expect, it } from 'vitest';
import { createLayer, defaultPageSetup, placementMatrix, applyToPoint } from '@plotter-studio/core';
import {
  dragBox,
  dragFrame,
  frameCorners,
  frameHandleAt,
  frameMatrix,
  frameOf,
  frameOfBox,
  groupFrames,
  placementForFrame,
  snapAngle,
  handleAt,
  layerAt,
  snapBox,
  snapTargets,
  type Box,
} from '../src/renderer/src/lib/arrange';

const box = (minX: number, minY: number, maxX: number, maxY: number): Box => ({
  minX,
  minY,
  maxX,
  maxY,
});
const free = { keepRatio: false, fromCenter: false };
const ratio = { keepRatio: true, fromCenter: false };

describe('arrange: dragging handles', () => {
  const b = box(10, 10, 30, 20); // 20 × 10

  it('moves, and resizes from the opposite side', () => {
    expect(dragBox(b, 'move', 5, -3, free)).toEqual(box(15, 7, 35, 17));
    expect(dragBox(b, 'e', 10, 99, free)).toEqual(box(10, 10, 40, 20)); // edges: one axis
    expect(dragBox(b, 'nw', -10, -2, free)).toEqual(box(0, 8, 30, 20));
  });

  it('corners keep proportions unless freed, and Alt resizes around the center', () => {
    // Wider by 50% wins: 30 × 15, anchored at the top-left.
    expect(dragBox(b, 'se', 10, 1, ratio)).toEqual(box(10, 10, 40, 25));
    expect(dragBox(b, 'se', 10, 1, free)).toEqual(box(10, 10, 40, 21));
    expect(dragBox(b, 'e', 5, 0, { keepRatio: false, fromCenter: true })).toEqual(
      box(5, 10, 35, 20),
    );
  });

  it('never shrinks below half a millimeter or flips', () => {
    const tiny = dragBox(b, 'e', -100, 0, free);
    expect(tiny.maxX - tiny.minX).toBeCloseTo(0.5);
    expect(tiny.minX).toBe(10);
  });

  it('finds handles and the inside', () => {
    expect(handleAt(b, { x: 30.5, y: 20.4 }, 1)).toBe('se');
    expect(handleAt(b, { x: 20, y: 10 }, 1)).toBe('n');
    expect(handleAt(b, { x: 15, y: 15 }, 1)).toBe('move');
    expect(handleAt(b, { x: 50, y: 15 }, 1)).toBeNull();
  });
});

describe('arrange: snapping', () => {
  const page = defaultPageSetup(); // A4 portrait, 15 mm margins
  const t = snapTargets(page, [box(100, 100, 120, 130)]);

  it('a moved box snaps its edge or center to the margins, paper center and other boxes', () => {
    const near = box(16, 40, 36, 50); // left edge 1 mm from the margin
    const s = snapBox(near, near, 'move', t, 2, free);
    expect(s.box.minX).toBe(15);
    expect(s.guides.xs).toEqual([15]);
    // Its center 0.5 mm from the paper's center line (105).
    const c = box(85.5, 60, 125.5, 70);
    expect(snapBox(c, c, 'move', t, 2, free).box.minX).toBe(85);
    // Nothing near: unchanged, no guides.
    const far = box(50, 50, 60, 55);
    expect(snapBox(far, far, 'move', t, 1, free)).toEqual({ box: far, guides: { xs: [], ys: [] } });
  });

  it('resizing snaps only the moving edge; a proportional corner keeps its proportions', () => {
    const start = box(20, 20, 40, 30);
    const dragged = box(20, 20, 99.4, 30);
    expect(snapBox(dragged, start, 'e', t, 1, free).box).toEqual(box(20, 20, 100, 30));
    const corner = dragBox(start, 'se', 59.4, 0, ratio); // right edge at 99.4
    const s = snapBox(corner, start, 'se', t, 1, ratio).box;
    expect(s.maxX).toBeCloseTo(100);
    expect((s.maxX - s.minX) / (s.maxY - s.minY)).toBeCloseTo(2);
  });
});

describe('arrange: back to settings', () => {
  it('a layer placement puts the layer exactly at the dragged box', () => {
    const base = box(10, 10, 30, 20);
    const target = box(50, 5, 110, 35);
    const p = placementForFrame(base, frameOfBox(target), null);
    const m = placementMatrix(base, p);
    expect(applyToPoint(m, 10, 10)).toEqual({ x: 50, y: 5 });
    const q = applyToPoint(m, 30, 20);
    expect(q.x).toBeCloseTo(110);
    expect(q.y).toBeCloseTo(35);
  });
});

describe('arrange: picking a layer under the pointer', () => {
  it('finds lines within the tolerance and inside filled shapes, top layer first', () => {
    const a = createLayer('a', 'A');
    a.strokes.push({
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      closed: false,
    });
    const b = createLayer('b', 'B');
    b.fills.push({
      outer: [
        [
          { x: 40, y: -10 },
          { x: 60, y: -10 },
          { x: 60, y: 10 },
          { x: 40, y: 10 },
        ],
      ],
      fillRule: 'nonzero',
    });
    const boxes = { a: box(0, 0, 100, 0), b: box(40, -10, 60, 10) };
    expect(layerAt([a, b], boxes, { x: 10, y: 0.5 }, 1)).toBe('a');
    expect(layerAt([a, b], boxes, { x: 50, y: 5 }, 1)).toBe('b');
    expect(layerAt([a, b], boxes, { x: 50, y: 0 }, 1)).toBe('b'); // both: the top one
    expect(layerAt([a, b], boxes, { x: 10, y: 5 }, 1)).toBeNull();
  });
});

describe('arrange: turning (frames)', () => {
  const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
  };

  it("a layer's frame is exactly where the core puts its corners, turned or not", () => {
    const base = box(10, 10, 30, 20);
    for (const p of [
      { dx: 3, dy: -2, sx: 1.5, sy: 0.5 },
      { dx: 0, dy: 5, sx: 2, sy: 1, rot: 30 },
      { dx: -4, dy: 0, sx: 1, sy: 3, rot: -90 },
    ]) {
      const m = placementMatrix(base, p);
      const corners = [
        [10, 10],
        [30, 10],
        [30, 20],
        [10, 20],
      ].map(([x, y]) => applyToPoint(m, x!, y!));
      frameCorners(frameOf(base, p)).forEach((c, i) => near(c, corners[i]!));
      // And back: the frame gives the same placement.
      const again = placementForFrame(base, frameOf(base, p), null);
      expect(again).toEqual(p);
    }
  });

  it('frameMatrix takes one frame onto another, corner to corner', () => {
    const a = { cx: 10, cy: 20, w: 8, h: 4, rot: 15 };
    const b = { cx: -5, cy: 7, w: 16, h: 2, rot: 100 };
    const m = frameMatrix(a, b);
    const ca = frameCorners(a);
    frameCorners(b).forEach((c, i) => near(applyToPoint(m, ca[i]!.x, ca[i]!.y), c));
  });

  it('turning drags around the center; resizing a turned frame works along its own sides', () => {
    const f = { cx: 0, cy: 0, w: 20, h: 10, rot: 0 };
    // From straight right of the center to straight below it: a quarter turn clockwise.
    expect(dragFrame(f, 'rotate', { x: 10, y: 0 }, { x: 0, y: 10 }, free).rot).toBeCloseTo(90);
    // Turned 90°: its own right side faces down, so dragging the 'e' handle down widens it.
    const t = { ...f, rot: 90 };
    const r = dragFrame(t, 'e', { x: 0, y: 10 }, { x: 0, y: 16 }, free);
    expect(r.w).toBeCloseTo(26);
    expect(r.h).toBeCloseTo(10);
    expect(r.cy).toBeCloseTo(3); // grew from its far side
    expect(frameHandleAt(t, { x: 0, y: 10 }, 1, 5)).toBe('e');
    expect(frameHandleAt(f, { x: 0, y: -10 }, 1, 5)).toBe('rotate');
  });

  it('angles snap to quarter turns, or 15° steps with Shift, or not at all with Cmd', () => {
    expect(snapAngle(88, { step15: false, off: false })).toBe(90);
    expect(snapAngle(80, { step15: false, off: false })).toBe(80);
    expect(snapAngle(52, { step15: true, off: false })).toBe(45);
    expect(snapAngle(89, { step15: false, off: true })).toBe(89);
    expect(snapAngle(271, { step15: false, off: false })).toBe(-90);
  });

  it('a group turns and scales its layers together', () => {
    const members = {
      a: { cx: 10, cy: 0, w: 4, h: 2, rot: 0 },
      b: { cx: -10, cy: 0, w: 2, h: 2, rot: 90 },
    };
    const group = { cx: 0, cy: 0, w: 24, h: 2, rot: 0 };
    const turned = groupFrames(members, group, { ...group, rot: 90 });
    near({ x: turned['a']!.cx, y: turned['a']!.cy }, { x: 0, y: 10 });
    expect(turned['a']!.rot).toBeCloseTo(90);
    expect(turned['b']!.rot).toBeCloseTo(180);
    // Twice as wide, same height: layer a (level) gets wider; b (turned 90°) gets taller.
    const wider = groupFrames(members, group, { ...group, w: 48 });
    expect(wider['a']!.w).toBeCloseTo(8);
    expect(wider['a']!.cx).toBeCloseTo(20);
    expect(wider['b']!.h).toBeCloseTo(4);
    expect(wider['b']!.w).toBeCloseTo(2);
  });
});
