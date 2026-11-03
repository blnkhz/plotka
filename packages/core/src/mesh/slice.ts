import type { Polyline } from '../model';
import type { Vec2 } from '../geometry/vec2';

/**
 * 3D slicer: a mesh is cut by evenly spaced parallel planes, and the cuts are drawn as seen by a
 * camera, either all of them or only the parts nothing is in front of. Pure maths: the app reads
 * the model files and runs the 3D view; this takes triangles and camera matrices.
 */

export type Vec3 = { x: number; y: number; z: number };

/** Triangles as a flat list of coordinates: 9 numbers (three corners) per triangle. */
export type Mesh = { positions: Float32Array };

export type SliceAxis = 'x' | 'y' | 'z';

export type SliceSettings = {
  /** Number of planes. */
  lines: number;
  /** The planes' normal: Y gives horizontal slices. */
  axis: SliceAxis;
  /** Tilts the planes towards the next axis (Y→Z, Z→X, X→Y), degrees. */
  tilt: number;
  /** Only the parts of the lines nothing is in front of, or every line. */
  mode: 'visible' | 'full';
  projection: 'perspective' | 'orthographic';
  /** Width of the result on paper, mm. */
  width: number;
};

export const defaultSliceSettings = (): SliceSettings => ({
  lines: 60,
  axis: 'y',
  tilt: 0,
  mode: 'visible',
  projection: 'perspective',
  width: 150,
});

/** Column-major 4 × 4 matrices, as Three.js keeps them. */
export type Mat4 = ArrayLike<number>;

/** How the camera sees the model: view and projection matrices, and the view's width / height. */
export type SliceView = { view: Mat4; projection: Mat4; aspect: number };

const DEG = Math.PI / 180;

/** The planes' normal for these settings. */
export function sliceNormal(axis: SliceAxis, tilt: number): Vec3 {
  const c = Math.cos(tilt * DEG);
  const s = Math.sin(tilt * DEG);
  if (axis === 'x') return { x: c, y: s, z: 0 };
  if (axis === 'y') return { x: 0, y: c, z: s };
  return { x: s, y: 0, z: c };
}

export type Chain = { points: Vec3[]; closed: boolean };

/** Cuts the mesh with `lines` evenly spaced planes; the cuts joined into chains, plane by plane. */
export function sliceMesh(mesh: Mesh, lines: number, normal: Vec3): Chain[] {
  const p = mesh.positions;
  const n = Math.floor(p.length / 9);
  if (!n || lines < 1) return [];
  const dot = (i: number) => p[i]! * normal.x + p[i + 1]! * normal.y + p[i + 2]! * normal.z;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n * 9; i += 3) {
    const d = dot(i);
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  const step = (hi - lo) / lines;
  if (!(step > 0)) return [];
  // Planes sit in the middle of equal bands, never exactly on the model's ends.
  const offset = (k: number) => lo + (k + 0.5) * step;

  const segments: { a: Vec3; b: Vec3; ka: string; kb: string }[][] = Array.from(
    { length: lines },
    () => [],
  );
  const corner = (i: number): Vec3 => ({ x: p[i]!, y: p[i + 1]!, z: p[i + 2]! });
  for (let t = 0; t < n; t++) {
    const i = t * 9;
    const v = [corner(i), corner(i + 3), corner(i + 6)];
    const d = [dot(i), dot(i + 3), dot(i + 6)];
    const tmin = Math.min(d[0]!, d[1]!, d[2]!);
    const tmax = Math.max(d[0]!, d[1]!, d[2]!);
    const k0 = Math.max(0, Math.ceil((tmin - lo) / step - 0.5));
    const k1 = Math.min(lines - 1, Math.floor((tmax - lo) / step - 0.5));
    for (let k = k0; k <= k1; k++) {
      const o = offset(k);
      const pts: { q: Vec3; key: string }[] = [];
      for (let e = 0; e < 3; e++) {
        let a = e;
        let b = (e + 1) % 3;
        // Above or below the plane (on it counts as above), so a triangle crosses on 0 or 2 edges.
        if (d[a]! >= o === d[b]! >= o) continue;
        // Same order for both triangles that share this edge, so they get the same point.
        if (before(v[b]!, v[a]!)) [a, b] = [b, a];
        const u = (o - d[a]!) / (d[b]! - d[a]!);
        const q = {
          x: v[a]!.x + (v[b]!.x - v[a]!.x) * u,
          y: v[a]!.y + (v[b]!.y - v[a]!.y) * u,
          z: v[a]!.z + (v[b]!.z - v[a]!.z) * u,
        };
        pts.push({ q, key: `${q.x},${q.y},${q.z}` });
      }
      if (pts.length === 2 && pts[0]!.key !== pts[1]!.key)
        segments[k]!.push({ a: pts[0]!.q, b: pts[1]!.q, ka: pts[0]!.key, kb: pts[1]!.key });
    }
  }
  return segments.flatMap(joinSegments);
}

