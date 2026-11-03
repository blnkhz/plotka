# Image dithering

Goal (backlog, 2026-11-03): open a photo or picture and turn it into a grid of pen marks, darker
areas getting more marks, like the old web tool (blnkhz.github.io/plotter-tools) but sized in
mm and plotted in a sensible order.

- **Core** (`packages/core/src/raster/dither.ts`, pure, tested): takes RGBA pixels already
  sampled one per cell, so it needs no image decoder.
  - Tone: luminance (transparent counts as white), then brightness, contrast, invert.
  - Methods: **ordered** (8 × 8 Bayer, 65 levels; the old tool used 4 × 4) and **error
    diffusion** (Floyd–Steinberg, serpentine).
  - Marks per inked cell: **square**, **circle**, **x**, **+**, **line** (at an angle) and
    **dot** (a pen tap). Mark size is a share of the cell, so neighbours can touch or not.
  - Order: rows in alternating directions, so the pen sweeps back and forth (the path optimiser
    still runs after).
  - Output: an SVG in mm (`ditherToSvg`), opened like any SVG, so fills, transforms, passes,
    optimising and plotting all work on it.
  - Size: width in mm; height from the image's proportions. The grid is capped (250 000 cells);
    past that the cell size is raised and the pad says so.
- **App**: the browser decodes the image (PNG, JPEG, WebP, GIF, BMP; no new dependency). The
  image is drawn straight into a canvas the size of the grid with high-quality smoothing, so a
  cell is the average of its area, not one pixel.
- **Image pad**: opens when an image is opened (Open…, a drop, Open Recent, Finder). Preview of
  the marks on the left, settings on the right, the mark count and grid size in the header.
  **Use image** opens the result as "<name> (dithered).svg"; **Edit image…** (under Doodle…)
  reopens it with the same settings. The image and its settings are saved in the project.
- **Tests**: core (tone ramp gives ink in proportion for both methods, invert, brightness,
  shapes, order, cap, SVG imports with one stroke per mark); app test (drop a generated
  gradient PNG, change settings, use it, edit it again).
