export const MM_PER_INCH = 25.4;

/**
 * Parses an SVG length (`210mm`, `8.5in`, `595.28pt`, `800px`, `800`) to mm.
 * Unitless and px use `pxPerInch` (96 by default, per CSS). Returns null for percentages
 * or unparseable values.
 */
export function lengthToMm(value: string | undefined, pxPerInch = 96): number | null {
  if (value === undefined) return null;
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)\s*$/i.exec(value);
  if (!m) return null;
  const n = parseFloat(m[1]!);
  switch (m[2]!.toLowerCase()) {
    case '':
    case 'px':
      return (n / pxPerInch) * MM_PER_INCH;
    case 'mm':
      return n;
    case 'cm':
      return n * 10;
    case 'in':
      return n * MM_PER_INCH;
    case 'pt':
      return (n / 72) * MM_PER_INCH;
    case 'pc':
      return (n / 6) * MM_PER_INCH;
    case 'q':
      return n / 4;
    default:
      return null;
  }
}

/** Parses a plain user-unit number (attributes like x, y, r). */
export function num(value: string | undefined, fallback = 0): number {
  if (value === undefined) return fallback;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}
