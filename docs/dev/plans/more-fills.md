# More fill types (backlog, 2026-11-02)

- **Wave shapes** (`wavy.ts`): smooth, zigzag, square; zigzag and square are drawn exactly from
  their corners (a square step is two points at one x). Crossing caps per shape: sine
  s / (2·sin(φ/2)), zigzag s·π / (2φ), square s / 2 always (in step its upright steps would
  overlap the next line's).
- **Ripples** (`patterns.ts`): circles (k + ½)·spacing from the center, cut to the inset area.
  Shares the spiral's movable center (`fillCenters`, Center X / Y, shared center, Place in
  preview).
- **Triangles** (`grids.ts`): Lines at angle, +60°, +120°. **Hexagons**: pointy-top honeycomb on
  the global grid, a zigzag per row of shared edges plus the upright edges; cell size = width.
- **Stipple** (`organic.ts`): Bridson Poisson-disk sampling, seeded, with seeds on a coarse grid
  so separate parts of a shape all fill. By tone through "Spacing from fill color".
- **Flow** (`organic.ts`): Jobard–Lefer evenly spaced streamlines through a Perlin field (main
  direction ± ~170°); midpoint steps of about half a spacing; stop at the shape, half a spacing
  from another line, or half the stroke length each way; seeds a spacing beside finished lines,
  then on the paper's grid. Covers the backlog's "noise flow mode" and "flow field" (short
  strokes) in one fill.
- Switching to hexagons, triangles or stipple raises the spacing to 4, 3 or 1 mm if lower.
- Caps: 600,000 points for stipple and flow, 2,000,000 hexagon edges (then only the rows that
  fit). An A4 page at 0.6 mm: stipple ~1.2 s, flow ~0.5 s, hexagons ~0.75 s.
