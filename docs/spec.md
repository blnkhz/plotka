# Plotka: Build Spec for Claude Code

A desktop app that loads SVG artwork, lets me set up the paper and fills, previews exactly what the pen will draw, and drives an AxiDraw or Bantam Tools NextDraw plotter directly over USB. The goal is to never need the official AxiDraw/NextDraw software or the Inkscape extension again.

Working name: **Plotka**

### Known context

- **Primary machine:** AxiDraw V3/A3 with the standard servo pen lift. This is the only hardware that will be tested at first. Other EBB machines (other AxiDraw sizes, NextDraw) should work through machine profiles, but they're community-tested.
- **Primary OS:** macOS. Build, test and package for Mac first (universal build for Apple Silicon and Intel). Windows and Linux come later.
- **Input:** Mostly SVGs drawn in vector tools. More formats over time, so the importer must be pluggable.
- **Single pen for now.** Multi-pen plotting is on the later list (section 3, Epic 12).
- **Open source.** Built mainly for me, but shared with the plotter community along with the code. Not monetized. This means: a clear license, a good README, clean code that others can contribute to, and no dependencies or copied code that conflict with the chosen license.

---

## 0. How to use this document (instructions for Claude Code)

1. Read the whole file before writing code. Work epic by epic, in order. Each epic ends in a usable state.
2. Before starting an epic, write a short plan in `docs/plans/<epic-id>.md`, then implement, then check every acceptance criterion in that epic.
3. The geometry core (`packages/core`) must be pure TypeScript with no Electron, DOM or Node APIs. Everything in it gets unit tests (Vitest). This is what makes future features like kaleidoscope and fractal transforms cheap to add.
4. Never send motion commands to real hardware from tests. Use the simulated driver (Epic 5) for all automated tests.
5. When a hardware detail is uncertain (firmware command syntax, steps per mm, bed size, servo ranges), do not guess. Read the reference sources in section 9, write down what you found in `docs/hardware-notes.md`, and make the value configurable.
6. Ask me before adding a dependency that is large, native (other than `serialport`), or copyleft licensed (GPL, AGPL). This project is open source under MIT (see SETUP-4), so check every dependency's license and never copy code from a project with an incompatible license. Reading other projects to understand behavior is fine.
7. Commit after each user story with a message that references the story ID (for example `feat(core): HATCH-2 crosshatch fill`).
8. Keep UI copy plain and short. No marketing language in the app.

---

## 1. Technology decision

**Electron + React + TypeScript**, built with `electron-vite`, packaged with `electron-builder`.

Why not a pure browser tool:

- Plots can run for hours. Browser tabs get throttled or discarded in the background, and a lost connection mid-plot ruins the sheet. Electron lets the plot loop run in the main process (or a utility process) and lets us call `powerSaveBlocker` so the machine doesn't sleep.
- Web Serial only works in Chromium browsers. Electron with the `serialport` package works the same everywhere.
- Native file access makes recent files, autosave, and watching an SVG that's being edited in another app (hot reload) straightforward.

Why not Tauri: it's a fine choice, but the serial plus geometry stack is all JS/TS, and keeping one language end to end keeps the core reusable. If bundle size becomes a problem we can revisit.

The architecture keeps the door open to a browser version later: the core is pure TS, and the driver sits behind an interface that a Web Serial transport could implement.

### Stack

| Concern | Choice |
|---|---|
| Shell | Electron (latest stable), electron-vite |
| UI | React 18+, TypeScript strict, Zustand for state |
| Styling | CSS modules or Tailwind, your call; keep it simple |
| Preview rendering | HTML Canvas 2D first; move to WebGL (regl or PixiJS) only if 100k+ segment files are slow |
| SVG parsing | DOMParser in a worker, plus `svgpath` or `svg-path-commander` for path data |
| Polygon ops (fills, clipping, offsets) | `clipper2-js` (or `js-angusj-clipper` if clipper2 is a problem) |
| Serial | `serialport` (main process only) |
| Tests | Vitest for core, Playwright for a few UI smoke tests |
| Lint/format | ESLint + Prettier |

### Repo layout

```
plotter-studio/
  apps/desktop/          # Electron main, preload, renderer (React)
    src/main/            # window, serial, plot job runner, file IO
    src/preload/         # typed IPC bridge
    src/renderer/        # React UI
  packages/core/         # pure TS: geometry, import, fills, optimize, transforms
  packages/plotter/      # driver interface, EBB protocol, motion planner, simulator
  docs/                  # plans, hardware notes, decisions
```

