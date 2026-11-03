# Plotka

[![Latest release](https://img.shields.io/github/v/release/blnkhz/plotka?label=release&color=6bb797)](https://github.com/blnkhz/plotka/releases/latest)

A desktop app for pen plotters. Load SVG artwork, set up the paper and fills, preview exactly
what the pen will draw, and plot directly over USB, with no vendor software or Inkscape
extension needed.

![Plotka welcome screen: an example plot and Open…, Doodle… and + Text](docs/screenshots/welcome.png)

**Status:** early releases for macOS, tested on an AxiDraw V3/A3. Download the app from
[GitHub releases](../../releases/latest).

## Features

- Open SVGs from Illustrator, Inkscape, Figma, Affinity Designer and code, or draw a doodle and
  turn it into clean curves or straight lines (and merge, cut or intersect its shapes)

  ![Doodle pad: a hand-drawn circle and zigzag turned into curves, with shape and vector settings](docs/screenshots/doodle.png)

- Pictures (PNG, JPEG, WebP...) become pen marks: ordered or diffusion dithering, or halftone,
  with circles, squares, dots, lines, × or +

  ![Image pad: a gradient picture turned into halftone circles](docs/screenshots/image.png)

- 3D models (OBJ, STL, PLY, glTF / GLB, 3MF) become parallel slices drawn from any angle, with
  hidden lines removed or the full mesh

  ![3D model pad: a cube on the left, its parallel slices as they will be plotted on the right](docs/screenshots/3d-model.png)

- Paper presets, margins, fit and alignment
- Text in single-stroke Hershey fonts (six styles), typed in the app or from SVG text

  !["Hello plotter" in the Script Hershey font, with the text settings](docs/screenshots/text.png)

- Fills: lines (or a zigzag), crosshatch, triangles, hexagons, waves (smooth, zigzag, square),
  noise, flow, concentric, spiral, ripples, dots and stipple, with spacing from the fill color;
  shapes on top hide the ones underneath, like in the file

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

- Projects with undo and redo, and a searchable help guide built in

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
Apple Silicon and Intel. Windows and Linux aren't planned for now.

The app is not signed with an Apple Developer certificate yet, so macOS blocks it the first
time. To open it:

1. Right click the app in Finder and choose **Open**, then **Open** again. Or:
2. Try to open it once, then go to **System Settings > Privacy & Security** and click
   **Open Anyway**.

## Development

Requirements: Node 22+, pnpm (`corepack enable pnpm`).

```sh
pnpm install
pnpm dev          # run the app with hot reload
pnpm test         # unit tests (Vitest)
pnpm lint         # ESLint
pnpm typecheck    # TypeScript
pnpm build:mac    # universal (Apple Silicon + Intel) .dmg in apps/desktop/release
pnpm release 0.2.0  # bump, commit and tag a release; see docs/releasing.md
```

### Repo layout

```
apps/desktop/       Electron main, preload and React renderer
packages/core/      Pure TypeScript geometry: import, fills, optimize, transforms
packages/plotter/   Driver interface, EBB protocol, motion planner, simulator
docs/               Plans, hardware notes, decisions
```

## License

[MIT](LICENSE). AxiDraw is a trademark of Evil Mad Scientist Laboratories, NextDraw is a
trademark of Bantam Tools. This project is not affiliated with either.