const before = (a: Vec3, b: Vec3) =>
  a.x !== b.x ? a.x < b.x : a.y !== b.y ? a.y < b.y : a.z < b.z;

/** Joins segments that share ends into chains. */
function joinSegments(segs: { a: Vec3; b: Vec3; ka: string; kb: string }[]): Chain[] {
  const at = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const k of [s.ka, s.kb]) {
      const list = at.get(k);
      if (list) list.push(i);
      else at.set(k, [i]);
    }
  });
  const used = new Uint8Array(segs.length);
  const chains: Chain[] = [];
  /** Walks from `key` along unused segments, adding points. */
  const walk = (key: string, out: Vec3[], keys: string[]) => {
    for (;;) {
      const next = at.get(key)?.find((i) => !used[i]);
      if (next === undefined) return;
      used[next] = 1;
      const s = segs[next]!;
      const [q, k] = s.ka === key ? [s.b, s.kb] : [s.a, s.ka];
      out.push(q);
      keys.push(k);
      key = k;
    }
  };
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const s = segs[i]!;
    const fwd: Vec3[] = [s.b];
    const fwdKeys = [s.kb];
    walk(s.kb, fwd, fwdKeys);
    const closed = fwdKeys[fwdKeys.length - 1] === s.ka;
    if (closed) {
      fwd.pop();
      chains.push({ points: [s.a, ...fwd], closed: true });
      continue;
    }
    const back: Vec3[] = [];
    walk(s.ka, back, []);
    chains.push({ points: [...back.reverse(), s.a, ...fwd], closed: false });
  }
  return chains;
}

/** Multiplies two column-major 4 × 4 matrices (a × b). */
function mul(a: Mat4, b: Mat4): number[] {
  const out = new Array<number>(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let v = 0;
      for (let k = 0; k < 4; k++) v += a[k * 4 + r]! * b[c * 4 + k]!;
      out[c * 4 + r] = v;
    }
  return out;
}

/** A point on screen: x right, y down, both in units of half the view's height; z is depth. */
type Screen = { x: number; y: number; z: number; ok: boolean };

function projector(view: SliceView) {
  const m = mul(view.projection, view.view);
  return (q: Vec3): Screen => {
    const w = m[3]! * q.x + m[7]! * q.y + m[11]! * q.z + m[15]!;
    const x = m[0]! * q.x + m[4]! * q.y + m[8]! * q.z + m[12]!;
    const y = m[1]! * q.x + m[5]! * q.y + m[9]! * q.z + m[13]!;
    const z = m[2]! * q.x + m[6]! * q.y + m[10]! * q.z + m[14]!;
    return { x: (x / w) * view.aspect, y: -y / w, z: z / w, ok: w > 1e-9 };
  };
}

/**
 * Depth buffer of the mesh as the camera sees it (smallest depth per pixel). It covers the whole
 * projected model, not just the camera's frame, so parts outside the frame are hidden properly.
 */