Use pnpm workspaces.

---

## 2. Core concepts and data model

Everything internal is in **millimeters**, origin top left of the paper, y pointing down.

```ts
type Vec2 = { x: number; y: number };

type Polyline = { points: Vec2[]; closed: boolean };

type Layer = {
  id: string;
  name: string;
  color: string;          // display color, also used for pen mapping
  visible: boolean;
  plot: boolean;          // include in plot
  penId: string;          // which physical pen
  strokes: Polyline[];    // outlines from the source
  fills: FillRegion[];    // closed shapes that can be hatched
  settings: LayerSettings;
};

type FillRegion = { outer: Vec2[][]; fillRule: 'nonzero' | 'evenodd' };

type LayerSettings = {
  speedPenDown: number;   // % of max
  speedPenUp: number;
  penPosUp: number;       // 0..100
  penPosDown: number;
  fill: FillSettings | null;
  drawOutline: boolean;
};

type FillSettings = {
  type: 'none' | 'lines' | 'crosshatch' | 'zigzag' | 'concentric' | 'spiral' | 'dots';
  spacing: number;        // mm between lines (this is "line density")
  angle: number;          // degrees
  crossAngle?: number;    // second pass for crosshatch
  inset: number;          // mm pulled in from the outline, so fills don't overrun the stroke
  connect: boolean;       // join adjacent hatch lines without lifting the pen when safe
};
```

The **processing pipeline** is a list of pure steps. This is the backbone for future features:

```
Import -> Normalize (flatten transforms, units -> mm, curves -> polylines)
       -> Transforms (user-chosen, ordered, e.g. kaleidoscope, fractal, rotate)
       -> Fit to page (scale, align, margins)
       -> Fills (hatch generation per layer)
       -> Clip to printable area
       -> Optimize (merge, dedupe, order, reverse)
       -> Plan (pen up/down + moves per layer)
```

```ts
interface PipelineStep<P> {
  id: string;
  label: string;
  paramsSchema: ParamSchema;          // drives the auto-generated settings UI
  apply(doc: PlotDocument, params: P): PlotDocument;   // pure, no side effects
}
```

Each step is pure and cached by input hash so the preview updates quickly when only a later step changes.

The **project file** (`.plot.json`) stores: source SVG (embedded or path), page setup, layer settings, pipeline steps with params, machine profile ID. Not the computed geometry.

---

## 3. Epics and user stories

Story format: ID, story, acceptance criteria (AC). Priority: **P0** = MVP, **P1** = soon after, **P2** = later.

### Epic 1: Project setup (SETUP)

**SETUP-1 (P0)** As a developer, I want the monorepo scaffolded so I can build and run the app.
- AC: `pnpm dev` opens an Electron window with a React page. `pnpm test` runs Vitest across packages. `pnpm build` produces a runnable macOS app.
- AC: TypeScript strict mode, ESLint and Prettier configured, CI-ready scripts.

**SETUP-2 (P0)** As a developer, I want a typed IPC bridge so renderer code never touches Node directly.
- AC: `contextIsolation: true`, `nodeIntegration: false`. Preload exposes a typed `window.api` object. A shared types file defines every channel.

**SETUP-3 (P0)** As a user, I want a macOS app I can install.
- AC: electron-builder produces a universal `.dmg` (Apple Silicon + Intel). Unsigned is fine for my own use.
- AC: The `serialport` native module is rebuilt correctly for Electron on both architectures.

**SETUP-4 (P0)** As the maintainer, I want the repo ready to be public.
- AC: `LICENSE` (MIT), `README.md` (what it is, supported machines, screenshot placeholder, install, dev setup), `CONTRIBUTING.md` (how to run, test, add a machine profile, add an importer, add a transform), `CODE_OF_CONDUCT.md`.
- AC: Issue templates for bugs (with a "machine model / firmware version / macOS version" section) and feature requests.
- AC: GitHub Actions runs lint and tests on every PR.
- AC: No personal paths, secrets or machine-specific values committed.

