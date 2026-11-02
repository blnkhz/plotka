# Connecting and moving the plotter

The **Machine** tab connects to the plotter and moves it by hand. It works with AxiDraw and other
plotters with the EiBotBoard (EBB) controller. The default machine is the AxiDraw V3/A3.

## Connecting

1. Plug the plotter into USB and switch its power on.
2. Open the **Machine** tab. The plotter shows up in **Port** as "EBB plotter" and is picked
   automatically. If not, click **Refresh**.
3. Click **Connect**. The firmware version shows once it's connected.

**Simulated plotter (no hardware)** in the Port list connects to a pretend plotter that moves in
real time, for trying things out.

If the plotter is in use by another program (the AxiDraw software or Inkscape's AxiDraw
extension), close that program first. If the USB cable comes out, the app says so and offers
**Reconnect**.

## Home

The plotter has no sensors to find its corner, so **home is wherever the carriage is when the
motors switch on**. Home is the top-left corner of the page in the app.

1. Click **Motors off** (if they're on). The carriage now slides freely.
2. Slide it by hand so the pen is over the top-left corner of the paper.
3. The motors switch on with the next move or plot, and that spot becomes home.

**Position** shows where the pen is from home, or "Not set" while the motors are off.

## Moving by hand

- **Pen**: **Up**, **Down**, **Toggle** (or the U and D keys).
- **Jog**: pick a step (1, 10 or 50 mm) and use the arrows. Moves stay inside the plotter's reach.
- **Home**: lifts the pen and goes back to home.
- **Motors off**: lets the carriage move freely; forgets home.

## Pen height

Drag **Up** and **Down**: the pen moves as you drag, so you can see it. Set **Up** so the pen
clears the paper comfortably and **Down** so it just touches. A pen pressed too hard skips and
wears; too light and lines break up. The heights are remembered and used for every layer.