class DepthBuffer {
  readonly w: number;
  readonly h: number;
  readonly z: Float32Array;
  /** Pixels per screen unit. */
  readonly k: number;
  constructor(
    readonly x0: number,
    readonly y0: number,
    x1: number,
    y1: number,
    res: number,
  ) {
    this.k = res / Math.max(x1 - x0, y1 - y0, 1e-9);
    // A pixel of margin all round.
    this.w = Math.ceil((x1 - x0) * this.k) + 3;
    this.h = Math.ceil((y1 - y0) * this.k) + 3;
    this.z = new Float32Array(this.w * this.h).fill(Infinity);
  }
  px(s: Screen) {
    return { x: (s.x - this.x0) * this.k + 1, y: (s.y - this.y0) * this.k + 1 };
  }
  triangle(a: Screen, b: Screen, c: Screen) {
    const A = this.px(a);
    const B = this.px(b);
    const C = this.px(c);
    const area = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
    if (Math.abs(area) < 1e-12) return;
    const x0 = Math.max(0, Math.floor(Math.min(A.x, B.x, C.x)));
    const x1 = Math.min(this.w - 1, Math.ceil(Math.max(A.x, B.x, C.x)));
    const y0 = Math.max(0, Math.floor(Math.min(A.y, B.y, C.y)));
    const y1 = Math.min(this.h - 1, Math.ceil(Math.max(A.y, B.y, C.y)));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const wa = ((B.x - px) * (C.y - py) - (B.y - py) * (C.x - px)) / area;
        const wb = ((C.x - px) * (A.y - py) - (C.y - py) * (A.x - px)) / area;
        const wc = 1 - wa - wb;
        if (wa < 0 || wb < 0 || wc < 0) continue;
        const z = wa * a.z + wb * b.z + wc * c.z;
        const i = y * this.w + x;
        if (z < this.z[i]!) this.z[i] = z;
      }
  }
  /** The farthest of the nearest surfaces around a point (lenient, for lines on the surface). */
  around(s: Screen): number {
    const p = this.px(s);
    const cx = Math.floor(p.x);
    const cy = Math.floor(p.y);
    let far = -Infinity;
    for (let y = cy - 1; y <= cy + 1; y++)
      for (let x = cx - 1; x <= cx + 1; x++) {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return Infinity;
        const z = this.z[y * this.w + x]!;
        if (z > far) far = z;
      }
    return far;
  }
}

/** Depth buffer size (the projected model's longer side) in pixels, for hiding lines. */
const DEPTH_RES = 1200;

/**
 * The chains as the camera sees them, in screen units (x right, y down). With `mesh`, only the
 * parts nothing is in front of are kept.
 */
export function projectChains(chains: Chain[], view: SliceView, mesh?: Mesh): Polyline[] {
  const project = projector(view);
  if (!mesh) {
    return chains
      .map((c) => ({ points: c.points.map(project), closed: c.closed }))
      .filter((c) => c.points.every((s) => s.ok))
      .map((c) => ({ points: c.points.map(({ x, y }) => ({ x, y })), closed: c.closed }));
  }
  const p = mesh.positions;
  const corners: Screen[] = [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let zlo = Infinity;
  let zhi = -Infinity;
  for (let i = 0; i + 2 < p.length; i += 3) {
    const s = project({ x: p[i]!, y: p[i + 1]!, z: p[i + 2]! });
    corners.push(s);
    if (!s.ok) continue;
    x0 = Math.min(x0, s.x);
    y0 = Math.min(y0, s.y);
    x1 = Math.max(x1, s.x);
    y1 = Math.max(y1, s.y);
    zlo = Math.min(zlo, s.z);
    zhi = Math.max(zhi, s.z);
  }
  if (!(x1 > x0) || !(y1 > y0)) return [];
  const buf = new DepthBuffer(x0, y0, x1, y1, DEPTH_RES);
  for (let i = 0; i + 2 < corners.length; i += 3) {
    const a = corners[i]!;
    const b = corners[i + 1]!;
    const c = corners[i + 2]!;
    if (a.ok && b.ok && c.ok) buf.triangle(a, b, c);
  }
  const eps = Math.max(1e-6, (zhi - zlo) * 2e-3);
  const visible = (s: Screen) => s.z <= buf.around(s) + eps;
  // Half a depth pixel between samples, in screen units.
  const stepLen = 0.5 / buf.k;

  const out: Polyline[] = [];
  for (const chain of chains) {
    const pts = chain.points.map(project);
    if (!pts.every((s) => s.ok)) continue;
    const ring = chain.closed ? [...pts, pts[0]!] : pts;
    const runs: Vec2[][] = [];
    let run: Vec2[] | null = null;
    let allVisible = true;
    const startsVisible = visible(ring[0]!);
    for (let i = 0; i + 1 < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil(len / stepLen));
      for (let j = i === 0 ? 0 : 1; j <= steps; j++) {
        const t = j / steps;
        const s = {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          z: a.z + (b.z - a.z) * t,
          ok: true,
        };
        if (visible(s)) {
          // Keep only the run's ends and the chain's own corners; samples in between are
          // on straight segments.
          if (!run) runs.push((run = [{ x: s.x, y: s.y }]));
          else if (j === steps) run.push({ x: s.x, y: s.y });
        } else {
          allVisible = false;
          if (run) {
            const prev = {
              x: a.x + (b.x - a.x) * ((j - 1) / steps),
              y: a.y + (b.y - a.y) * ((j - 1) / steps),
            };
            const last = run[run.length - 1]!;
            if (last.x !== prev.x || last.y !== prev.y) run.push(prev);
            run = null;
          }
        }
      }
    }
    // A loop that starts in the middle of a visible stretch: its last run carries on into its
    // first, so join them into one line (one pen lift fewer).
    if (chain.closed && !allVisible && run && runs.length > 1 && startsVisible) {
      const last = runs.pop()!;
      runs[0] = [...last, ...runs[0]!.slice(1)];
    }
    if (allVisible && chain.closed)
      out.push({ points: pts.map(({ x, y }) => ({ x, y })), closed: true });
    else for (const r of runs) if (r.length >= 2) out.push({ points: r, closed: false });
  }
  return out;
}

