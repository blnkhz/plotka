# Epic 4 plan: HATCH-1 to HATCH-3

## Approach: scanline hatching, no polygon library (yet)

`clipper2-js` (named in the spec) declares Angular 15 as a peer dependency (~41 MB pulled in by
pnpm, never imported) and ships no license file. Lines, crosshatch and zigzag don't need a
polygon library, so `packages/core/src/fills/hatch.ts` does it directly:

- Rotate the region by -angle so hatch lines are horizontal.
- Lines on a global grid, y = (k + 0.5) × spacing in the rotated frame, so neighboring shapes
  line up and lines don't coincide with axis-aligned edges.
- Per scanline: edge crossings with winding direction → inside intervals for nonzero or evenodd
  (holes handled by the fill rule). Active-edge list keeps it O(lines × nearby edges).
- **Inset** (exact): subtract, per scanline, the union of every edge's capsule (points within
  `inset` of the edge). Equal to a round-joined inward offset.
- **Connect / zigzag (HATCH-3)**: greedy serpentine chains across consecutive rows. A connector
  is used only if it doesn't cross any edge, its midpoint is inside (or on the outline), it stays
  at least `inset` from every edge, and it's no longer than 4 × spacing (avoids long diagonals
  across the fill). Otherwise the pen lifts.
- Crosshatch: two passes, second at `crossAngle ?? angle + 90`.

Pipeline: fit → **fills** (hatch lines appended to the layer's strokes; fill regions kept for
outlines) → clip → toolpath.

## Known limitation

Overlapping filled shapes in one layer are hatched independently, so overlaps get both
patterns (SVG would paint the top shape over the lower one). Fixing that needs polygon booleans;
decide on a library when doing HATCH-4 (concentric needs offsets too).

## UI

Fill tab for the selected layer: type (none / lines / crosshatch / zigzag), spacing with lines
per cm, angle, second angle for crosshatch, inset, keep-pen-down toggle, outline toggle, and
"use these settings on all layers".
