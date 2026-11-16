# Epics 5 and 6 plan: DRIVER-4 simulator, MOTION-1, MOTION-2

Build order step 7. The DRIVER-0 spike confirmed the protocol, mixed-axis directions and the
one-command FIFO. Steps/mm (80) is still waiting on the 100 mm measurement; it's a profile value,
so confirming it later won't change any code.

Everything here lives in `packages/plotter` and is pure TypeScript (no Node, Electron or DOM), so
the renderer can use the same planner for the time estimate that the main process uses to plot.
The serial transport (DRIVER-1) will be a separate entry point that only the main process imports.

## Profile (DRIVER-5 groundwork)

`MachineProfile` gains the values the planner and servo math need, all from
`docs/hardware-notes.md`:

- `stepsPerMm` (80 at 16x), `maxStepRate` (25 000 steps/s per motor, EBB docs).
- `motion.accelPenDown` 1016 mm/s², `motion.accelPenUp` 1524 mm/s² (40 / 60 in/s²).
- `servo`: range 9855–27831, sweep 200 ms, move time 45 ms + 2.69 ms per %, raise rate 75%,
  lower rate 50%, default heights 60 / 30%.

`penLiftDelay` goes away; pen move time is computed from the heights and rates the same way the
vendor software does (slowest of the servo's travel time and the rate-limited sweep, combined
smoothly). Behavior read from AxiDraw's `pen_handling.py` (GPL); no code copied.

## MOTION-1 planner (`motion/plan.ts`)

Input: the optimized `Toolpath`, the profile, and per-layer settings (speeds %, pen heights).
Output: a `Plan`, a flat list of items the driver executes in order:

- `servo`: pen heights and rates for the layer (sent when a layer starts).
- `pen`: up or down, with the time to wait for the servo.
- `move`: pen-down drawing or pen-up travel, as `MotionSegment`s (`{ ms, x, y }` in steps,
  sent as `XM,ms,x,y`). Each move records its layer and path index, for progress and resume.

Pen-down paths use a lookahead planner:

1. Corner speed limit at each vertex from the turn angle (junction deviation, default
   0.05 mm: a planner setting, not a hardware value). Straight runs aren't limited.
2. Backward then forward pass so every speed change is reachable within the acceleration limit.
   Paths start and end at rest.
3. Each segment gets a trapezoid (accelerate, cruise, decelerate). Accelerating phases are
   sliced every 25 ms; cruise is split into chunks of at most 200 ms so pause stays responsive.
4. Samples closer than 5 ms apart are merged, so tiny flattened segments don't flood the
   one-command FIFO.

Pen-up travel is one straight rest-to-rest move with the pen-up speed and acceleration.

Step conversion: every sample's target is rounded to absolute steps, and each command sends the
difference from the last target, so rounding never accumulates (the 100 mm square test checks
this). Command time is the slice time rounded up to whole ms, so the machine never goes faster
than planned. A command that would exceed 25 000 steps/s on either motor is stretched.

## MOTION-2 estimate

The estimate is the sum of the plan's command times and pen waits: the same numbers the
simulator and the real driver execute. The app shows it per layer and in total, before and after
optimization. USB latency isn't modeled; the hardware test (a timed drawing) checks the 10% goal.

## DRIVER-4 simulator (`driver/sim.ts`)

`PlotterDriver` follows the spec interface, with two changes: pen up/down take the wait time
from the plan, and `move` takes step segments. `home()` plans a travel back to 0,0.

`SimulatedDriver`:

- Logs every command in EBB syntax (`XM,…`, `SP,…`, `SC,…`, `EM,…`) through the same encoders
  the serial driver will use.
- Tracks motor steps, pen state, motor power and elapsed machine time.
- Runs instantly (default) or in real time with a speed factor.
- Injects faults: disconnect or timeout after N commands. A simulated button press can be
  queued.
- Rejects invalid moves (non-integer steps, zero time, step rate too high), so planner bugs
  surface in tests.

## Tests

- 100 mm square (and a random walk) return exactly to the start in steps.
- No command exceeds the speed limit (allowing for 1-step rounding) or the motor step rate.
- Corners make a path slower than a straight line of the same length; a long straight line
  reaches full speed and matches the analytic trapezoid time.
- Plan time equals simulator elapsed time.
- Simulator: logs, position, faults, button.

## UI

The time in the toolbar, stats table and optimize comparison comes from the planner. The core's
rough `toolpathStats` estimate stays only as a fallback in core tests.