export type SliceResult = { lines: Polyline[]; width: number; height: number };

/** Moves and scales lines so they start at (0, 0) and are `width` mm wide. */
export function fitToWidth(lines: Polyline[], width: number): SliceResult {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const l of lines)
    for (const q of l.points) {
      x0 = Math.min(x0, q.x);
      y0 = Math.min(y0, q.y);
      x1 = Math.max(x1, q.x);
      y1 = Math.max(y1, q.y);
    }
  if (!lines.length || !(x1 > x0)) return { lines: [], width, height: 0 };
  const k = width / (x1 - x0);
  return {
    lines: lines.map((l) => ({
      points: l.points.map((q) => ({ x: (q.x - x0) * k, y: (q.y - y0) * k })),
      closed: l.closed,
    })),
    width,
    height: (y1 - y0) * k,
  };
}

/** Slices the mesh and draws it as the camera sees it, in mm. */
export function sliceModel(mesh: Mesh, s: SliceSettings, view: SliceView): SliceResult {
  const chains = sliceMesh(mesh, Math.round(s.lines), sliceNormal(s.axis, s.tilt));
  return fitToWidth(projectChains(chains, view, s.mode === 'visible' ? mesh : undefined), s.width);
}

const f = (n: number) => String(Math.round(n * 1000) / 1000);

/** The lines as an SVG document in mm, ready to import or save. */
export function sliceSvg(r: SliceResult, title = '3D model'): string {
  const d = r.lines
    .map(
      (l) =>
        `M${f(l.points[0]!.x)} ${f(l.points[0]!.y)}` +
        l.points
          .slice(1)
          .map((q) => `L${f(q.x)} ${f(q.y)}`)
          .join('') +
        (l.closed ? 'Z' : ''),
    )
    .join('');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- Sliced in Plotka -->',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(r.width)}mm" height="${f(r.height)}mm" viewBox="0 0 ${f(r.width)} ${f(r.height)}">`,
    `  <title>${title.replace(/[<>&"]/g, '')}</title>`,
    `  <path d="${d}" fill="none" stroke="#000000" stroke-width="0.3" stroke-linecap="round" stroke-linejoin="round"/>`,
    '</svg>',
    '',
  ].join('\n');
}

// --- camera matrices, for tests and for code without Three.js ---

/** View matrix looking from `eye` at `target` (column-major). */
export function lookAt(eye: Vec3, target: Vec3, up: Vec3 = { x: 0, y: 1, z: 0 }): number[] {
  const sub = (a: Vec3, b: Vec3) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const norm = (a: Vec3) => {
    const l = Math.hypot(a.x, a.y, a.z) || 1;
    return { x: a.x / l, y: a.y / l, z: a.z / l };
  };
  const cross = (a: Vec3, b: Vec3) => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  });
  const dotp = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
  const z = norm(sub(eye, target));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return [
    x.x,
    y.x,
    z.x,
    0,
    x.y,
    y.y,
    z.y,
    0,
    x.z,
    y.z,
    z.z,
    0,
    -dotp(x, eye),
    -dotp(y, eye),
    -dotp(z, eye),
    1,
  ];
}

export function perspective(fovDeg: number, aspect: number, near: number, far: number): number[] {
  const t = 1 / Math.tan((fovDeg * DEG) / 2);
  const nf = 1 / (near - far);
  return [
    t / aspect,
    0,
    0,
    0,
    0,
    t,
    0,
    0,
    0,
    0,
    (far + near) * nf,
    -1,
    0,
    0,
    2 * far * near * nf,
    0,
  ];
}

/** Orthographic projection showing `halfHeight` above and below the centre. */
export function orthographic(halfHeight: number, aspect: number, near: number, far: number) {
  const r = halfHeight * aspect;
  const nf = 1 / (near - far);
  return [1 / r, 0, 0, 0, 0, 1 / halfHeight, 0, 0, 0, 0, 2 * nf, 0, 0, 0, (far + near) * nf, 1];
}
