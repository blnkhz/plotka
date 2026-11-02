# Passes

**Passes** plot a layer several times, each pass shifted, turned or scaled very slightly from the
last, usually with a different pen color. Where passes land on top of each other the inks mix;
where they sit side by side, each color shows. A small turn makes the shift change across the
drawing, which gives color gradients and moiré patterns.

Find it in the **Fill** tab under **Passes**, and tick **Repeat with slight shifts**.

## Settings

- **Passes**: how many times to plot the layer (2–12).
- **Shift X / Y**: the move from one pass to the next, in mm. Around a third to half of the fill
  spacing makes passes sit between each other's lines.
- **Turn**: rotation from one pass to the next, around the layer's center. Small values like
  0.1–0.5° make gradients.
- **Scale**: size change from one pass to the next, in %. Makes moiré bands.
- **Pens**: the color of each pass. Click a swatch to change it.

The passes spread around the original, so the middle pass stays where the artwork is.

## Plotting passes

Each pass becomes its own layer ("Layer 1 · pass 2"…), with its own stats and time. Plot them one
at a time and change pens in between: untick the other layers in the **Plot** tab, or pause
between them.

The shifts are tiny, so every pass must start from exactly the same spot: don't move the paper,
and **don't turn the motors off** while changing pens (that loses the position).

## Preview

Layers are drawn as ink mixing on paper, so overlaps darken like the real thing. Set the
preview's **Pen** width to your pen's tip width to judge it: with a wide pen, several passes can
cover the paper completely.
