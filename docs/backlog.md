# Backlog

Work not done yet, newest requests first. Story IDs refer to the spec; "new" items came up while
building. Each item gets a plan in `docs/plans/` when it's picked up.

## New features (requested 2026-11-03)

Both come from the earlier web tools at https://blnkhz.github.io/plotter-tools/ (source:
`blnkhz/plotter-tools`). They're new ways to bring artwork in, so they'd sit next to Open… and
Doodle…, and their output goes through the usual fills, transforms, optimisation and plotting.

- **3D slicer ("parallel remesher")**: open a 3D model, turn it to the view you want, and cut it
  into evenly spaced parallel lines, drawn as seen from that view.
  - **Formats**: more than OBJ: STL, PLY, glTF / GLB and 3MF too (OBJ, STL and glTF cover most
    exports from Blender, CAD and 3D-printing tools). Several files or meshes in one file are
    combined.
  - **Visible part only vs full mesh**: a setting. Visible only removes the parts of each line
    hidden behind the model from the current view (hidden-line removal), so it reads as a
    solid object; full mesh draws every line, back included, like the old tool did.
  - **Controls**: number of lines (or spacing in mm), slice direction (the old tool sliced
    horizontally only; any axis or angle), perspective or flat (orthographic) view, and the
    view itself: rotate, pan and zoom with the mouse, plus a few presets (front, side, top,
    three-quarter).
  - **Output**: lines joined into long paths per slice; then the usual path optimisation.
    Re-slicing after the view changes, without opening the model again.
  - **Check first** (spec rule 6): a 3D viewer most likely means Three.js (MIT, large). Ask
    before adding it; the slicing and hidden-line maths itself can live in `packages/core`.
- **Image dithering**: open a photo or picture (PNG, JPEG, WebP...) and turn it into a grid of
  small pen marks, darker areas getting more marks.
  - **Like the old tool**: ordered (Bayer) dithering, cell size, brightness, contrast, and mark
    shape: square, circle, x or +.
  - **Worth adding**: cell size in mm on the paper, error diffusion (Floyd–Steinberg) as an
    option besides ordered, invert, and more shapes (dot, short line at an angle). Marks in
    nearest-next order, so the plot doesn't jump around the page.
  - Raster images aren't something the app opens today (SVG and JSON only), so this is also the
    first image import (LATER-7 lists more file formats).

## Remaining spec stories (P2 and later)

- PROJ-3 pen library (name, color, tip width, preferred speed, pen heights)
- LATER-1 to LATER-8 (LATER-6 single-stroke text is done): multi-pen plotting with pen-swap
  prompts, split by color, registration marks, more import formats, a browser version, signed
  builds

## Needs a decision

- Code of conduct contact method (`CODE_OF_CONDUCT.md`)
- README screenshot
- Whether to commit `specs.md` (e.g. as `docs/spec.md`)

## Needs a test on hardware

- Dry run, continue after Stop, and the installed app (`pnpm build:mac`) on the AxiDraw

## Not planned for now (decided 2026-11-02)

- **Other plotters**: only the AxiDraw V3/A3 is tested. The other AxiDraw and NextDraw profiles
  (and the NextDraw 1117 travel, 430 × 297 mm assumed) stay marked untested until owners test
  them and send a pull request. The same goes for DRIVER-6, the brushless pen-lift upgrade on
  AxiDraws.
- **SETUP-6 Windows and Linux builds**: macOS only.
