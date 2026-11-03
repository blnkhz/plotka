import { clipPolylinesToShape, offsetShape, type Shape } from '../geometry/polygon';
import type { Vec2 } from '../geometry/vec2';
import type { FillRegion, Polyline } from '../model';
import { seededRandom } from '../transforms/random';
import { MAX_CONNECT_SPACINGS } from './hatch';
import { insetArea } from './patterns';

/**
 * Waves and noise fills: parallel lines on the same global grid as Lines (rows at
 * (k + ½) · spacing across the angle, anchored at the paper origin, so neighboring shapes line
 * up), displaced sideways by a sine wave or smooth noise, then clipped to the inset area.
 */
export type WaveShape = 'sine' | 'triangle' | 'square';

export type WavyOptions = {
  kind: 'waves' | 'noise';
  spacing: number;
  /** Degrees: the direction the lines run. */
  angle: number;
  inset: number;
  connect: boolean;
  /** mm, the most a line moves sideways. */
  amplitude: number;
  /** Waves: mm per wave. */
  wavelength: number;
  /** Waves: degrees the wave shifts from one line to the next. */
  phase: number;
  /** Waves: smooth, zigzag or square. */
  shape?: WaveShape;
  /** Noise: mm, the size of the bumps. */
  noiseScale: number;
  seed: number;
  /** Allow amplitudes that make neighboring lines cross. */
  allowCross: boolean;
};

/** Steepest the noise gets (its largest slope, per unit), so its amplitude can be capped. */
export const NOISE_MAX_SLOPE = 3; // measured: about 2.76
/** Most points per line before clipping, so huge shapes can't hang the app. */
const MAX_ROW_POINTS = 5000;
const MAX_ROWS = 5000;

/**
 * The largest amplitude that keeps neighboring lines from crossing (Infinity if any is fine).
 * Waves: lines one spacing apart, shifted by `phase`, meet when 2A·|sin(phase/2)| reaches the
 * spacing. Noise: the offset between two lines changes at most by A · slope · spacing / scale.
 */