**SETUP-5 (P1)** As someone in the plotter community, I want to download a release without building from source.
- AC: GitHub Actions builds the macOS `.dmg` on tagged releases and attaches it to the GitHub release.
- AC: README explains how to open an unsigned app on macOS (right click > Open, or System Settings > Privacy & Security). Signing and notarization need a paid Apple Developer account; leave a documented hook so it can be turned on later.

**SETUP-6 (P2)** As a Windows or Linux user, I want builds for my OS.
- AC: electron-builder targets for nsis and AppImage, built in CI. Marked "community tested" in the README.

### Epic 2: Import and normalize (IMPORT)

**IMPORT-1 (P0)** As a user, I want to open an SVG by file picker or drag and drop.
- AC: Tested with SVGs exported from Illustrator, Inkscape, Figma and Affinity Designer (each has its own quirks around units, `viewBox` and groups). Keep one fixture per tool.
- AC: Supports `path`, `line`, `polyline`, `polygon`, `rect` (including rounded), `circle`, `ellipse`. Ignores `text` with a visible warning ("Text isn't supported, convert to paths first").
- AC: Nested `transform` attributes, `viewBox`, `preserveAspectRatio` and `<use>` references resolve correctly.
- AC: Units from `width`/`height` (mm, cm, in, pt, px at 96 dpi) convert to mm. Unitless defaults to px.

**IMPORT-2 (P0)** As a user, I want curves converted to smooth polylines.
- AC: Bezier and arc segments flatten with a tolerance setting (default 0.05 mm), adaptive so tight curves get more points.
- AC: Unit tests cover each SVG command, relative and absolute.

**IMPORT-3 (P0)** As a user, I want my SVG's layers respected.
- AC: Inkscape layers (`g` with `inkscape:groupmode="layer"`) become app layers with their labels.
- AC: If there are no Inkscape layers, offer a choice: one layer, or split by stroke color.
- AC: Hidden elements (`display:none`, `visibility:hidden`) are skipped.

**IMPORT-4 (P0)** As a user, I want shapes with a fill to become fill regions.
- AC: Any element with a non-none fill becomes a `FillRegion` with its `fill-rule`. Its outline becomes a stroke only if it has a stroke or `drawOutline` is on.

**IMPORT-5 (P1)** As a user, I want the app to reload the SVG when it changes on disk, so I can edit in Illustrator/Inkscape/code and see the plot update.
- AC: File watcher on the source, reload keeps all settings, toggle in the toolbar.

**IMPORT-6 (P0)** As a developer, I want importers to be pluggable, so new file formats can be added without touching the rest of the app.
- AC: An `Importer` interface in `packages/core/src/importers/`:
  ```ts
  interface Importer {
    id: string;                       // 'svg', 'dxf', ...
    label: string;
    extensions: string[];             // ['.svg']
    canImport(bytes: Uint8Array, filename: string): boolean;
    import(bytes: Uint8Array, filename: string, opts: ImportOptions): Promise<PlotDocument>;
  }
  ```
- AC: SVG is the first importer and goes through this interface. The file picker and drag and drop accept any registered extension.
- AC: `CONTRIBUTING.md` explains how to add an importer with fixtures and tests.

**IMPORT-7 (P1)** As a user, I want to import a plain list of paths from a generative script (JSON polylines with units), so I can skip SVG for code-made art.

**IMPORT-8 (P2)** As a user, I want more formats over time. Candidates, roughly in order of usefulness:
- DXF (CAD and laser cutter files; lines, polylines, arcs, splines)
- HPGL / `.plt` (classic plotter format)
- PDF and EPS vector content (via an embedded parser; skip raster images with a warning)
- G-code from other plotter tools (G0/G1 moves only)
- Each one is its own story when picked up, with an MIT-compatible parser library or a hand-written parser.

### Epic 3: Page and canvas setup (PAGE)

**PAGE-1 (P0)** As a user, I want to pick a paper size from presets or enter a custom size.
- AC: Presets: A5, A4, A3, Letter, Legal, Tabloid (11x17), 9x12 in, 5x7 in, 6x6 in, plus Custom (mm or in). Portrait/landscape toggle.

**PAGE-2 (P0)** As a user, I want margins and positioning controls.
- AC: Margin (uniform or per side). Fit modes: original size, fit to margins, fill margins (crop). Alignment: 9-point anchor. Manual scale %, rotation (0/90/180/270 plus free angle), X/Y offset.

