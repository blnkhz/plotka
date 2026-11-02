# Plotting

The **Plot** tab starts and controls plots.

## Before you start

- Connect the plotter and set the pen heights (see [Connecting](08-machine.md)).
- Set home: the pen over the top-left corner of the paper.
- Choose the layers to plot: the checkboxes under **Layers, in order**. They plot top to bottom,
  with the same pen.
- **Dry run** traces a rectangle around the drawing with the pen up, then goes home. Watch the
  pen: if it would leave the paper, fix the paper or the page setup before plotting.

## Start, pause, resume, stop

- **Start plot** begins.
- **Pause** (or Space, or the button on the plotter) finishes the current short move, lifts the
  pen and waits. While paused you can change or fix the pen, or jog in the Machine tab.
- **Resume** (or Space, or the plotter's button again) goes back to exactly where it stopped,
  lowers the pen and carries on.
- **Stop** lifts the pen and goes home.

The progress bar shows how far along the plot is, the time so far and the time left. The blue
ring in the preview follows the pen.

During a plot the computer won't go to sleep, and closing the window asks first.

## Continuing after a problem

If the pen runs dry, skips, or the paper moves: click **Stop**, fix the problem (change the pen,
re-tape the paper at the same spot), then continue. After a stop the Plot tab shows where it got
to, for example "Stopped at path 37 of 120 in Layer 1, 42.0 mm along it", with:

- **From path**: where to continue. It starts at the path where it stopped; earlier paths are
  skipped. Pick an earlier path to redo a stretch that came out faint.
- **Back up**: when continuing the path it stopped in, start this many mm before the stop point,
  so the line has no gap (1 mm by default).
- **Continue plot** plots the rest, with the same paths and settings as the stopped plot.
  **Forget** hides the panel.

For a quick break, **Pause** and **Resume** are simpler: they pick up exactly where the pen left
off.

## If the cable comes out

The plot stops and the app keeps its place. Plug the cable back in, **Reconnect** in the Machine
tab, then **Resume**. This only works if the carriage wasn't moved while it was unplugged: the
motors go limp without USB. Otherwise click **Stop**.

## Speed

Each layer has its own speeds, in the **Fill** tab under **Speed**:

- **Drawing**: speed with the pen down. The default, 25%, suits most pens. Go slower for thin,
  dry or scratchy pens (fineliners, metallic markers) and for rough paper; faster for gel and
  ballpoint pens on smooth paper.
- **Moving**: speed with the pen up, between lines (default 75%).

The mm/s next to each shows the actual speed on your machine. Speeds are saved in the project,
and the time estimate follows them. **Use these settings on all layers** copies them to the
other layers.

## Time and distance

The toolbar shows the estimated time, how far the pen draws, and how far it travels with the pen
up. The estimate uses the same motion plan the plotter follows, including pen lifts, so it's
close to the real time. The **Stats** table has these numbers per layer.

## Multiple colors

Plot one layer, pause or let it finish, change the pen, then plot the next layer. Don't turn the
motors off between colors, or the layers won't line up. For layered color effects, see
[Passes](05-passes.md).
