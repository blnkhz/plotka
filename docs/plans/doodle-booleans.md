# Doodle: combine overlapping shapes

Goal: in the doodle pad, closed shapes that overlap can be merged, cut, intersected or have their
overlap removed, like the shape tools in drawing apps.

- **Model** (`packages/core/src/doodle/doodle.ts`): a doodle item is either a stroke (as drawn)
  or a combined shape `{ op, items }` whose items are strokes or other combined shapes, bottom
  first. Nothing is baked: a combined shape is worked out again from its strokes with the
  current settings, so Smoothing, Style and Keep sharp corners still change it, and it can be
  split back into its pieces. Projects keep the tree; old projects (strokes only) load as is.
- **Operations** (Clipper2, via `geometry/polygon.ts`, nonzero rule):
  - **Merge**: union of all.
  - **Cut out**: the bottom shape (drawn first) minus all the others.
  - **Keep overlap**: intersection of all.
  - **Remove overlap**: exclusive or, piece by piece.
- **Closed shapes only** take part (a stroke closes when its ends meet; see Close shapes when
  the ends meet). Curves become polygons with 0.4 mm segments; the result is a set of rings
  (outer and holes) written as one SVG path with `fill-rule="evenodd"`, so holes hatch
  correctly.
- **Result** goes where the bottom shape was in the drawing order. If nothing would be left
  (Keep overlap on shapes that don't touch), nothing changes and the pad says why.
- **UI**: a third tool, **Select**: click a closed shape (the topmost under the pointer),
  ⇧-click for more, click empty paper to clear. A **Shapes** section has the four buttons
  (two or more selected) and **Separate** (one combined shape selected). Selected shapes are
  outlined in the accent colour.
- **Undo**: the pad keeps snapshots, so every change (stroke, erase, clear, combine, separate)
  undoes and redoes. Erasing a combined shape removes all of it.
- **Tests**: core unit tests for each operation (areas of two overlapping squares, a hole from
  Cut out, nested combine, settings still applied, empty result, SVG output imports with the
  hole); an app test that draws two overlapping shapes, merges, cuts, undoes and separates.
