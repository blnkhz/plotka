# Move and resize layers in the preview

Design from the backlog (2026-11-02), with these choices made while building:

- **Arrange mode** (✥ Arrange above the preview): dragging the preview pans the view, and most
  artwork covers most of the page, so arranging is a mode, like Adjust in preview. Outside it
  the preview works as before. Esc / Done ends it; in it, drag off the paper or hold Space to pan.
- **Model**: `LayerSettings.placement = { dx, dy, sx, sy }`: scale around the layer's center,
  then move, in paper mm. `placeOnPage` (core) applies it after the page fit and before the
  'fill' crop, fills, passes and clipping, and returns each layer's bounds before placement.
- **All layers** (with more than one layer, click empty paper): the box around all drawn layers;
  moving or resizing it moves every layer's placement as a group. One layer has no separate
  "all" target (it was the same thing, moved a second way). The first version moved the whole
  artwork through the Page tab's scale and offset instead; its box was where the page fit put
  the artwork, which didn't match what was drawn once a layer had been moved (reported
  2026-11-02), so that was dropped.
- **Dragging** draws the already computed paths through a matrix (from the start box to the
  dragged one); on release one store change (one undo step) runs the pipeline, and the drag
  stays drawn until the result arrives.
- **Snapping**: edges and centers to the paper, margins and other layers' boxes, with guide
  lines; ⌘ turns it off. Proportional corners snap on one axis and keep the proportions.
- **Numbers**: Position section in the Fill tab (Move X / Y mm, Size W / H %, Reset).
- `lib/arrange.ts` holds the box maths, snapping and hit testing (pure, unit tested).
