/**
 * The splash screen's example plot, as SVG path data on a 300 × 424 sheet (A4 proportions): a
 * spiral, a hatched circle, ripples and waves, in two pens. Made here rather than stored, so it
 * stays a few lines of code.
 */
export type ExampleArt = { spiral: string; hatch: string; ripples: string; waves: string };

export const EXAMPLE_SIZE = { width: 300, height: 424 };

export function exampleArt(): ExampleArt {
  const f = (n: number) => n.toFixed(1);
  const TAU = Math.PI * 2;

  let spiral = '';
  for (let a = 0; ; a += 0.12) {
    const r = 3 + (6 / TAU) * a;
    if (r > 84) break;
    spiral += `${a === 0 ? 'M' : 'L'}${f(112 + r * Math.cos(a))} ${f(124 + r * Math.sin(a))}`;
  }

  // 45° lines across a circle.
  let hatch = '';
  const [hx, hy, hr, u] = [206, 250, 58, Math.SQRT1_2];
  for (let t = -hr + 2.75; t < hr; t += 5.5) {
    const h = Math.sqrt(hr * hr - t * t);
    const px = hx - u * t;
    const py = hy + u * t;
    hatch += `M${f(px - u * h)} ${f(py - u * h)}L${f(px + u * h)} ${f(py + u * h)}`;
  }

  let ripples = '';
  for (let r = 6; r <= 54; r += 6)
    ripples += `M${92 - r} 292a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

  let waves = '';
  for (let i = 0, y0 = 362; y0 <= 404; y0 += 6, i++)
    for (let x = 24; x <= 276; x += 3)
      waves += `${x === 24 ? 'M' : 'L'}${x} ${f(y0 + 3.5 * Math.sin((x / 26) * TAU + i * 0.6))}`;

  return { spiral, hatch, ripples, waves };
}
