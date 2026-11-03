# Page setup

The **Page** tab sets the paper and where the artwork goes on it.

## Presets

Save page setups you use often: set the paper, margins and position, type a name (for example
"A4 landscape 15 mm") and click **Save preset**. Pick it from **Use** to apply it in one go; saving
under an existing name replaces it, and **Delete** removes the selected one. Presets are kept for
you across all projects.

## Paper

- **Size**: A5, A4, A3, Letter, Legal, Tabloid, 9×12 in, 5×7 in, 6×6 in, or **Custom** with
  your own width and height in mm or inches.
- **Orientation**: **Portrait** or **Landscape**.
- **Margins**: the area the artwork is fitted into. Tick **Same on all sides** for one margin,
  or set top / bottom and left / right separately.

If the paper is bigger than the plotter can reach, a red message says so and plotting is
blocked. The dashed outline in the preview shows the machine's reach (turn it on and off with
**Bed** above the preview).

## Position

- **Fit**: **Original** keeps the file's size (100%). **Fit** scales the artwork to fit inside
  the margins. **Fill** scales it to cover the margins and crops what sticks out.
- **Align**: where the artwork sits inside the margins (click one of the nine squares).
  **As in file** keeps it where the file's artboard puts it instead.
- **Scale**: extra scaling in %, on top of the fit.
- **Rotation**: turn the artwork by 90°, 180° or 270°, or type any angle. Turning never changes
  its size; if the turned artwork sticks out of the margins (shown in red), lower **Scale**.
- **Offset X / Y**: nudge the artwork in mm.

Anything outside the paper (or the plotter's reach) is cut off and shown in red, dashed.

## Moving and resizing layers

Click **✥ Arrange** above the preview to move and resize things by hand.

- **Click** a layer's lines (or inside a filled shape) to select it, or pick it in the Layers
  list. With more than one layer, click empty paper to select **all layers** and move them
  together. The selection gets a dashed box with handles; the other layers show faint boxes.
- **Drag** inside the box to move it. **Drag a handle** to resize: corners keep the proportions
  (hold **⇧** to stretch freely), the side handles stretch one way, and **⌥** resizes around the
  center.
- **Drag the round handle** above the box to turn it around its center. It snaps to 0°, 90°,
  180° and 270°; hold **⇧** for 15° steps. A turned layer's box turns with it, and its handles
  resize it along its own sides.
- While dragging, edges and centers **snap** to the margins, the paper's edges and center, and
  other layers (a red line shows the match). Hold **⌘** to drag without snapping.
- The **arrow keys** nudge by 1 mm (**⇧** for 10 mm).
- **Esc** or **Done** goes back to normal; dragging then moves the view again. In arrange mode,
  drag off the paper or hold **Space** to move the view.

Each drag is one undo step. Moving a layer is saved with the project; it's measured on the
paper, after **Fit**, **Scale** and **Offset** above (which stay as they are), and fills, passes
and clipping follow it. The **Position** section in the
Fill tab has the exact numbers for the selected layer (**Move X / Y** in mm, **Size W / H** in
%, **Rotation** in degrees) and **Reset position**. Fills are made after a layer is turned, so
hatching keeps its own angle (and lines up with the other layers) rather than turning with it.

## The preview

- Drag or scroll to move around; pinch (or a mouse wheel) zooms, as do the **−** and **+**
  buttons. **Fit** (or the F key) shows the whole page.
- **Travel** shows the pen-up moves between lines.
- **Original** shows the artwork as it is in the file, faintly, under the plot.
- **Bed** shows the plotter's reach; **Margins** shows the margin box.
- **▶ Playback** shows the plot being drawn in order, timed like the real plot: drag the slider
  to any moment, press play, and pick a speed (1× to 100×). Everything not yet drawn shows
  faintly, and the blue ring is where the pen would be. ✕ closes it.
- **Line width** sets how thick lines are drawn in the preview. It doesn't change the plot: the
  plotter draws with whatever pen is in it. Set it to your pen's tip width (for example 0.3 mm
  for a fineliner) for a more accurate view of how dense and dark the plot will look. It's also
  the stroke width of an exported SVG.
- **Parallel pen** shows the plot as a broad-edge pen would draw it, such as a Pilot Parallel:
  lines are wide across the nib and thin along it, like calligraphy. Pick the nib width from the
  Pilot Parallel sizes (1.5, 2.4, 3.0, 3.8, 4.5 or 6.0 mm) or choose **Custom…** and type your
  own. **Angle** is how the nib is turned, counterclockwise from horizontal (45° is the usual
  italic angle). Like Line width, it only changes the preview: hold the pen in the plotter at
  the same angle to get the same result. It's saved with the project.
- The blue ring is the pen's position when the plotter is connected; it's filled while the pen
  is down.