**PAGE-3 (P0)** As a user, I want the app to warn me when the page or art is outside the machine's travel.
- AC: Machine bed drawn in the preview. Anything outside the printable area is clipped in the plan and highlighted in the preview. Blocking warning before plotting if the page is larger than the bed.

**PAGE-4 (P1)** As a user, I want to save page setups as named presets ("A4 with 15mm margin, landscape").

### Epic 4: Fills and line density (HATCH)

**HATCH-1 (P0)** As a user, I want parallel line fills with spacing and angle.
- AC: Spacing in mm (also shown as lines per cm). Angle in degrees. Respects fill rule and holes. Inset from outline configurable.
- AC: Unit tests: a square with a hole produces no lines inside the hole.

**HATCH-2 (P0)** As a user, I want crosshatch.
- AC: Two passes, second angle defaults to first + 90 (editable).

**HATCH-3 (P0)** As a user, I want serpentine/zigzag fills that keep the pen down between lines where it's safe.
- AC: Adjacent hatch lines are joined only when the connecting segment stays inside the region. Otherwise the pen lifts.

**HATCH-4 (P1)** As a user, I want concentric (contour) fills.
- AC: Repeated inward offsets at the spacing distance using clipper. Stops when the region vanishes.

**HATCH-5 (P1)** As a user, I want spiral fills for circles and roughly round shapes, clipped to the region.

**HATCH-6 (P2)** As a user, I want dot/stipple fills (short pen taps on a grid or jittered grid).

**HATCH-7 (P1)** As a user, I want per-layer fill settings, and a global default, so I can mix fill types in one drawing.

**HATCH-8 (P2)** As a user, I want density driven by the original fill color (darker = tighter spacing), so grayscale art translates to hatching.

### Epic 5: Plotter connection and driver (DRIVER)

The plotter is an EiBotBoard (EBB) based machine that talks a text command protocol over USB serial. Bantam Tools now maintains the AxiDraw line and its software (they publish `plotink`, the shared Python helpers), and their NextDraw machines are expected to use a compatible EBB protocol. **Confirm this in a spike before building on it** (DRIVER-0).

```ts
interface PlotterDriver {
  connect(portPath: string): Promise<DeviceInfo>;
  disconnect(): Promise<void>;
  penUp(): Promise<void>;
  penDown(): Promise<void>;
  setServo(up: number, down: number, rateUp: number, rateDown: number): Promise<void>;
  enableMotors(resolution: '16x' | '8x'): Promise<void>;
  disableMotors(): Promise<void>;
  move(segments: MotionSegment[]): Promise<void>;   // pre-planned, queued
  home(): Promise<void>;
  queryButton(): Promise<boolean>;                  // physical pause button
  queryPosition(): Promise<{ a: number; b: number }>;
}
```

**DRIVER-0 (P0, spike)** As a developer, I want to confirm the protocol on real hardware before building on it.
- AC: A small script lists serial ports, finds the EBB (USB VID/PID or by sending `V` and reading the version string), raises and lowers the pen, and moves 10 mm in X and back.
- AC: `docs/hardware-notes.md` records: firmware version, the exact commands used, steps per mm, servo ranges, the mixed-axis kinematics (two motors combine to make X and Y motion), and any NextDraw differences.
- AC: I run this with you on my AxiDraw V3/A3 (macOS) before Epic 5 continues. Note the macOS serial device name pattern (`/dev/cu.usbmodem*`) and use the `cu.` device, not `tty.`.

**DRIVER-1 (P0)** As a user, I want the app to find and connect to my plotter automatically.
- AC: Lists candidate ports, auto-selects a single match, shows model guess and firmware version. Reconnect button. Clear error if the port is busy (for example the official software is open).

**DRIVER-2 (P0)** As a user, I want manual controls: pen up, pen down, toggle, motors off (so I can move the carriage by hand), return home, and jog by 1/10/50 mm.

**DRIVER-3 (P0)** As a user, I want to calibrate pen heights with live sliders.
- AC: Moving the up/down sliders moves the servo in real time. Values save to the machine profile.

**DRIVER-4 (P0)** As a developer, I want a simulated driver that implements the same interface, logs commands, and tracks position, so the whole app runs and tests without hardware.
- AC: The simulator can run at real speed or instant, and can inject errors (disconnect, timeout).

