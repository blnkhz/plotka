# Plotting

The **Plot** tab starts and controls plots.

## Before you start

- Connect the plotter and set the pen heights (see [Connecting](08-machine.md)).
- Set home: the pen over the top-left corner of the paper.
- Choose the layers to plot: the checkboxes under **Layers, in order**. They plot top to bottom,
  with the same pen.

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

## If the cable comes out

The plot stops and the app keeps its place. Plug the cable back in, **Reconnect** in the Machine
tab, then **Resume**. This only works if the carriage wasn't moved while it was unplugged: the
motors go limp without USB. Otherwise click **Stop**.

## Time and distance

The toolbar shows the estimated time, how far the pen draws, and how far it travels with the pen
up. The estimate uses the same motion plan the plotter follows, including pen lifts, so it's
close to the real time. The **Stats** table has these numbers per layer.

## Multiple colors

Plot one layer, pause or let it finish, change the pen, then plot the next layer. Don't turn the
motors off between colors, or the layers won't line up. For layered color effects, see
[Passes](05-passes.md).