export function maxWavyAmplitude(
  o: Pick<WavyOptions, 'kind' | 'spacing' | 'phase' | 'noiseScale' | 'shape'>,
): number {
  if (o.kind === 'waves') {
    // How far apart two waves a phase φ apart get, per unit of amplitude: sine 2·sin(φ/2),
    // zigzag 2φ/π (it rises at 2/π per radian). Square: 2 always, since even in step its
    // upright steps (2A tall, at the same x on every line) would overlap the next line's.
    // The shift between neighboring lines, the short way round: 0..π.
    const d = ((((o.phase * Math.PI) / 180) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const shift = Math.min(d, 2 * Math.PI - d);
    const gap =
      o.shape === 'square'
        ? 2
        : o.shape === 'triangle'
          ? (2 * shift) / Math.PI
          : 2 * Math.sin(shift / 2);
    return gap < 1e-9 ? Infinity : o.spacing / gap;
  }
  return Math.max(0, o.noiseScale) / NOISE_MAX_SLOPE;
}

export function wavyFill(region: FillRegion, o: WavyOptions): Polyline[] {
  if (!(o.spacing > 0)) return [];
  const area = insetArea(region, o.inset);
  if (!area.length) return [];
  const amp = Math.max(
    0,
    o.allowCross ? o.amplitude : Math.min(o.amplitude, maxWavyAmplitude(o) * 0.95),
  );

  // Local frame: lines along +x.
  const rad = (o.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const toLocal = (p: Vec2) => ({ x: p.x * cos + p.y * sin, y: -p.x * sin + p.y * cos });
  const toWorld = (x: number, y: number): Vec2 => ({ x: x * cos - y * sin, y: x * sin + y * cos });
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of area)
    for (const p of ring) {
      const q = toLocal(p);
      minX = Math.min(minX, q.x);
      maxX = Math.max(maxX, q.x);
      minY = Math.min(minY, q.y);
      maxY = Math.max(maxY, q.y);
    }

  // Rows whose displaced line can reach the area.
  const k0 = Math.ceil((minY - amp) / o.spacing - 0.5);
  const k1 = Math.min(k0 + MAX_ROWS, Math.floor((maxY + amp) / o.spacing - 0.5));
  const feature = o.kind === 'waves' ? o.wavelength / 24 : o.noiseScale / 12;
  const step = Math.max(
    (maxX - minX) / MAX_ROW_POINTS,
    Math.min(Math.max(feature, 0.02), Math.max(o.spacing, 0.05)),
  );
  // Start on a global grid too, so neighboring shapes sample the same points.
  const x0 = Math.floor(minX / step) * step;
  const noise = o.kind === 'noise' ? perlin(o.seed) : null;
  const k = (2 * Math.PI) / Math.max(o.wavelength, 1e-3);
  const offset = (x: number, y: number, row: number) =>
    noise
      ? amp * noise(x / Math.max(o.noiseScale, 1e-3), y / Math.max(o.noiseScale, 1e-3))
      : amp * Math.sin(k * x + (row * o.phase * Math.PI) / 180);

  const shape = o.kind === 'waves' ? (o.shape ?? 'sine') : 'sine';
  const rows: Polyline[][] = [];
  for (let row = k0; row <= k1; row++) {
    const y = (row + 0.5) * o.spacing;
    const pts: Vec2[] =
      shape === 'sine'
        ? []
        : sharpWave(shape, x0, maxX + step, k, (row * o.phase * Math.PI) / 180, amp).map((p) =>
            toWorld(p.x, y + p.y),
          );
    if (shape === 'sine')
      for (let x = x0; x <= maxX + step; x += step) pts.push(toWorld(x, y + offset(x, y, row)));
    // Pieces left to right (Clipper may return them either way).
    const pieces = clipPolylinesToShape([{ points: pts, closed: false }], area, 'inside')
      .map((p) => {
        const a = toLocal(p.points[0]!).x;
        const b = toLocal(p.points[p.points.length - 1]!).x;
        return a <= b ? p : { ...p, points: [...p.points].reverse() };
      })
      .sort((a, b) => toLocal(a.points[0]!).x - toLocal(b.points[0]!).x);
    rows.push(pieces);
  }
  return o.connect ? connect(rows, area, o.spacing) : serpentine(rows);
}

/**
 * A zigzag or square wave from x0 to x1, exactly: only its corners (a square wave's steps are
 * two points at the same x). Waves go through phase 0 rising, like the sine.
 */
function sharpWave(
  shape: 'triangle' | 'square',
  x0: number,
  x1: number,
  k: number,
  phase: number,
  amp: number,
): Vec2[] {
  const at = (x: number) => {
    const t = k * x + phase;
    return shape === 'triangle'
      ? ((2 * amp) / Math.PI) * Math.asin(Math.sin(t))
      : Math.sin(t) >= 0
        ? amp
        : -amp;
  };
  // Corners: zigzag peaks at t = π/2 + nπ, square steps at t = nπ.
  const first = shape === 'triangle' ? Math.PI / 2 : 0;
  const n0 = Math.ceil((k * x0 + phase - first) / Math.PI);
  const n1 = Math.floor((k * x1 + phase - first) / Math.PI);
  const pts: Vec2[] = [{ x: x0, y: at(x0) }];
  for (let n = n0; n <= n1 && pts.length < 20000; n++) {
    const x = (first + n * Math.PI - phase) / k;
    if (x <= x0 || x >= x1) continue;
    if (shape === 'triangle') pts.push({ x, y: n % 2 === 0 ? amp : -amp });
    else {
      // Going up at even n (sin turns positive), down at odd n.
      const up = n % 2 === 0;
      pts.push({ x, y: up ? -amp : amp }, { x, y: up ? amp : -amp });
    }
  }
  pts.push({ x: x1, y: at(x1) });
  return pts;
}

/** Every other row runs backwards, so the pen zigzags even with lifts. */
const serpentine = (rows: Polyline[][]): Polyline[] =>
  rows.flatMap((pieces, i) =>
    i % 2 === 0
      ? pieces
      : [...pieces].reverse().map((p) => ({ ...p, points: [...p.points].reverse() })),
  );

/**
 * Joins pieces on neighboring rows pen-down, like Lines with "Keep pen down": greedy chains that
 * step to the next row's nearest piece end when the join is short and stays inside the area.
 */
function connect(rows: Polyline[][], area: Shape, spacing: number): Polyline[] {
  const used = rows.map((r) => r.map(() => false));
  const out: Polyline[] = [];
  const maxLen = MAX_CONNECT_SPACINGS * spacing + spacing;
  // A hair bigger, so a join running along the edge (the pen draws on the outline) counts.
  const grown = offsetShape(area, 0.01);
  const inside = (a: Vec2, b: Vec2) =>
    clipPolylinesToShape([{ points: [a, b], closed: false }], grown, 'outside').every(
      (p) => length(p) < 1e-3,
    );
  for (let r = 0; r < rows.length; r++)
    for (let i = 0; i < rows[r]!.length; i++) {
      if (used[r]![i]) continue;
      used[r]![i] = true;
      let forward = r % 2 === 0;
      const first = rows[r]![i]!.points;
      const chain = forward ? [...first] : [...first].reverse();
      for (let nr = r + 1; nr < rows.length; nr++) {
        const end = chain[chain.length - 1]!;
        let best = -1;
        let bestDist = Infinity;
        rows[nr]!.forEach((p, j) => {
          if (used[nr]![j]) return;
          // The next row runs the other way: it starts at its end nearest to here.
          const s = forward ? p.points[p.points.length - 1]! : p.points[0]!;
          const d = Math.hypot(s.x - end.x, s.y - end.y);
          if (d < bestDist) {
            bestDist = d;
            best = j;
          }
        });
        if (best === -1 || bestDist > maxLen) break;
        const pts = rows[nr]![best]!.points;
        const next = forward ? [...pts].reverse() : pts;
        if (!inside(end, next[0]!)) break;
        used[nr]![best] = true;
        chain.push(...next);
        forward = !forward;
      }
      out.push({ points: chain, closed: false });
    }
  return out;
}

const length = (p: Polyline) => {
  let d = 0;
  for (let i = 1; i < p.points.length; i++)
    d += Math.hypot(p.points[i]!.x - p.points[i - 1]!.x, p.points[i]!.y - p.points[i - 1]!.y);
  return d;
};

/**
 * 2D Perlin (gradient) noise in about [-1, 1], from a seed: same seed, same field. Smooth, with
 * features about one unit across.
 */
export function perlin(seed: number): (x: number, y: number) => number {
  const rnd = seededRandom(Math.round(seed) * 9973 + 17);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [perm[i], perm[j]] = [perm[j]!, perm[i]!];
  }
  const p = [...perm, ...perm];
  // 8 unit gradients.
  const gx = [1, -1, 0, 0, Math.SQRT1_2, -Math.SQRT1_2, Math.SQRT1_2, -Math.SQRT1_2];
  const gy = [0, 0, 1, -1, Math.SQRT1_2, Math.SQRT1_2, -Math.SQRT1_2, -Math.SQRT1_2];
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h: number, x: number, y: number) => gx[h & 7]! * x + gy[h & 7]! * y;
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const aa = p[p[X]! + Y]!;
    const ab = p[p[X]! + Y + 1]!;
    const ba = p[p[X + 1]! + Y]!;
    const bb = p[p[X + 1]! + Y + 1]!;
    const u = fade(xf);
    const v = fade(yf);
    const x1 = grad(aa, xf, yf) + u * (grad(ba, xf - 1, yf) - grad(aa, xf, yf));
    const x2 = grad(ab, xf, yf - 1) + u * (grad(bb, xf - 1, yf - 1) - grad(ab, xf, yf - 1));
    // Scaled so the output fills about [-1, 1].
    return Math.SQRT2 * (x1 + v * (x2 - x1));
  };
}
