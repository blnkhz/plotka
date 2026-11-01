# Build step 3 plan: PAGE-1 to PAGE-3, PREVIEW-1 to PREVIEW-3

## Core (`packages/core`)

- `page/paper.ts`: paper presets (A5, A4, A3, Letter, Legal, Tabloid, 9x12, 5x7, 6x6, Custom),
  orientation, margins, `PageSetup`.
- `pipeline/fit.ts`: fit-to-page step. Order: rotate around the art center, scale (original / fit /
  fill × manual %), 9-point align inside the margin box, offset. Extra align option "As in file"
  keeps the file's own artboard layout. Fill mode crops to the margins.
- `geometry/clip.ts`: polyline clip (Liang-Barsky, returns inside and outside pieces for
  highlighting) and ring clip (Sutherland-Hodgman) against a rectangle.
- `pipeline/process.ts`: fit → clip to printable area (paper ∩ bed, paper top-left at home) →
  toolpath. Flags paper larger than the bed (blocks plotting later).
- `pipeline/toolpath.ts`: pen-down paths per plotted layer; stats (pen-down distance, travel from
  and back to home, lifts, paths, rough time estimate with a per-move trapezoid). The estimate is
  replaced by the real planner in MOTION-2.

## Machine profile

`packages/plotter/profiles/axidraw-v3-a3.json`. Bed 430 x 297 mm from the vendor spec sheet;
speeds and servo values are marked provisional (see docs/hardware-notes.md).

## Desktop UI

- Zustand store: source bytes, imported doc, per-layer overrides, page setup, view options.
- Preview: Canvas 2D in mm world coordinates. Paper, bed (dashed, with home dot), margins,
  pen-down strokes in layer color at pen width, clipped parts in red, optional travel lines and
  original artwork overlay. Pinch / ⌘-scroll / mouse wheel zoom around the cursor, trackpad
  scroll and drag pan, Fit button and `F`.
- Left: layers (color, visibility, plot toggle) and the layer mode choice (from file / one layer /
  by color) which re-imports. Right tabs: Page (all PAGE-1/2 controls), Fill (outline toggle for
  now), Machine (profile info), Plot (stats per layer and total).
- Open via ⌘O / button (native dialog, filtered to registered importer extensions) or drag and drop.
- Playwright smoke test drives the built app: drop a file, change paper, check stats and the
  bed warning.
