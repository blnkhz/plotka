# Doodle

Draw something by hand and turn it into clean vectors. Click **Add doodle…** at the top of the left
panel. Each doodle is a layer of its own.

## Drawing

- **Draw**: drag on the white artboard. A mouse, trackpad or drawing tablet all work.
- **Erase**: drag over strokes and shapes to remove them.
- **Select**: click closed shapes to move or combine them (see below). Drag to move what's
  selected; Delete removes it.
- **Undo** / **Redo** (⌘Z / ⇧⌘Z) and **Clear**. Every change can be undone: strokes, erasing,
  clearing and combining.
- **Artboard**: the size of the drawing area in mm.

## Basic shapes

Under **Shapes**, pick an icon (**Rectangle**, **Ellipse**, **Triangle**, **Hexagon** or **Star**), then
drag on the artboard to place it (hold ⇧ to keep it even), or click for a 30 mm one. The new shape
is selected, so you can drag it where you want it or ⇧-click another shape to combine them.

Placed shapes stay exact: **Style**, **Smoothing** and **Keep sharp corners** only change what you
drew by hand.

## Combining shapes

Closed shapes that overlap can be combined, like the shape tools in drawing apps. Pick
**Select**, click a shape, and ⇧-click the others (click empty paper to start over). Then:

- **Merge**: joins them into one shape.
- **Cut out**: cuts the shapes you drew later out of the one you drew first. Cutting a small
  shape out of the middle of a big one leaves a hole, and fills leave the hole empty.
- **Keep overlap**: keeps only the part where they all overlap.
- **Remove overlap**: keeps everything except where they overlap.
- **Separate**: splits a combined shape back into its pieces.

Only closed shapes can be combined: a stroke is closed when it ends near where it started (with
**Close shapes when the ends meet** on). A combined shape can be combined again, and it still
follows **Style**, **Smoothing** and **Keep sharp corners**. The eraser removes a combined shape
as a whole.

## Turning strokes into vectors

Your strokes are kept as drawn, so you can change these at any time:

- **Style**: **Curves** fits smooth curves through your strokes; **Straight lines** turns them
  into straight segments with as few corners as possible.
- **Smoothing**: from 0 (as drawn) to 100 (very smooth). Higher values remove more of the hand
  wobble and give fewer curves or corners.
- **Keep sharp corners**: corners you drew stay sharp instead of being rounded off.
- **Close shapes when the ends meet**: a stroke that ends near where it started becomes a
  closed shape.
- **Fill closed shapes**: closed shapes become filled. When you use the drawing they're hatched
  with lines (change the fill in the Fill tab).
- **Keep outlines**: also draws the line around each filled shape. Untick it to plot only the
  fill. Open strokes always keep their line. Once the doodle is in, this is the layer's **Draw
  outlines of filled shapes** in the Fill tab, so you can still change it there.
- **Show what I drew**: shows your original strokes faintly under the result.

The header shows how many strokes became how many curves or lines.

## Using the drawing

- **Use drawing** adds it to the **Layers** panel as "Doodle 1", beside any artwork that's open.
  Fills, passes, transforms and the page setup all work on it, like on a layer from a file.
- **Save SVG…** saves it as an SVG file to use elsewhere.
- **Cancel** closes the pad. A new drawing stays there for the next time you open it.

Doodles are saved in projects. Opening another drawing or SVG as a new project starts without them.

## More than one doodle

Click **+ Add layer** in the **Layers** panel for an empty layer, then **Add doodle…** to draw on
it. Each doodle's layer can have its own fill, passes, color and pen speed, can be moved with
**Arrange**, and can be hidden or left out of the plot.

**Add doodle…** with a layer from a file or a text layer selected makes a new layer for the doodle.

All artboards share their top-left corner, so doodles line up the way you draw them. Your other
doodles show faintly on the artboard to draw against (untick **Show other doodles** to hide them).

## Editing a doodle

Select a doodle's layer and click **Edit doodle…** to reopen its strokes and settings. **Update
layer** changes it and
keeps its fill and other layer settings; **Cancel** leaves it as it was (on an empty layer too, so
it drops what you drew). **✕** deletes the layer,
and Undo (⌘Z) brings it back.
