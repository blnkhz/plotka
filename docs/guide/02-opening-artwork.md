# Opening artwork

Click **Open…** (⌘O) or drop a file on the window. Plotter Studio opens **SVG** files and its own
**projects** (`.plot.json`).

## SVGs from design apps

SVGs from Illustrator, Inkscape, Figma, Affinity Designer and code all work. Shapes, paths,
lines, curves and arcs are converted to lines the pen can follow, accurately enough that you
can't see the difference.

- **Strokes** (outlines) are drawn as lines.
- **Filled shapes** are hatched or filled with patterns (see [Fills](04-fills.md)). A layer
  with only filled shapes (no outlines), like most exported logos and icons, starts with a line
  fill so it plots straight away. In layers that also have outlines, fills are off until you
  choose a fill type.
- **Filled shapes that won't be drawn** (no fill type and no outlines) show faintly in the
  preview with a dashed edge, and a message offers **Fill them with lines** or **Draw their
  outlines**. **Leave them** hides the message for that file.
- **Text** can't be plotted directly. Convert text to outlines (paths) in your design app first.
  The app warns you when a file contains text.
- **Images** (photos, bitmaps) are ignored.
- **Size**: the file's own size is kept (mm, inches, points or pixels). Illustrator's pixels are
  read as points, so its artboards come in at exactly the right size.

## Layers

The **Layers** list (left panel) shows how the artwork is split up. Each layer can have its own
fill and passes, and can be turned off for plotting.

- **From file**: the file's own layers (Inkscape layers). Only shown when the file has them.
- **One layer**: everything together.
- **By color**: one layer per stroke color. Handy for plotting each color with a different pen.

Each layer row has a color swatch (the color it's shown in), its name, a count of strokes and
filled shapes, an eye (show or hide in the preview) and a checkbox (plot it or not).

## White shapes

White and near-white fills (paper colored) are never drawn. They still **hide whatever is under
them** in the same layer, the way they look in the file. A note in the Fill tab says how many
there are. In **By color** mode they are left out completely.
