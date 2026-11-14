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

## Machine profiles

**Machine → Profile** picks your plotter. Each profile holds its travel (how far it can reach),
motor steps per mm, top speeds, acceleration and pen-lift servo settings.

- **Tested**: the AxiDraw V3/A3, confirmed on real hardware.
- **Not yet tested**: the other AxiDraw models (V2/V3/SE A4, V3 XLX, V3/B6, MiniKit, SE/A2,
  SE/A1) and the Bantam Tools NextDraw 8511, 1117 and 2234. Their values come from the makers'
  documentation. Plot a small test first (the calibration plot in the hardware checklist is
  ideal), and please report how it went so the profile can be marked tested.
- **Your profiles**: **Duplicate to edit** makes your own copy of any profile, with fields for
  the travel, steps per mm, speeds, acceleration and servo. Changes are checked as you make them
  and saved for next time. **Delete** removes one of yours.

NextDraw notes: their brushless pen lift is driven on servo pin 2 with its own signal range, and
their automatic homing isn't used yet, so move the carriage to the home corner by hand like an
AxiDraw. After changing the profile while connected, disconnect and connect again.
