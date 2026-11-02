# Plan: Tile transform (GEN-4 part) and doodle pad (new, user request 2026-11-02)

## Transforms framework (GEN-6)

The spec puts generative transforms in a pipeline list in the left panel, each a self-contained
module with a params schema, with the settings UI generated from the schema. Tile is the first.

- `packages/core/src/transforms/`: `types.ts` (param schema, `TransformDef`, `PipelineStep`),
  one file per transform, `index.ts` registry + `applyTransforms(doc, steps)`.
- Steps run on the artwork **before** fit-to-page, in list order; disabled steps are skipped.
  So "fit to margins" scales the whole result onto the paper, and the "fill" fit mode crops a
  large grid to the margins (covering the page edge to edge).
- A cap on output size (2M points) with a warning, so a big grid can't freeze the app.
- `docs/adding-a-transform.md` explains how to add one.

## Tile (repeat on a grid)

Params: columns, rows, gap X/Y (mm, negative overlaps), row shift % (50 = brick), column shift %
(50 = half-drop), mirror alternate tiles (none / columns / rows / both), tile rotation, rotation
step per tile, grid angle, rotation and scale jitter with a seed (repeatable).

The cell is the artwork's bounds plus the gap. Each tile is placed around its cell center. Fills
are hatched after tiling, on the global grid, so hatching lines up across tiles.

## Doodle pad

Toolbar "Doodle…" opens a drawing window. Strokes are kept raw, so changing the settings
re-processes them without redrawing.

Processing (pure, in `packages/core/src/doodle/`, tested):

1. Resample the raw pointer points evenly (0.25 mm).
2. Split at sharp corners (turn > 50° over a short window) when "Keep sharp corners" is on.
3. Smooth each piece with a Gaussian along the path (strength 0–100 → up to 4 mm), ends
   pinned.
4. **Straight lines:** Ramer–Douglas–Peucker, tolerance growing with smoothing.
   **Curves:** least-squares cubic Bézier fitting (Schneider's method, written from the
   published algorithm), error tolerance growing with smoothing; tangents continuous except at
   kept corners.
5. Close a stroke whose ends are within the close gap; optionally fill closed shapes (so they
   can be hatched).

The result is written as an SVG (real `C` curves or `L` lines) and opened like an imported file
("Doodle.svg"), so fills, passes, tiling and the page setup all apply. "Save SVG…" writes it to
disk (new `file:save` IPC). "Edit doodle" reopens the strokes.

Pad tools: draw, erase stroke, undo/redo (⌘Z / ⇧⌘Z), clear, artboard size; the raw stroke is
shown faintly under the processed result.

## Tessellate (true tessellation, user request 2026-11-02)

A second transform for patterns that turn and mirror the artwork, not just repeat it.

- `transforms/wallpaper.ts`: the 17 wallpaper groups (p1 … p6m) plus a honeycomb (hexagonal
  lattice, hexagon cells) and alternating triangles. Each is a lattice (rectangular, square or
  hexagonal), a fundamental region, and the symmetry operations, written in fractional
  coordinates from the standard settings of the International Tables for Crystallography.
  A test checks every group: the region's copies cover random points exactly once, region area ×
  operations = cell area, and every operation is an isometry.
- `transforms/tessellate.ts`: fits the artwork into the fundamental region (size, turn, offset),
  optionally clips it to the region (seamless) or lets it spill over (overlapping copies), then
  places copies over columns × rows cells and optionally trims to a rectangle. Cell height
  applies to the rectangular groups. Output is capped with a warning, like Tile.
