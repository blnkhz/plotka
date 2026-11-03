# Fills

A pen can't paint an area, so filled shapes are filled with lines or dots. Select a layer in the
left panel, open the **Fill** tab and pick a **Type**. Layers with only filled shapes start with
**Lines**; choose **None** to leave fills undrawn. Each layer has its own fill; **Use these settings on all
layers** copies them (and the layer's speeds) to the others.

## Fill types

- **Lines**: parallel lines (hatching).
- **Crosshatch**: two sets of lines. **Second angle** defaults to the first + 90°.
- **Triangles**: three sets of lines 60° apart, making a grid of triangles.
- **Hexagons**: a honeycomb. **Cell size** is the width of one cell.
- **Waves**: parallel lines bent into waves. **Shape** is smooth, zigzag or square.
  **Wavelength** is the length of one wave, **Amplitude** how far the lines swing, and **Phase
  shift** moves each line's wave a little from the one before, for interference and moiré
  patterns (0 keeps them in step).
- **Noise**: lines bent by smooth random bumps, for an organic, hand-drawn or topographic look.
  **Bump size** sets how big the bumps are, **Amplitude** how far the lines move, and **Seed**
  picks the pattern (the same seed always gives the same lines).

  For both, the amplitude is held back so neighboring lines never cross (or, for square waves,
  never run over each other's steps); the Fill tab says when that happens. Tick **Let lines
  cross** to allow it.

- **Flow**: lines that follow smooth random currents, kept **Line spacing** apart, like hair,
  wood grain or wind. **Bump size** sets how big the bends are and **Seed** picks the pattern.
  **Stroke length** limits how long each line runs: 0 for long flowing lines, a few mm for short
  strokes, like grass or fur.

- **Concentric**: rings following the outline inward, like contour lines.
- **Spiral**: a spiral from the shape's center outward, cut to the shape. Best on round shapes.
- **Ripples**: circles around the shape's center, like drops in water. Like the spiral, the
  center can be moved (see **Center X / Y** below).
- **Dots**: a grid of pen taps. **Jitter** moves each dot randomly by up to that share of the
  spacing, for a stipple look. Dots are slow to plot: each one is a pen lift.
- **Stipple**: dots scattered at random, but never closer than the dot spacing, so they look
  placed by hand with no clumps or gaps. **Seed** picks the pattern. With **Spacing from fill
  color**, darker shapes get more dots: stippling by tone.

Hexagons, triangles and stipple look best sparser than line hatching, so switching to them
raises the spacing to a starting value (4, 3 and 1 mm) if it's smaller.

## Settings

- **Spacing** (or Ring / Turn / Dot spacing): the distance between lines, rings, turns or dots.
  The number next to it is how many per centimeter. Pick it from your pen: about 1.5–2 times the
  tip width gives an even tone.
- **Angle**: the direction of the lines (the start direction for spirals, the grid angle for
  dots).
- **Center X / Y** (spirals and ripples): moves the center, in mm from the shape's center
  (right and down are positive). The center can even sit outside the shape: the spiral still
  covers all of it, cut to the shape. **Reset** puts it back in the middle. **Place in preview**
  shows the centers as crosshairs; drag to move them, and press Esc or **Done** when finished.
- **Same center for all shapes** (spirals and ripples): every shape in the layer shares one
  center, the center of them all together, so the pattern runs on from shape to shape.
- **Inset**: pulls the fill in from the outline, so it doesn't overrun a drawn outline.
- **Spacing from fill color**: darker shapes get tighter spacing, lighter ones wider (up to 10×).
  Very light shapes are left empty. Turns grayscale art into tones.
- **Keep pen down between lines**: joins neighboring lines end to end (a zigzag), or rings,
  without lifting the pen, where the join stays inside the shape. Faster, and fewer pen lifts.
  Turn it off for separate strokes, with the pen lifted after each line.
- **Draw outlines of filled shapes**: also draws each shape's outline. When every filled shape
  in a layer has an outline in the file (or a doodle kept its outlines), those outlines are this
  setting, already on, so unticking it removes them. If only some shapes had outlines, they're
  kept as ordinary lines, as in the file.
- **Hide parts covered by shapes on top**: where shapes overlap, only the top one is filled and
  outlined, as in the file. Turn it off to fill every shape completely.

Lines from neighboring shapes line up, because all fills share one grid.

## Your default fill

When the app fills shapes for you (a file with only filled shapes, **Fill them**, a doodle with
filled shapes, or switching a layer from None to a fill type), it uses your default fill. Set a
layer up the way you like (say, crosshatch at 0.4 mm) and click **Save as my default fill**
under **Defaults**. It's remembered between sessions. **Use these settings on all layers** copies
the current layer's fill, outline, covering and speed settings to every other layer.
