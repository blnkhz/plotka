# Plotka

[![Latest release](https://img.shields.io/github/v/release/blnkhz/plotka?label=release&color=6bb797)](https://github.com/blnkhz/plotka/releases/latest)
[![CI](https://github.com/blnkhz/plotka/actions/workflows/ci.yml/badge.svg)](https://github.com/blnkhz/plotka/actions/workflows/ci.yml)

A desktop app for pen plotters. Doodle, load SVG artwork, set up the paper and fills, preview exactly
what the pen will draw, and plot directly over USB, with no vendor software or Inkscape
extension needed.

![Plotka welcome screen: an example plot and Open…, Doodle… and + Text](docs/screenshots/welcome.png)

**Status:** early releases for macOS, tested on an AxiDraw V3/A3. Download the app from
[GitHub releases](../../releases/latest).

## Features

- Open SVGs from Illustrator, Inkscape, Figma, Affinity Designer and code, or draw a doodle and
  turn it into clean curves or straight lines. Place rectangles, ellipses, triangles, hexagons
  and stars, and merge, cut or intersect shapes

  ![Doodle pad: a circle with a star cut out of it, a house merged from a square and a triangle, and two hand-drawn lines, with the shape buttons and vector settings](docs/screenshots/doodle.png)

- Layers: each doodle, text or file is a layer with its own fill, pen color, speed and place
  on the page; rename or duplicate them

  ![Three doodle layers on one page: a blue circle in lines, a pink star in ripples and a green hexagon in crosshatch, next to the Layers panel](docs/screenshots/layers.png)

- Pictures (PNG, JPEG, WebP...) become pen marks: ordered or diffusion dithering, or halftone,
  with circles, squares, dots, lines, × or +

  ![Image pad: a gradient picture turned into halftone circles](docs/screenshots/image.png)

- 3D models (OBJ, STL, PLY, glTF / GLB, 3MF) become parallel slices drawn from any angle, with
  hidden lines removed or the full mesh

  ![3D model pad: a cube on the left, its parallel slices as they will be plotted on the right](docs/screenshots/3d-model.png)

- Paper presets, margins, fit and alignment
- Text in single-stroke Hershey fonts (six styles), typed in the app or from SVG text, and a
  blackletter (plain or ornate) and a Gothic and a Rotunda made of broad-nib strokes for a
  parallel pen, sized from the nib

  !["Hello plotter" in the Script Hershey font, with the text settings](docs/screenshots/text.png)

  !["Plotka, Anno Domini, minimum" in the Gothic for a parallel pen, a 3.8 mm nib at 40°, with the nib preview](docs/screenshots/pen-gothic.png)

- Fills: lines (or a zigzag), crosshatch, triangles, hexagons, waves (smooth, zigzag, square),
  noise, flow, concentric, spiral, ripples, dots and stipple, with spacing from the fill color;
  keep the pen down between lines, with rounded turns; shapes on top hide the ones underneath,
  like in the file

  ![A circle and a triangle filled with ripples, with the fill settings](docs/screenshots/fill.png)

- Passes: plot a layer several times with slight shifts in different colors, for gradients and
  moiré

  ![A shape filled with lines and plotted in three passes, in blue, black and red](docs/screenshots/passes.png)

- Transforms: tile on a grid, or tessellate with all 17 wallpaper patterns (square, triangle and
  hexagon rotations, kaleidoscopes, glides)

  ![Artwork tessellated with a hexagonal kaleidoscope pattern across the page](docs/screenshots/tessellate.png)

- Path optimization to cut pen-up travel
- Accurate preview with a time estimate from the same motion plan the plotter follows

  ![A paused plot: the pen position in the preview, progress, stats per layer and path optimization](docs/screenshots/plot.png)

- Direct USB control: connect, jog, pen-height sliders, start / pause / resume / stop, the
  machine's pause button

  ![Machine tab: connection, jog buttons, pen height sliders and the machine profile](docs/screenshots/machine.png)

- Projects with undo and redo, a searchable help guide built in, and a log file for bug reports

## User guide

The guide is in the app (**Help**, ⌘?) and in [docs/guide](docs/guide/01-getting-started.md).

![The help guide open on Getting started, with the list of topics and a search box](docs/screenshots/help.png)

## Supported machines

| Machine                             | Status                |
| ----------------------------------- | --------------------- |
| AxiDraw V3/A3 (standard servo lift) | Primary, tested       |
| Other AxiDraw models                | Untested, PRs welcome |
| Bantam Tools NextDraw               | Untested, PRs welcome |

Any EiBotBoard (EBB) based plotter should work with a machine profile. See
[CONTRIBUTING.md](CONTRIBUTING.md#adding-a-machine-profile).

## Install

Download the `.dmg` from the [latest release](../../releases/latest). It runs on macOS, on
Apple Silicon and Intel. Windows and Linux aren't planned for now, but pull requests that add
them are welcome.

From v0.5.0 the app is signed and notarized: open the `.dmg`, drag Plotka to Applications and
open it like any other app. (v0.4.0 and older aren't signed. Right-click the app and choose
**Open** the first time.)

## How it works

```mermaid
flowchart LR
  A[SVG, doodle, picture,<br>text or 3D model] --> B[Document model<br>paths in mm]
  B --> C[Fills, passes<br>and transforms]
  C --> D[Optimize<br>order and joins]
  D --> E[Motion plan]
  E --> F[Preview and<br>time estimate]
  E --> G[EBB commands<br>over USB]
```

- **`packages/core`** is pure TypeScript with no Electron, DOM or Node APIs: importers, fills,
  transforms, path optimization and the document model. It's where most of the unit tests are.
- **`packages/plotter`** speaks the EiBotBoard protocol and plans the motion: acceleration,
  cornering speed and pen lifts, in short timed moves the board can queue.
- **The preview and the plotter use the same motion plan**, so the time estimate is what the plot
  actually takes, and playback shows the real drawing order.
- **A simulated plotter** runs the same plan without hardware. The tests use it, so nothing in
  CI ever moves a real pen.
- **`apps/desktop`** is the Electron app. Heavy work (fills, slicing, planning) runs off the main
  thread so the window stays responsive.

The choices behind it are in [docs/decisions.md](docs/decisions.md), and every hardware value
and where it came from is in [docs/hardware-notes.md](docs/hardware-notes.md).

## How it's built

I built Plotka using Claude Code, working from a detailed spec I wrote (docs/dev/spec.md). The spec defines the product, architecture, and features as user stories with clear acceptance criteria. Development followed that spec, one story at a time, with a short implementation plan before each larger feature (docs/dev).

I led the product and engineering decisions throughout: defining what to build and in what order, shaping how plots look and feel, documenting architectural decisions (docs/decisions.md), reviewing implementations, and testing on a real AxiDraw. Claude Code handled most of the implementation, while I directed the process and validated the results.

CI runs unit and end-to-end tests on every push, including tests that drive the actual app.

## Development

Requirements: Node 22+, pnpm (`corepack enable pnpm`).

```sh
pnpm install
pnpm dev          # run the app with hot reload
pnpm test         # unit tests (Vitest)
pnpm lint         # ESLint
pnpm typecheck    # TypeScript
pnpm build:mac    # universal (Apple Silicon + Intel) .dmg in apps/desktop/release
pnpm release 0.5.0  # bump, commit and tag a release; see docs/releasing.md
pnpm release:publish  # build, sign, notarize and upload it as a draft release
```

### Repo layout

```
apps/desktop/       Electron main, preload and React renderer
packages/core/      Pure TypeScript geometry: import, fills, optimize, transforms
packages/plotter/   Driver interface, EBB protocol, motion planner, simulator
docs/               User guide, decisions, hardware notes; dev/ has the spec and plans
```

## License

[MIT](LICENSE). AxiDraw is a trademark of Evil Mad Scientist Laboratories, NextDraw is a
trademark of Bantam Tools. This project is not affiliated with either.
