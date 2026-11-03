import { describe, expect, it } from 'vitest';
import {
  defaultSliceSettings,
  importSvg,
  lookAt,
  orthographic,
  perspective,
  projectChains,
  sliceMesh,
  sliceModel,
  sliceNormal,
  sliceSvg,
  type Mesh,
  type SliceSettings,
  type SliceView,
} from '../../src';

/** A cube from -1 to 1 on every axis, as 12 triangles. */
function cube(): Mesh {
  const v = (i: number) => [i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1] as const;
  // Each face as two triangles (corner indices: bit 0 = x, bit 1 = y, bit 2 = z).
  const faces = [
    [0, 1, 3, 2], // z = -1
    [4, 6, 7, 5], // z = +1
    [0, 4, 5, 1], // y = -1
    [2, 3, 7, 6], // y = +1
    [0, 2, 6, 4], // x = -1
    [1, 5, 7, 3], // x = +1
  ];
  const out: number[] = [];
  for (const [a, b, c, d] of faces)
    out.push(...v(a!), ...v(b!), ...v(c!), ...v(a!), ...v(c!), ...v(d!));
  return { positions: Float32Array.from(out) };
}

const s = (o: Partial<SliceSettings> = {}): SliceSettings => ({ ...defaultSliceSettings(), ...o });

/** Looking straight at the front (+z) face, flat projection. */
const front: SliceView = {
  view: lookAt({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 }),
  projection: orthographic(1.5, 1, 1, 10),
  aspect: 1,
};
/** From the front, a little to the right and above, with perspective. */
const corner: SliceView = {
  view: lookAt({ x: 3, y: 2, z: 4 }, { x: 0, y: 0, z: 0 }),
  projection: perspective(45, 1, 1, 20),
  aspect: 1,
};

describe('3D slicer', () => {
  it('cuts a cube into closed square loops, one per plane', () => {
    const chains = sliceMesh(cube(), 10, sliceNormal('y', 0));
    expect(chains).toHaveLength(10);
    for (const c of chains) {
      expect(c.closed).toBe(true);
      // A square: every point on the cube's sides, at the plane's height.
      const y = c.points[0]!.y;
      expect(c.points.every((p) => Math.abs(p.y - y) < 1e-9)).toBe(true);
      expect(c.points.every((p) => Math.abs(p.x) > 0.999 || Math.abs(p.z) > 0.999)).toBe(true);
    }
    // Planes sit mid-band: 10 bands across a 2-unit cube.
    expect(chains.map((c) => c.points[0]!.y).sort((a, b) => a - b)[0]).toBeCloseTo(-0.9);
  });

  it('tilt turns the planes', () => {
    expect(sliceNormal('y', 90).z).toBeCloseTo(1);
    const tilted = sliceMesh(cube(), 8, sliceNormal('y', 30));
    expect(tilted.length).toBeGreaterThan(0);
    for (const c of tilted) {
      const n = sliceNormal('y', 30);
      const d = c.points.map((p) => p.x * n.x + p.y * n.y + p.z * n.z);
      expect(Math.max(...d) - Math.min(...d)).toBeLessThan(1e-9); // flat in its plane
    }
  });

  it('full mesh: every loop, as a square seen face on', () => {
    const lines = projectChains(sliceMesh(cube(), 5, sliceNormal('y', 0)), front);
    expect(lines).toHaveLength(5);
    // Seen from the front, each loop is a flat horizontal line 2 units wide (back over front).
    for (const l of lines) {
      const xs = l.points.map((p) => p.x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2 / 1.5);
    }
  });

  it('visible only: the back half of each loop is hidden', () => {
    const chains = sliceMesh(cube(), 5, sliceNormal('y', 0));
    const all = projectChains(chains, corner);
    const seen = projectChains(chains, corner, cube());
    const length = (ls: typeof all) =>
      ls.reduce(
        (n, l) =>
          n +
          l.points.reduce((m, p, i) => {
            const q = l.points[(i + 1) % l.points.length]!;
            return i + 1 < l.points.length || l.closed ? m + Math.hypot(q.x - p.x, q.y - p.y) : m;
          }, 0),
        0,
      );
    // From a corner, two of the four sides of each loop face the camera: one line per loop.
    expect(seen).toHaveLength(5);
    expect(seen.every((l) => !l.closed)).toBe(true);
    const ratio = length(seen) / length(all);
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
  });

  it("visible only works when the model is bigger than the camera's frame", () => {
    // A narrow lens from close by: the cube spills well past the frame.
    const close: SliceView = {
      view: lookAt({ x: 1.8, y: 1.2, z: 2.4 }, { x: 0, y: 0, z: 0 }),
      projection: perspective(20, 1, 0.5, 20),
      aspect: 1,
    };
    const chains = sliceMesh(cube(), 5, sliceNormal('y', 0));
    const all = projectChains(chains, close);
    const seen = projectChains(chains, close, cube());
    const total = (ls: typeof all) =>
      ls.reduce((n, l) => n + l.points.length - 1 + (l.closed ? 1 : 0), 0);
    expect(seen.every((l) => !l.closed)).toBe(true);
    expect(total(seen)).toBeLessThan(total(all));
  });

  it('fits the result to the width in mm and writes an SVG that imports', () => {
    const r = sliceModel(cube(), s({ lines: 6, width: 120 }), corner);
    expect(r.width).toBe(120);
    expect(r.height).toBeGreaterThan(0);
    const xs = r.lines.flatMap((l) => l.points.map((p) => p.x));
    expect(Math.min(...xs)).toBeCloseTo(0);
    expect(Math.max(...xs)).toBeCloseTo(120);
    const doc = importSvg(sliceSvg(r, 'cube'));
    expect(doc.width).toBeCloseTo(120);
    expect(doc.layers.flatMap((l) => l.strokes)).toHaveLength(r.lines.length);
  });

  it('an empty mesh gives nothing', () => {
    expect(sliceModel({ positions: new Float32Array() }, s(), front).lines).toEqual([]);
  });
});
