# Fills

A pen can't paint an area, so filled shapes are filled with lines or dots. Select a layer in the
left panel, open the **Fill** tab and pick a **Type**. Each layer has its own fill; **Use these
fill settings on all layers** copies them to the others.

## Fill types

- **Lines**: parallel lines (hatching).
- **Crosshatch**: two sets of lines. **Second angle** defaults to the first + 90°.
- **Zigzag**: lines joined end to end so the pen stays down, where the join stays inside the
  shape.
- **Concentric**: rings following the outline inward, like contour lines.
- **Spiral**: a spiral from the shape's center outward, cut to the shape. Best on round shapes.
- **Dots**: a grid of pen taps. **Jitter** moves each dot randomly by up to that share of the
  spacing, for a stipple look. Dots are slow to plot: each one is a pen lift.

## Settings

- **Spacing** (or Ring / Turn / Dot spacing): the distance between lines, rings, turns or dots.
  The number next to it is how many per centimeter. Pick it from your pen: about 1.5–2 times the
  tip width gives an even tone.
- **Angle**: the direction of the lines (the start direction for spirals, the grid angle for
  dots).
- **Inset**: pulls the fill in from the outline, so it doesn't overrun a drawn outline.
- **Spacing from fill color**: darker shapes get tighter spacing, lighter ones wider (up to 10×).
  Very light shapes are left empty. Turns grayscale art into tones.
- **Keep pen down between lines**: joins neighboring lines (or rings) without lifting the pen,
  where the join stays inside the shape. Faster, and fewer pen lifts.
- **Draw outlines of filled shapes**: also draws each shape's outline.
- **Hide parts covered by shapes on top**: where shapes overlap, only the top one is filled and
  outlined, as in the file. Turn it off to fill every shape completely.

Lines from neighboring shapes line up, because all fills share one grid.