**DRIVER-5 (P0)** As a user, I want a machine profile for my AxiDraw V3/A3: bed size, steps per mm, max speed, acceleration, servo settings.
- AC: The V3/A3 profile is built in and is the default. Its values come from vendor docs and DRIVER-0, with sources recorded in `docs/hardware-notes.md`. (The A3 travel is expected to be about 430 x 297 mm; verify, don't assume.)
- AC: Profiles are plain JSON files in `packages/plotter/profiles/`, so community members can add their machine with a PR.

**DRIVER-5b (P1)** As a community member with a different EBB machine (other AxiDraw sizes, NextDraw), I want a profile for it.
- AC: Add profiles for the other AxiDraw and NextDraw models from vendor docs, marked "untested" until someone confirms them. User can duplicate and edit any profile in the app.

**DRIVER-6 (P2)** As a user with a brushless pen-lift upgrade, I want that supported if it uses different servo settings.

### Epic 6: Motion planning (MOTION)

**MOTION-1 (P0)** As a user, I want smooth, fast plots that don't skip steps.
- AC: Trapezoidal (or S-curve) acceleration per polyline with lookahead, so corners slow down based on angle and straight runs reach full speed. Separate limits for pen-down and pen-up travel.
- AC: Converts mm moves into motor step moves with correct mixed-axis math and carries rounding remainders forward so error never accumulates.
- AC: Unit tests: a 100 mm square returns exactly to the start position in steps.

**MOTION-2 (P0)** As a user, I want an accurate time estimate before I start.
- AC: Estimate comes from the same planner used for the real plot, including pen lift delays. Within 10% of real time on a test drawing.

**MOTION-3 (P1)** As a user, I want per-layer speed overrides (slower for a fineliner, faster for a gel pen).

### Epic 7: Path optimization (OPT)

**OPT-1 (P0)** As a user, I want pen-up travel minimized.
- AC: Greedy nearest-neighbor ordering using a spatial index, with path reversal allowed. Optional 2-opt improvement pass with a time budget.
- AC: Preview stats show travel distance before and after.

**OPT-2 (P0)** As a user, I want touching paths joined so the pen doesn't lift needlessly.
- AC: Endpoints within a tolerance (default 0.1 mm) are merged into one polyline.

**OPT-3 (P1)** As a user, I want duplicate and overlapping segments removed so the pen doesn't draw the same line twice and soak the paper.

**OPT-4 (P1)** As a user, I want tiny segments filtered (below a length threshold) and polylines simplified (Ramer-Douglas-Peucker with a small tolerance).

**OPT-5 (P1)** As a user, I want closed shapes to start at the point nearest the previous pen position.

### Epic 8: Preview (PREVIEW)

**PREVIEW-1 (P0)** As a user, I want an accurate preview of what will be drawn on the page.
- AC: Shows paper, margins, machine bed, and pen-down strokes in each layer's color with a configurable stroke width (to mimic the pen tip). Pan and zoom (scroll, pinch, fit button).

**PREVIEW-2 (P0)** As a user, I want to toggle pen-up travel lines and the original SVG underneath.

**PREVIEW-3 (P0)** As a user, I want stats: pen-down distance, travel distance, number of pen lifts, path count, time estimate, per layer and total.

**PREVIEW-4 (P1)** As a user, I want a playback simulation with a scrubber, so I can watch the plot order at adjustable speed.

**PREVIEW-5 (P1)** As a user, I want the preview to stay responsive with big files.
- AC: Heavy pipeline steps run in a Web Worker. A drawing with 200k segments pans and zooms smoothly. Show a progress indicator while computing.

**PREVIEW-6 (P1)** As a user, I want to export the processed result as SVG (and the planned toolpath as JSON), so I can reuse it elsewhere.

### Epic 9: Plotting (PLOT)

**PLOT-1 (P0)** As a user, I want to start, pause, resume and stop a plot.
- AC: The plot loop runs in the main process, not the renderer. Pause lifts the pen and stops after the current segment. Resume returns to the exact spot, lowers the pen, and continues. Stop lifts the pen and returns home.
- AC: The physical pause button on the machine works the same as the on-screen one.

**PLOT-2 (P0)** As a user, I want live progress.
- AC: Progress bar, time elapsed and remaining, current layer, live pen position drawn over the preview.

**PLOT-3 (P0)** As a user, I want to choose which layers to plot in this run, and plot them in order with one pen.
- AC: Layer checkboxes in the Plot tab. Layers run top to bottom without pausing.
- AC: Keep the data model's `penId` field, so multi-pen (Epic 12) can be added without a migration.

**PLOT-4 (P0)** As a user, I want the computer kept awake and the plot protected.
- AC: `powerSaveBlocker` active during plots. Closing the window during a plot asks for confirmation. On USB disconnect, stop safely and keep the position so I can resume after reconnecting.

**PLOT-5 (P1)** As a user, I want to resume from a specific point after a problem (pen ran dry, paper moved).
- AC: Every plot keeps a checkpoint (layer + path index). "Resume from path N" option, with a small back-up overlap in mm.

**PLOT-6 (P1)** As a user, I want a dry run that traces the bounding box with the pen up, so I can check paper placement.

**PLOT-7 (P2)** As a user, I want a plot log (date, file, duration, settings used) so I can find old settings.

### Epic 10: Settings and projects (PROJ)

**PROJ-1 (P0)** As a user, I want to save and open projects (`.plot.json`) with all settings.

**PROJ-2 (P0)** As a user, I want undo/redo for settings changes.

**PROJ-3 (P2)** As a user, I want a pen library (name, color, tip width, preferred speed, pen heights). Moves to Epic 12 with multi-pen.

**PROJ-4 (P1)** As a user, I want recent files and autosave.

### Epic 11: Generative transforms (GEN), future

Built as `PipelineStep`s, so each is a self-contained module with a params schema and tests. The settings UI is generated from the schema. Transforms can be stacked and reordered.

**GEN-1 (P2)** As a user, I want a kaleidoscope transform: take a wedge of the source and repeat it around a center.
- Params: segment count, mirror alternate segments (on/off), wedge start angle, center point, source mode (clip a wedge or use the whole artwork scaled into the wedge).
- AC: Output is clipped and seamless at wedge edges. Duplicate lines along mirror seams are removed (via OPT-3).

**GEN-2 (P2)** As a user, I want rotational and mirror symmetry (N-fold rotate, mirror X/Y) as simpler building blocks.

**GEN-3 (P2)** As a user, I want a fractal transform: an iterated function system where the artwork is copied through a set of affine transforms for N levels.
- Params: list of transforms (scale, rotate, translate), depth, minimum size cutoff (drop copies smaller than X mm).
- AC: A hard cap on total segments with a warning, so a deep recursion can't freeze the app.

**GEN-4 (P2)** As a user, I want a radial repeat along a spiral, and a grid/tile repeat with per-tile rotation or scale jitter (seeded random).

**GEN-5 (P2)** As a user, I want every random transform to take a seed, so results are repeatable.

**GEN-6 (P2)** As a developer, I want a documented way to add a new transform: one file in `packages/core/src/transforms/`, registered in an index, with tests. Write `docs/adding-a-transform.md`.

### Epic 12: Later / nice to have (LATER)

Not in the MVP. Pick these up once the single-pen workflow is solid.

**LATER-1** Multi-pen plotting by layer: pause between layers that use different pens with a prompt ("Swap to pen: Blue 0.3"), and wait for a confirm click or the machine's button before continuing. Includes the pen library (PROJ-3) and per-pen speed and height settings.

**LATER-2** Split by color on import as a one-click "prepare for multi-pen" action, with pen assignment per color.

**LATER-3** Registration helpers for multi-pen: a small corner mark plotted at the start of each pen so drift is easy to spot.

**LATER-4** Windows and Linux builds (SETUP-6).

**LATER-5** Signed and notarized macOS builds, if the project gets enough users to make the Apple Developer fee worth it.

**LATER-6** Hershey single-stroke text, so text can be typed in the app and plotted as clean lines.

**LATER-7** Additional file formats from IMPORT-8.

**LATER-8** A browser version using Web Serial, reusing `packages/core` and the driver interface.

---

## 4. UI layout

Single window, three areas:

- **Left panel:** Layers list (visibility, plot toggle, color, pen), then a pipeline list (transforms with add/reorder/remove).
- **Center:** Preview canvas with zoom controls and view toggles (travel lines, original, bed, margins).
- **Right panel (tabs):** Page, Fill (for the selected layer), Machine (connection, pen heights, jog), Plot (start/pause/stop, progress, stats).

Keyboard: `Space` pause/resume during plot, `Cmd/Ctrl+O` open, `Cmd/Ctrl+S` save, `Cmd/Ctrl+Z` undo, `F` fit view, `U`/`D` pen up/down when idle.

Dark and light themes. Keep it calm and dense, a tool not a landing page.

---

## 5. MVP definition

MVP is done when I can, on my Mac with my AxiDraw V3/A3: open an SVG made in a vector tool that has filled shapes, pick A4 landscape with a 15 mm margin, set a crosshatch at 0.6 mm spacing on one layer, see an accurate preview and time estimate, connect to the plotter, set pen heights, plot it with one pen, pause and resume in the middle, and get a result that matches the preview.

MVP stories: all P0 items in Epics 1 to 10. The repo is public-ready (SETUP-4) at MVP, even if I don't publish it right away.

## 6. Suggested build order

1. SETUP-1, SETUP-2, SETUP-4
2. Core data model + IMPORT-6 (importer interface), then IMPORT-1 to IMPORT-4 (with tests)
3. PAGE-1 to PAGE-3 + PREVIEW-1 to PREVIEW-3 (now there's something to look at)
4. HATCH-1 to HATCH-3
5. OPT-1, OPT-2
6. DRIVER-0 spike on real hardware (stop and check in with me)
7. DRIVER-4 simulator, then MOTION-1, MOTION-2
8. DRIVER-1 to DRIVER-3, DRIVER-5, PLOT-1 to PLOT-4
9. PROJ-1, PROJ-2, SETUP-3 (installable Mac app), then P1 items
10. GEN epic
11. LATER epic, as needed

## 7. Testing

- Core: unit tests for every pipeline step, with small SVG fixtures in `packages/core/test/fixtures/`. Snapshot test the output polylines (rounded to 0.001 mm).
- Motion: tests that step totals return to origin, that speed never exceeds limits, and that time estimates match the simulator.
- Driver: tests against the simulator, including disconnect mid-plot and resume.
- UI: a few Playwright smoke tests (open file, change fill, start a simulated plot, pause, resume, finish).
- Hardware: a manual checklist in `docs/hardware-test.md` (calibration square, circle, 1 mm spaced lines for backlash, long plot of 30+ minutes).

## 8. Non-goals for now

- Raster to vector conversion (image tracing).
- Text and fonts (Hershey single-stroke fonts could be a later epic).
- Non-EBB plotters (GRBL machines, HP-GL). Keep the driver interface generic enough to add them later.
- Cloud anything. This is a local app.

## 9. Reference sources (read before DRIVER and MOTION epics)

- EBB command reference: `http://evil-mad.github.io/EggBot/ebb.html` (check for a newer Bantam Tools hosted version)
- `plotink` (Python, maintained by Bantam Tools): `ebb_serial.py` and `ebb_motion.py` show how the official software talks to the board. Use it to understand behavior; don't copy code without checking its license.
- The AxiDraw and NextDraw user guides and API docs for model dimensions, servo defaults and speed limits.
- Prior open-source art for ideas: `saxi` (Node/TS AxiDraw driver with a web UI), `vpype` (Python plotter pipeline: line merging, sorting, hatching). Check licenses before borrowing anything.

## 10. Decisions made

- **Machine:** AxiDraw V3/A3, standard servo pen lift. Other EBB machines are community-supported through profiles.
- **OS:** macOS first. Windows and Linux later.
- **Pens:** single pen for MVP. Multi-pen is LATER-1.
- **Input:** SVGs from vector tools first, through a pluggable importer so more formats can follow.
- **Distribution:** personal tool, shared openly with the plotter community. MIT license, public GitHub repo, unsigned Mac builds at first. Not monetized.

## 11. Open questions (answer these before or during the relevant epic)

1. **Paper alignment habits:** do you always home to the top left corner, or do you need a "set origin here" feature? (Before PAGE-2.)
2. **Kaleidoscope source:** should it wedge-clip the original art, or squeeze the whole drawing into each wedge? Both are in GEN-1, but which is the default? (Before GEN-1.)
3. **Project name:** "Plotter Studio" is a placeholder. A final name is needed before the repo goes public, and it shouldn't use "AxiDraw" or other trademarks in the name.
4. **License:** MIT is the default here because it's the easiest for others to reuse. If you'd rather require that forks stay open, GPL-3.0 is the alternative. Decide before SETUP-4.
