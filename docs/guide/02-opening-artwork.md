# Opening artwork

Click **Open…** (⌘O) or drop a file on the window. Plotka opens **SVG** files, its own
**projects** (`.plot.json`), **pictures** (PNG, JPEG, WebP, GIF, BMP), which it turns into
pen marks (see [Images](#images)), and **3D models** (OBJ, STL, PLY, glTF / GLB, 3MF), which it
slices into lines (see [3D models](#3d-models)).

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
- **Text** is drawn in a single-stroke font (the closest of the app's styles), not its own
  typeface, and a note says so. To keep the typeface, convert the text to outlines (paths) in
  your design app first. See [Text](07-text.md).
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

## Images

A picture can't be plotted as it is, so Plotka turns it into a grid of small pen marks: darker
parts get more marks, lighter parts fewer (this is called dithering). Opening a picture opens
the **Image** window, with a live preview and these settings:

- **Width**: how wide the result is on the paper, in mm. The height follows the picture.
- **Cell**: the grid's spacing in mm; each cell gets one mark or none. Smaller cells show more
  detail but take longer to plot. Very fine grids are limited (the window says so).
- **Brightness**, **Contrast** and **Invert** (marks on the light parts, for light ink on dark
  paper).
- **Method**: **Ordered** gives a tidy, regular pattern; **Diffusion** looks more organic, like
  film grain; **Halftone** puts a mark in every cell and makes it bigger where the picture is
  darker, like newspaper photos (very light cells get none). With Halftone, **Size** is the
  size of the darkest marks. Dots can't change size, so with dots Halftone places them like
  Ordered.
- **Shape** of each mark (circle, square, dot, line, × or +) and its **Size** as a share of the
  cell, so marks can touch or leave gaps. **Line** marks have an **Angle**. A **dot** is a
  single pen tap, the quickest to plot.
- **Show the picture underneath** compares the marks with the original.

The header shows how many marks there are and the size on paper. **Use image** opens the result
like an SVG ("photo (dithered).svg"), so fills, transforms, passes and path optimizing all work
on it; marks are plotted row by row, back and forth. **Edit image…** (under **Doodle…**) reopens
the picture with the same settings, and **Save SVG…** saves the marks as a file. The picture and
its settings are saved in the project.

## 3D models

A 3D model becomes evenly spaced parallel lines, like contour lines wrapped around it, drawn as
seen from the angle you choose. Opening a model opens the **3D model** window: the model on the
left (drag to turn it, right-drag to move it, scroll to zoom), and on the right the lines as
they'll be plotted, updated when you let go.

- **Lines**: how many slices. **Direction**: horizontal slices, or vertical ones side to side or
  front to back. **Tilt** turns the slices at an angle.
- **Visible part** draws only the parts of the lines you can see from this angle, so the model
  looks solid. **Full mesh** draws every line, the back too, like a wireframe.
- **Perspective** or **Flat** (no perspective: lines that are parallel stay parallel), and
  quick views: **Front**, **Side**, **Top** and **¾**.
- **Width**: how wide the result is on the paper, in mm.

Every mesh in the file is used, and big models are scaled to fit. A `.gltf` whose data is in
separate files won't open: export it as `.glb`. **Use model** opens the lines like an SVG
("teapot (sliced).svg"); **Edit 3D model…** (under **Doodle…**) reopens it with the same view
and settings, which are saved in the project with the model.

## Auto-reload

When you open an SVG file, **Auto-reload** appears in the toolbar (on by default). Edit and save
the file in Illustrator, Inkscape or your code, and Plotka reloads it within a moment,
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
- its name and a count of strokes / filled shapes. Double-click the name to rename the layer
  (Enter keeps it, Esc cancels),
- a **duplicate** button: adds a copy right after it, with the same settings, which you can then
  change on their own. The copy sits exactly on top of the original until you move it with
  **Arrange**,
- an **eye**: show or hide it in the preview. Hiding doesn't stop it plotting: a hidden layer
  that's still ticked gets an orange outline on its checkbox and a warning.
- a **checkbox**: plot it or not. Unticked layers show faintly in the preview.
- **✕**: remove the layer from the drawing. "N removed layers · Restore" under the list brings
  them back, and so does Undo. Removed layers stay removed in the saved project.

## White shapes

White and near-white fills (paper colored) are never drawn. They still **hide whatever is under
them** in the same layer, the way they look in the file. A note in the Fill tab says how many
there are. In **By color** mode they are left out completely.
