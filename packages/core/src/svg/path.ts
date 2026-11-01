import svgpath from 'svgpath';
import { applyToPoint, IDENTITY, matrixScale, type Matrix } from '../geometry/matrix';
import { flattenArc } from '../geometry/arc';
import { flattenCubic, flattenQuadratic } from '../geometry/flatten';
import type { Polyline } from '../model';
import type { Vec2 } from '../geometry/vec2';

const SAME_POINT_EPS = 1e-9;

/**
 * Converts SVG path data to polylines. Control points are transformed by `m` before
 * flattening, so `tolerance` is in output units (mm). Arcs are flattened in user space
 * (an affine map of an arc is not an arc in general) with the tolerance scaled to match.
 * Each subpath becomes one polyline; `Z` marks it closed (the closing point is not repeated).
 */
export function pathToPolylines(d: string, m: Matrix = IDENTITY, tolerance = 0.05): Polyline[] {
  const out: Polyline[] = [];
  let current: Vec2[] | null = null;

  const finish = (closed: boolean) => {
    if (current && current.length > 0) {
      if (closed && current.length > 1) {
        const first = current[0]!;
        const last = current[current.length - 1]!;
        if (
          Math.abs(first.x - last.x) < SAME_POINT_EPS &&
          Math.abs(first.y - last.y) < SAME_POINT_EPS
        )
          current.pop();
      }
      if (current.length > 1 || closed) out.push({ points: current, closed });
    }
    current = null;
  };

  const tp = (x: number, y: number) => applyToPoint(m, x, y);
  const scale = matrixScale(m) || 1;
  const arcBuf: Vec2[] = [];

  svgpath(d)
    .abs()
    .unshort()
    .iterate((seg, _i, x, y) => {
      const cmd = seg[0];
      const from = tp(x, y);
      if (cmd !== 'M' && cmd !== 'Z' && cmd !== 'z' && !current) {
        // Drawing command without a preceding M: start at the current point.
        current = [from];
      }
      switch (cmd) {
        case 'M':
          finish(false);
          current = [tp(seg[1], seg[2])];
          break;
        case 'L':
          current!.push(tp(seg[1], seg[2]));
          break;
        case 'H':
          current!.push(tp(seg[1], y));
          break;
        case 'V':
          current!.push(tp(x, seg[1]));
          break;
        case 'C':
          flattenCubic(
            from,
            tp(seg[1], seg[2]),
            tp(seg[3], seg[4]),
            tp(seg[5], seg[6]),
            tolerance,
            current!,
          );
          break;
        case 'Q':
          flattenQuadratic(from, tp(seg[1], seg[2]), tp(seg[3], seg[4]), tolerance, current!);
          break;
        case 'A':
          arcBuf.length = 0;
          flattenArc(
            x,
            y,
            seg[1],
            seg[2],
            seg[3],
            seg[4] !== 0,
            seg[5] !== 0,
            seg[6],
            seg[7],
            tolerance / scale,
            arcBuf,
          );
          for (const p of arcBuf) current!.push(tp(p.x, p.y));
          break;
        case 'Z':
        case 'z':
          // After Z, a drawing command without M starts a new subpath at the
          // subpath start (svgpath reports x,y accordingly).
          finish(true);
          break;
        default:
          // S and T are removed by unshort; relative commands by abs.
          break;
      }
    });
  finish(false);
  return out;
}

const f = (n: number) => String(n);

export function rectToPath(
  x: number,
  y: number,
  w: number,
  h: number,
  rx: number,
  ry: number,
): string {
  if (w <= 0 || h <= 0) return '';
  rx = Math.min(Math.max(rx, 0), w / 2);
  ry = Math.min(Math.max(ry, 0), h / 2);
  if (rx === 0 || ry === 0) return `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`;
  return (
    `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}` +
    `V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}` +
    `H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}` +
    `V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
  );
}

export function ellipseToPath(cx: number, cy: number, rx: number, ry: number): string {
  if (rx <= 0 || ry <= 0) return '';
  return (
    `M${cx + rx} ${cy}A${rx} ${ry} 0 0 1 ${cx} ${cy + ry}` +
    `A${rx} ${ry} 0 0 1 ${cx - rx} ${cy}A${rx} ${ry} 0 0 1 ${cx} ${cy - ry}` +
    `A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}Z`
  );
}

export function pointsToPath(points: string, close: boolean): string {
  const nums = (points.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi) ?? []).map(Number);
  if (nums.length < 4) return '';
  let d = `M${nums[0]} ${nums[1]}`;
  for (let i = 2; i + 1 < nums.length; i += 2) d += `L${nums[i]} ${nums[i + 1]}`;
  return close ? d + 'Z' : d;
}
