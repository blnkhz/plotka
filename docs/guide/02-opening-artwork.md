# Opening artwork

Click **Open…** (⌘O) or drop a file on the window. Plotter Studio opens **SVG** files and its own
**projects** (`.plot.json`).

## SVGs from design apps

SVGs from Illustrator, Inkscape, Figma, Affinity Designer and code all work. Shapes, paths,
lines, curves and arcs are converted to lines the pen can follow, accurately enough that you
can't see the difference.

- **Strokes** (outlines) are drawn as lines. The outlines of filled shapes become the layer's
  **Draw outlines of filled shapes**, so you can turn them off (see [Fills](04-fills.md)).
- **Filled shapes** are hatched or filled with patterns (see [Fills](04-fills.md)). A layer
  with only filled shapes (no outlines), like most exported logos and icons, starts with a line
  fill so it plots straight away. In layers that also have outlines, fills are off until you
  choose a fill type.
- **Filled shapes that won't be drawn** (no fill type and no outlines) show faintly in the
  preview with a dashed edge, and a message offers **Fill them** (with your default fill) or
  **Draw their outlines**. **Leave them** hides the message for that file.
- **Text** can't be plotted directly. Convert text to outlines (paths) in your design app first.
  The app warns you when a file contains text.
- **Images** (photos, bitmaps) are ignored.
- **Size**: the file's own size is kept (mm, inches, points or pixels). Illustrator's pixels are
  read as points, so its artboards come in at exactly the right size.

## Paths from code (JSON)

Art made by a script can skip SVG: write the paths as JSON and open the `.json` file. Points are
`[x, y]` with y pointing down; set `units` to `mm` (the default), `cm`, `in`, `pt` or `px`.

```json
{
  "units": "mm",
  "width": 120,
  "height": 120,
  "layers": [
    {
      "name": "Ink",
      "color": "#1d3557",
      "paths": [
        [
          [10, 10],
          [50, 10],
          [50, 40]
        ]
      ]
    },
    {
      "name": "Red",
      "color": "#e63946",
      "paths": [
        {
          "points": [
            [0, 0],
            [20, 0],
            [10, 15]
          ],
          "closed": true
        }
      ]
    }
  ]
}
```

- Shorter forms work too: `{ "paths": [...] }` for one layer, or just a list of paths.
- A path with a single point is a dot (a pen tap). `"closed": true` joins the last point back to
  the first.
- `width` and `height` are optional; without them the drawing's own extent is used.
- The toolpath JSON that **File → Export Toolpath JSON…** writes opens too.
- Auto-reload works for JSON files, so the plot updates each time your script writes the file.

## Auto-reload

When you open an SVG file, **Auto-reload** appears in the toolbar (on by default). Edit and save
the file in Illustrator, Inkscape or your code, and Plotter Studio reloads it within a moment,
keeping all your settings (page, fills, passes, transforms). "Reloaded" flashes in the toolbar.
Untick **Auto-reload** to keep the current version.

Projects remember where their SVG came from, so auto-reload works again when you reopen a
project. If a save leaves the file half-written, the last good version stays.

## Layers

The **Layers** list (left panel) shows how the artwork is split up. Each layer can have its own
fill and passes, and can be turned off for plotting.

- **From file**: the file's own layers (Inkscape layers). Only shown when the file has them.
- **One layer**: everything together.
- **By color**: one layer per stroke color. Handy for plotting each color with a different pen.

Each layer row has:

- a color swatch (the color it's shown in),
- its name and a count of strokes / filled shapes,
- an **eye**: show or hide it in the preview. Hiding doesn't stop it plotting: a hidden layer
  that's still ticked gets an orange outline on its checkbox and a warning.
- a **checkbox**: plot it or not. Unticked layers show faintly in the preview.
- **✕**: remove the layer from the drawing. "N removed layers · Restore" under the list brings
  them back, and so does Undo. Removed layers stay removed in the saved project.

## White shapes

White and near-white fills (paper colored) are never drawn. They still **hide whatever is under
them** in the same layer, the way they look in the file. A note in the Fill tab says how many
there are. In **By color** mode they are left out completely.
