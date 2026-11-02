# Epic 4, part 2 plan: HATCH-4, HATCH-5, HATCH-6, HATCH-8, overlap fix

Dependency approved: `@countertype/clipper2-ts` (pure TypeScript port of Clipper2, Boost Software
License 1.0, no dependencies). Wrapped in `geometry/polygon.ts` so the rest of core never touches
it. Coordinates go to integers at 1 µm (×1000) for robust booleans.

## Overlapping shapes (fixes the known HATCH limitation)

New layer setting `hideCovered` (default on): within a layer, later shapes paint over earlier
ones, like SVG. Working from the top shape down, each fill region's visible area is the region
minus the union of everything above it. Hatches use the visible area; outlines are clipped to it.

- White fills now import as **knockout** regions (`FillRegion.knockout`) instead of being
  dropped: they're never hatched or outlined but hide what's under them. In "by color" layer
  mode they are still dropped, since they'd form a layer with nothing to draw. Bounds ignore
  them, so fit-to-page doesn't change.
- Only within a layer. Cross-layer covering needs the original paint order across layers; later.
- Fill outlines move from `buildToolpath` into the fills step, so they're clipped like strokes.
  This also stops a shape cut by the printable area from drawing an outline along the margin.

## New fill types

- **Concentric** (HATCH-4): rings at inset + spacing × (k + ½) inward, round joins, until
  the area vanishes. With "keep pen down", each ring starts at the point nearest the previous
  ring's start and is joined to it when the connector is short (≤ 2 × spacing) and stays inside.
- **Spiral** (HATCH-5): Archimedean spiral (spacing between turns) from the visible area's
  centroid, out to the farthest vertex, clipped to the inset area. Angle sets where it starts.
- **Dots** (HATCH-6): a grid (rotated by the angle) of pen taps at the spacing, with optional
  jitter (0–100% of spacing, deterministic so the preview matches the plot). Inside the inset
  area only. A dot is a zero-length path: the planner lowers and raises the pen without moving.
- **Density from color** (HATCH-8): option on any fill type. Spacing per shape = spacing ÷
  darkness (darkness = 1 − luminance of the source fill), capped at 10× spacing; shapes lighter
  than 5% are skipped.

## Tests

Overlaps (no hatch under the top shape, knockouts hide, outlines clipped, toggle off restores
old behavior), concentric ring count and spacing on a square and a ring, spiral stays inside and
turn spacing, dots count on a square and inside a hole, jitter is deterministic, density spacing
by color.

## UI

Fill tab: new types (Concentric, Spiral, Dots), jitter for dots, "Spacing from fill color", and
"Hide parts covered by shapes on top". The preview draws dots as dots.
