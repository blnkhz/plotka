# 3D slicer

Goal (backlog, 2026-11-03; from the old web tool's "parallel remesher"): open a 3D model, turn it
to the view you want, and cut it into evenly spaced parallel lines drawn as seen from that view.
Draw only the part of each line you can see, or the whole mesh. More formats than OBJ.

- **Dependency**: Three.js 0.186.1 (MIT; approved by picking this feature, 2026-11-03) for
  reading the files and the 3D view. Its 3MF loader includes fflate (MIT). Both in
  `THIRD_PARTY_NOTICES.md`. Only the app uses it; the maths is in core without it.
- **Formats** (Three.js loaders, in the app): OBJ, STL (text and binary), PLY, glTF with its data
  inside and GLB, 3MF. Every mesh in a file is combined, with its transforms applied, then
  centred and scaled to a unit size.
- **Core** (`packages/core/src/mesh/slice.ts`, pure, tested): triangles in, lines out.
  - Planes: `lines` evenly spaced planes across the model, normal along X, Y or Z, tilted by an
    angle towards the next axis.
  - Slicing: each triangle meets a plane in a segment; segments are joined into chains (closed
    loops where the surface is closed). Edge points are worked out from the edge's ends in a
    fixed order, so neighbouring triangles give the same point and chains join exactly.
  - View: the camera's view and projection matrices (column-major, as Three.js gives them).
  - **Visible part only**: a depth buffer of the triangles (about 1000 px tall), then each line
    is sampled every half pixel and kept where nothing is in front of it (with a small
    tolerance, and the 3 × 3 neighbourhood so lines on the surface itself aren't lost to
    rounding). **Full mesh**: every line, back included.
  - Output: lines in mm, fitted to the chosen width; then an SVG like the other generators.
- **Pad** (like the image pad): the 3D view on the left (drag to turn, right-drag or two
  fingers to move, scroll to zoom; presets front, side, top, three-quarter), the plotted result
  next to it, settings on the right: lines, direction and tilt, visible only or full mesh,
  perspective or flat view, width. Re-slices when the view stops moving or a setting changes.
  **Use model** opens the lines as artwork; **Edit 3D model…** reopens it with the same view and
  settings, which are saved in the project with the model.
- **Tests**: core with a cube (plane count, closed square loops, a front view hides the back
  half, a perspective view, tilt, fit to width, SVG import); app test drops generated STL, OBJ
  and PLY files, switches visible / full, uses the result and reopens it.
