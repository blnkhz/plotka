# Plan: DRIVER-1, 2, 3, 5 and PLOT-1 to 4 (connect, manual controls, plot)

## Pieces

- `packages/plotter/src/driver/ebb-driver.ts` (pure TS): `EbbDriver` implements `PlotterDriver`
  over a small `Transport` interface (write / data / close). Everything learned in DRIVER-0:
  - Commands are serialized; replies are matched in order. `!` replies are errors.
  - Reply timeouts grow with the queued motion (one-slot FIFO delays replies); after a timeout
    the driver resyncs (waits out the queue, drops late lines) before the next command.
  - QG clears the button latch, so every QG read (including `waitIdle` polling) remembers a press
    until `queryButton` takes it.
  - Firmware older than 2.6.2 (no QG) is refused with a clear message.
- `apps/desktop/src/main/serial.ts`: the `serialport` transport and port listing (main process
  only). Lists `/dev/cu.*` on macOS, marks EBB boards (VID:PID 04D8:FD92) and picks a single
  match automatically. "Resource busy" becomes "in use by another program".
- `packages/plotter/src/plot/runner.ts` (pure TS, tested with the simulator): `PlotRunner` runs a
  plan with pause, resume, stop and the physical button.
  - Moves are sent one segment at a time, so at most one command is queued ahead (pause reacts
    within one segment, ≤ 0.2 s of motion).
  - **Pause** (button or app): finish the queued segment, raise the pen, remember where.
    **Resume**: travel back there if the carriage moved (jogging while paused is allowed), lower
    the pen if it was down, continue. The button toggles pause/resume.
  - **Stop**: raise the pen, travel home.
  - **Disconnect**: the run stops with an error and keeps its resume point; after reconnecting,
    Resume continues (only if the carriage wasn't moved by hand).
  - Progress events: state, planned time done/total, elapsed, current layer, pen position.
- `apps/desktop/src/main/plotter.ts`: owns the driver (real or simulated) and runner, plans in
  the main process with the same planner, keeps the computer awake during plots
  (`powerSaveBlocker`), asks before closing the window mid-plot, and pushes status to the UI.

## Home and position

The AxiDraw has no limit switches. As in the vendor software, home is where the carriage is
when the motors switch on. "Motors off" forgets the position; the next motion (jog, home, plot)
switches them on and treats that spot as home. The Machine tab says so. Jogs are kept inside the
machine's travel measured from home.

## UI

- **Machine tab**: port list with auto-select, Connect / Disconnect / Reconnect, firmware, a
  "Simulated plotter" option. Manual controls: pen up / down / toggle, motors off, home, jog
  1 / 10 / 50 mm. Pen height sliders that move the servo live (DRIVER-3); heights are saved and
  used for every layer.
- **Plot tab**: layer checkboxes (pass layers included, plotted top to bottom), Start / Pause /
  Resume / Stop, progress bar, elapsed and remaining time, current layer. The preview shows the
  live pen position.
- Keyboard: Space pauses/resumes during a plot, U / D pen up / down when idle.
