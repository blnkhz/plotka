# Movable spiral fill center

- `FillSettings.centerX / centerY` (mm offset, default none = exactly the old start: the inset
  area's centroid) and `sharedCenter` (area-weighted centroid of the layer's drawn shapes).
- `spiralCenters(layer)` (core) gives each shape's start; the fill and the preview both use it.
  Whole shapes, not their visible parts, so a shape on top doesn't shift the center below.
- The spiral already reaches the farthest vertex from its center and clips to the shape, so a
  center outside the shape just works.
- Fill tab: Center X / Y, Reset, Same center for all shapes, Place in preview. Placing shows
  crosshairs; dragging moves the offset by the dragged mm (fills are made on the paper, so no
  conversion), one undo step per drag. Picking another layer, Esc or Done ends it.
