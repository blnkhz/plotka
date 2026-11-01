import {
  IDENTITY,
  multiply,
  rotate,
  scaleMatrix,
  skewX,
  skewY,
  translate,
  type Matrix,
} from '../geometry/matrix';

/** Parses an SVG `transform` attribute into a single matrix. */
export function parseTransform(value: string | undefined): Matrix {
  if (!value) return IDENTITY;
  let m: Matrix = IDENTITY;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value))) {
    const args = (match[2]!.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi) ?? []).map(Number);
    let t: Matrix = IDENTITY;
    switch (match[1]) {
      case 'matrix':
        if (args.length === 6) t = args as unknown as Matrix;
        break;
      case 'translate':
        t = translate(args[0] ?? 0, args[1] ?? 0);
        break;
      case 'scale':
        t = scaleMatrix(args[0] ?? 1, args[1] ?? args[0] ?? 1);
        break;
      case 'rotate':
        t = rotate(args[0] ?? 0, args[1] ?? 0, args[2] ?? 0);
        break;
      case 'skewX':
        t = skewX(args[0] ?? 0);
        break;
      case 'skewY':
        t = skewY(args[0] ?? 0);
        break;
    }
    m = multiply(m, t);
  }
  return m;
}
