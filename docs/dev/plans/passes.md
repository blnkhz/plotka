# Passes: repeat a layer with slight shifts (new, user request 2026-11-02)

Not in the spec; asked for directly. The look: the same lines plotted several times in different
pen colors, each pass shifted, turned or scaled very slightly. Where passes land on top of each
other the inks mix; where they interleave, both colors show. A small rotation or scale makes the
shift change across the drawing, which gives the color gradients and moiré.

## Model

`LayerSettings.passes: PassSettings | null`:

- `count` (1 = off), `offsetX` / `offsetY` (mm between neighboring passes), `rotate` (degrees
  between passes), `scale` (% between passes), `colors` (pen color per pass, cycled).
- Passes are spread around the original: pass k uses t = k − (count − 1) / 2, so the middle pass
  sits where the artwork is. Rotation and scale pivot on the center of the layer's content.

## Pipeline

fit → fills → **passes** → clip → toolpath → optimize. Passes come after fills on purpose:
hatch lines sit on a global grid, so re-hatching a shifted shape would give the same lines. The
finished paths are shifted instead.

Each pass becomes its own layer (`<id>~<n>`, "Name · pass n", with `passOf` pointing back), so it
gets its own color, stats and time, is optimized on its own, and can be plotted with its own pen.
Until multi-pen plotting (LATER-1), the plot is one layer at a time with a pen swap between
(PLOT-3 layer checkboxes).

## Preview

Pen-down strokes are drawn with multiply blending, so overlapping passes mix like ink and the
moiré shows on screen. (Paper is light in both themes.)

## UI

Fill tab, new "Passes" section for the selected layer: count, shift X / Y, turn, scale, and a
color per pass. Stats list each pass.
