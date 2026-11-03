# Getting started

Plotter Studio turns artwork into pen plots: open an SVG (or draw one), set up the paper and
fills, check the preview, and plot over USB.

## The window

- **Toolbar** (top): Open, Save, Undo / Redo, Doodle, Help, the file name, and a summary of the
  plot: number of paths, how far the pen draws, how far it travels with the pen up, and the
  estimated time.
- **Left panel**: the layers of your artwork, and the transforms (Tile, Tessellate).
- **Preview** (middle): exactly what the pen will draw, on the paper.
- **Right panel**: four tabs. **Page** (paper and placement), **Fill** (fills and passes for the
  selected layer), **Machine** (connecting and moving the plotter) and **Plot** (starting a plot,
  stats and path optimization).

## Light and dark

The app follows the light or dark setting of macOS. To pick one for the app only, choose
**View > Appearance > Light** or **Dark**; **Use System Setting** follows macOS again. The
choice is kept for next time. The paper in the preview stays white either way.

## Your first plot

1. **Open artwork**: click **Open…** (⌘O) or drop an SVG on the window. Or click **Doodle…**
   and draw something.
2. **Set up the page**: in the **Page** tab, pick the paper size and orientation, and the
   margins. By default the artwork is scaled to fit inside the margins.
3. **Fill shapes** (optional): select a layer, open the **Fill** tab and pick a fill type.
4. **Connect**: plug in the plotter and switch it on. In the **Machine** tab, click
   **Connect**.
5. **Set the pen heights**: drag the **Up** and **Down** sliders until the pen clears the paper
   when up and just touches it when down.
6. **Set home**: click **Motors off**, slide the carriage by hand to the top-left corner of the
   paper. That spot is home: the top-left corner of the page in the app.
7. **Plot**: in the **Plot** tab, click **Start plot**. Pause any time with **Pause**, the
   Space bar or the button on the plotter.

Save your work with **Save** (⌘S). See [Projects and undo](11-projects.md).

## No plotter? No problem

Everything except plotting works without a plotter. To try plotting, choose **Simulated plotter**
in the Machine tab: it behaves like the real one, in real time.
