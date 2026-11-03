# Waves and noise fills

- `fills/wavy.ts`: lines on the Lines grid (rows at (k + ½) · spacing across the angle, from the
  paper origin; sample points on a global grid too), displaced sideways by
  `A · sin(2πx/λ + k · phase)` or `A · perlin(x/scale, y/scale)`, then clipped to the inset area.
  Rows within the amplitude outside the shape are included, since they can wiggle in.
- Keep pen down: greedy chains to the next row's nearest piece, joined when short (as Lines)
  and inside the area (a hair grown, so joins along the edge count).
- No crossing unless asked: waves cap at spacing / (2·|sin(phase/2)|), noise at
  scale / max slope (measured 2.76, 3 used), both × 0.95. The Fill tab says when it's held back.
- Perlin noise is our own (seeded permutation, 8 gradients): no dependency, repeatable.
- Settings are optional `FillSettings` fields with `WAVY_DEFAULTS`, read back from projects.
- Left for later (backlog): noise flow mode, flow field, ripples, zigzag waves, grid fills,
  stippling by tone.
