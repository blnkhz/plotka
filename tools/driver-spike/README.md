# DRIVER-0 spike

A one-off script that checks the plotter protocol on real hardware before the driver is built.
It asks before every motion and saves a report to `reports/` (git-ignored; it contains your
board's serial number).

## Run it

1. Plug in the plotter's USB cable **and** its power supply.
2. Quit the AxiDraw / NextDraw app, Inkscape, and anything else that might hold the port.
3. From the repo root:

   ```sh
   pnpm spike
   ```

   or pick the port yourself: `pnpm spike --port /dev/cu.usbmodem1101`

4. Follow the prompts. Enter = do it, `s` = skip, `q` = quit. Ctrl+C stops the motors and
   lifts the pen.

What it does: lists serial ports, reads the firmware version and power, pen up/down/up,
10 mm moves in X and Y and back, an optional 100 mm pen-down line to check the scale, and
reads the pause button.

`--simulate` runs the same flow against a fake board, without hardware.
