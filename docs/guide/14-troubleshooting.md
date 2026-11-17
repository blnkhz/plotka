# Troubleshooting

## Connecting

- **No plotter in the Port list**: check the USB cable and that the plotter's power is on, then
  click **Refresh**. Try another cable or port if it still doesn't show.
- **"In use by another program"**: close the AxiDraw software, Inkscape, or any other app talking
  to the plotter, then connect again.
- **"Firmware too old"**: the plotter's controller needs firmware 2.6.2 or newer. Update it with
  the plotter maker's updater.

## The plot

- **Wrong place on the paper**: home is where the carriage was when the motors switched on. Turn
  the **Motors off**, put the pen over the top-left corner of the paper, and start again.
- **Part of the drawing is missing**: anything outside the paper or the plotter's reach is cut
  off (shown red and dashed in the preview). Check the margins, the fit and the paper size.
- **The pen drags between shapes**: raise the **Up** pen height in the Machine tab.
- **Broken or faint lines**: lower the **Down** pen height a little.
- **Ink pools or bleeds**: the fill spacing may be too tight for the pen; increase **Spacing**.
- **Colors from passes don't line up**: the paper or carriage moved, or the motors were turned
  off between pens.

## The artwork

- **Text is in the wrong typeface**: text in a file is drawn in the closest single-stroke
  style. To keep the file's own typeface, convert the text to outlines (paths) in your design
  app first.
- **Filled shapes are empty**: fills are only drawn with a fill type; pick one in the Fill tab.
- **A white shape hides part of the drawing**: white fills hide what's under them, like in the
  file. Turn off **Hide parts covered by shapes on top** in the Fill tab to draw everything.
- **Everything is one layer**: try **By color** in the Layers panel.

## Reporting a problem

Plotka keeps a log of what it did: the app and system versions, connecting to the plotter,
each plot and how it ended, and any errors. Choose **Help › Show Log File** to find it in
Finder or File Explorer. On macOS it's `~/Library/Logs/Plotka/plotka.log`; on Windows,
`%APPDATA%\Plotka\logs\plotka.log`. The log has no artwork in it.

To report a bug, choose **Help › Report a Problem…**. It opens the bug report form on
[GitHub](https://github.com/blnkhz/plotka/issues) with the app and system versions filled in,
and shows the log in Finder or File Explorer. Drag the log into the form, and the SVG or project
file if you can.
