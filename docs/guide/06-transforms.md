# Transforms: Tile, Tessellate and Symmetry

Transforms repeat or rearrange the artwork before it goes on the page. Add them in the left
panel under **Transforms** with **Add transform…**. Each one has a checkbox to turn it off, arrows
to change the order (they run top to bottom) and **✕** to remove it.

Transforms work on the whole artwork, before the page setup: **Fit** on the Page tab then scales
the result onto the paper, and **Fill** crops it to the margins (to cover the page edge to edge).
Fills are added after, so hatching lines up across copies.

## Tile

Repeats the artwork on a grid.

- **Columns**, **Rows**: how many copies.
- **Gap X / Y**: space between copies, in the artwork's own size. Negative values overlap them.
- **Row shift**: shifts every other row by a share of a tile's width. 50% gives a brick pattern.
- **Column shift**: the same for columns (a half-drop pattern).
- **Mirror**: flip every other column, every other row, or both (a checkerboard).
- **Tile rotation**, **Rotation step**: turn every tile, and add an extra turn per tile.
- **Grid angle**: turn the whole grid.
- **Rotation jitter**, **Size jitter**: random variation per tile. **Seed** picks a different
  random pattern; the same seed always gives the same result.

## Symmetry

Turns and mirrors copies of the artwork around its center, for rosettes and mandala-like
patterns.

- **Copies**: copies turned evenly around the center (6 = every 60°).
- **Mirror**: also add mirrored copies: left–right, top–bottom, or both.
- **Start angle**: turns the whole pattern.

It stacks with the others: for example Symmetry first, then Tile to repeat the rosette on a grid.

## Tessellate

Repeats the artwork with turns and mirrors, so copies fit together with no gaps or overlaps. The
artwork goes into one small piece of a repeating cell, and the pattern's symmetry copies it.

**Pattern** offers all 17 ways a design can repeat across a flat surface (the "wallpaper
patterns"), plus a honeycomb and alternating triangles:

- **Hexagon**: honeycomb, sixth turns (p6), kaleidoscope (p6m).
- **Triangle**: alternating triangles, third turns (p3), kaleidoscope (p3m1), pinwheel mirrors
  (p31m).
- **Square**: quarter turns (p4), kaleidoscope (p4m), pinwheel (p4g).
- **Rectangular**: plain grid (p1), half turns (p2), mirrors (pm), glide mirrors (pg), offset
  mirrors (cm), two-way mirrors (pmm), mirrors and half turns (pmg), two-way glides (pgg),
  diamond mirrors (cmm).

Settings:

- **Columns**, **Rows**, **Cell size**: the size of the pattern in repeating cells. Cell size
  only matters with **Original** size on the Page tab.
- **Cell height**: makes the cells taller or wider (rectangular patterns only).
- **Artwork size**, **Artwork turn**, **Artwork X / Y**: place the artwork within its piece.
  The kaleidoscopes have small pieces; make the artwork bigger to fill them.
- **Clip to its piece**: cuts the artwork to its piece so copies meet cleanly. Turn it off to let
  bigger artwork overlap its neighbors for a woven look.
- **Trim to a rectangle**: cuts the pattern to a clean rectangle. Off keeps whole pieces with a
  ragged edge.

Tip: lopsided artwork shows the turns and mirrors best. A perfectly symmetric shape looks the
same however it's turned.
