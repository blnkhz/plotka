# Hardware test checklist

Run this on a real plotter before a release, after changes to the driver, motion planner or
machine profiles, and when adding a new machine profile. Record the results in the table at the
end (copy it into the release notes or the pull request).

Test files are in [`docs/hardware-test/`](hardware-test/). Use the installed app (or `pnpm dev`),
A4 paper taped down, and a fineliner (about 0.3 mm).

## 0. Setup

- [ ] Connect: the plotter is found and picked automatically; firmware version shows.
- [ ] Pen height sliders move the pen live; set Up to clear the paper and Down to just touch it.
- [ ] Motors off, carriage by hand to the paper's top-left corner (home).
- [ ] Jog 10 mm right and down, then **Home**: the pen returns to the same spot (check with a pen
      dot before and after: the dots should overlap).

## 1. Calibration plot (`calibration.svg`)

Open it, set **Page → Fit** to **Original** (100%) and **Align** to top left, no fill.

- [ ] **Square**: the outer square measures **100.0 × 100.0 mm** (±0.3 mm) on both sides.
      Wrong size in one axis points to steps per mm or belt tension.
- [ ] **Square is square**: both diagonals are equal (±0.5 mm). A difference means the axes
      aren't at 90°.
- [ ] **Circle**: 80 mm across in every direction (±0.3 mm), and it closes without a gap or
      overlap where it starts.
- [ ] **Backlash** (the two blocks of lines 1 mm apart, drawn back and forth): lines are evenly
      spaced. Pairs that bunch up (alternating narrow and wide gaps) mean play in the drive: note
      roughly how much (e.g. 0.1 mm).
- [ ] **Corners**: the zigzag's points are sharp, not rounded or overshooting.
- [ ] **Small detail**: the 1 mm square is a square, not a blob.
- [ ] **Time**: the actual plot time is within **10%** of the estimate in the toolbar.

## 2. Pause, resume and stop

Plot `calibration.svg` again on fresh paper (or offset by 120 mm with **Offset X**).

- [ ] **Pause** in the app mid-line: the pen lifts and stays up. **Resume**: it lowers at the same
      spot; no gap and no double line at the join (look closely with a loupe).
- [ ] The same with the **button on the plotter** (press once to pause, again to resume).
- [ ] Pause, **jog** 20 mm away, **Resume**: it travels back and continues seamlessly.
- [ ] **Stop** mid-plot: the pen lifts and the carriage goes home.
- [ ] **Space** pauses and resumes.

## 3. Disconnect

- [ ] Mid-plot, unplug USB: the app says the plotter was disconnected and keeps the plot's place.
      Plug it back in, **Reconnect**, **Resume**: it continues (as long as the carriage wasn't
      moved).

## 4. Fills and speed

Open `long.svg` (a ring with a hole and a disc), **Fit** to the margins, fill **Crosshatch**
0.35 mm.

- [ ] Lines stop cleanly at the outlines and inside the hole; no lines in the white square.
- [ ] No skipped steps: the crosshatch stays aligned with the outlines from start to end (draw
      outlines too, to check).
- [ ] Faster test: raise **Fill → Speed → Drawing** in steps (40%, 60%, 80%) and repeat a small
      fill; note the highest speed that still plots cleanly with this pen.

## 5. Long plot (30+ minutes)

`long.svg` with the section 4 settings takes about 33 minutes at the default speeds (the toolbar
shows the estimate).

- [ ] The computer doesn't sleep during the plot.
- [ ] The plot finishes, ends at home, and the time is within 10% of the estimate.
- [ ] No drift: the last lines line up with the first ones and with the outlines.
- [ ] Closing the window mid-plot asks first.

## Results

| Date | App version | Machine (profile) | Firmware | Square (X × Y, diagonals) | Circle | Backlash | Time vs estimate | Pause / resume join | Long plot | Notes |
| ---- | ----------- | ----------------- | -------- | ------------------------- | ------ | -------- | ---------------- | ------------------- | --------- | ----- |
|      |             |                   |          |                           |        |          |                  |                     |           |       |
