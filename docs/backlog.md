# Backlog

Work not done yet, newest requests first. Story IDs refer to the spec; "new" items came up while
building. Each item gets a plan in `docs/plans/` when it's picked up.

## Move and resize layers in the preview (new, requested 2026-11-02)

Drag a layer to move it on the page, and drag the corners of its bounding box to resize it.

Design notes:

- **Model**: a per-layer placement `{ x, y, scale, rotation? }` in `LayerSettings` (so it's saved
  in projects, undoable, and copied by "Use these settings on all layers" only if wanted). Applied
  in page coordinates right after fit-to-page and before fills, so hatching stays on the global
  grid, and before passes and clipping.
- **Selection**: click a layer's artwork in the preview (or its row in the Layers list) to select
  it; the selected layer shows its bounding box with 8 handles. Hit-testing uses the placed
  layer's bounds (cheap), then nearest-path distance for overlapping layers.
- **Dragging**:
  - drag inside the box to move
  - drag a corner to scale; it keeps proportions by default, Shift frees them (non-uniform scale
    needs `scaleX`/`scaleY` in the model), Alt scales from the center
  - arrow keys nudge (1 mm, Shift = 10 mm)
- **Snapping**: to the margins, the paper center and other layers' edges, with guide lines shown
  while dragging. Hold ⌘ to turn snapping off.
- **Performance**: while dragging, transform the cached preview Path2D with a canvas transform
  instead of re-running the pipeline; run the worker once on release (and throttled during the
  drag for the stats).
- **Numbers**: a "Position" section in the Fill tab (X, Y, scale %) for exact values, with Reset.
- **Undo**: one step per drag (record on pointer-up, not every move).
- **Whole artwork**: the same handles with nothing selected could move and scale the whole
  artwork (writing the Page tab's offset and scale).
- **Tests**: core placement math; an app test that drags with the mouse and checks the new
  position, the time estimate updating, and undo.

## More fill types (new, requested 2026-11-02)

Waves and Noise are done. Still to consider, on the same global grid:

- **Noise "flow" mode**: lines follow the noise direction instead of only being displaced.
- **Flow field**: short strokes following a noise field.
- **Ripples**: concentric circles around a movable point, clipped to the shape (like the
  spiral, with a center).
- **Zigzag waves**: triangle and square waves with the Waves controls.
- **Hexagons and triangles**: grid fills.
- **Stippling by tone**: dots spaced by the source color, building on "spacing from fill
  color".

## Remaining spec stories (P2 and later)

- PROJ-3 pen library (name, color, tip width, preferred speed, pen heights)
- DRIVER-6 full support for the brushless pen-lift upgrade on AxiDraws (the NextDraw profiles
  already send the servo pin; needs testing on hardware)
- SETUP-6 Windows and Linux builds
- LATER-1 to LATER-8: multi-pen plotting with pen-swap prompts, split by color, registration
  marks, single-stroke text, more import formats, a browser version, signed builds

## Needs a decision

- Final project name (before the repo or a release goes public)
- Code of conduct contact method (`CODE_OF_CONDUCT.md`)
- README screenshot
- Whether to commit `specs.md` (e.g. as `docs/spec.md`)

## Needs a test on hardware

- Dry run, continue after Stop, and the installed app (`pnpm build:mac`) on the AxiDraw
- NextDraw and other AxiDraw profiles (calibration sheet in `docs/hardware-test.md`)
- NextDraw 1117 travel (430 × 297 mm assumed)
