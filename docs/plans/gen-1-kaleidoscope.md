# GEN-1: Kaleidoscope

A wedge of the artwork repeated around a center, every other wedge mirrored.

Decision (2026-11-02): **Clip a wedge** is the default source mode; **Squeeze** (the whole
artwork bent into each wedge) is the other option. The user can drag and zoom the artwork under
the wedge in the preview.

## Core (`packages/core/src/transforms/kaleidoscope.ts`)

Params: segments (2–48), mirror (on), source (`wedge` | `squeeze`), zoom %, center X / Y (% of
the artwork's width / height from its middle), wedge angle (turns the artwork under the wedge).

- Frame: the kaleidoscope's center O is the middle of the artwork's bounds, radius
  R = half the smaller side. So the output size doesn't change while the user drags or zooms
  (the page fit would otherwise jump around under the mouse).
- Wedge 0 points up, spanning 360°/N. The artwork goes through
  `p → O + zoom · rot(−angle) · (p − C)` with C the chosen center, then:
  - wedge: clipped to wedge 0 (strokes and fills);
  - squeeze: clipped to the matching rectangle (w/zoom × h/zoom around C), densified, and
    bent into the wedge: x → angle across the wedge, top → outer edge, bottom → center.
- Copies: wedge k is wedge 0 turned k·360°/N; with mirroring, odd wedges are wedge 0 reflected
  across its right edge, then turned. Mirroring with an odd count rounds up to even, so every
  seam matches.
- Cap on output points with a warning. Lines on mirror seams are drawn twice; OPT-3 (remove
  duplicate segments, on by default) removes them.

## Adjusting in the preview

- `TransformDef.guide(doc, params)` (optional) returns an outline to draw (wedge 0) and how a
  drag (mm in the transform's output) and a zoom change its params.
- `processDocument` returns the guide of the **last** enabled transform, mapped onto the page,
  plus the placement matrix. Only the last transform can be adjusted this way: anything after it
  would move the outline.
- The step card gets **Adjust in preview**. While on, the preview outlines the wedge; dragging
  moves the artwork under it, the wheel or pinch zooms it, Esc or **Done** ends. One undo step
  per drag.

## Tests

Core: default output has N wedges and stays inside the circle; seams meet (a line crossing a
mirrored seam continues across it); zoom and center change what's taken; squeeze keeps the whole
artwork; the cap warns; the guide's drag factors move content by the dragged distance.
App: add Kaleidoscope, adjust by dragging, check a param changed, undo restores it in one step.
