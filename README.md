# Plotter Studio

> Working name. The final name is still to be decided.

A desktop app for pen plotters. Load SVG artwork, set up the paper and fills, preview exactly
what the pen will draw, and plot directly over USB, with no vendor software or Inkscape
extension needed.

![Screenshot placeholder](docs/screenshot.png)

**Status:** in development, plotting on an AxiDraw V3/A3. No installable release yet.

## Features

- Open SVGs from Illustrator, Inkscape, Figma, Affinity Designer and code, or draw a doodle and
  turn it into clean curves or straight lines
- Paper presets, margins, fit and alignment
- Fills: lines, crosshatch, zigzag, concentric, spiral and dots, with spacing from the fill color;
  shapes on top hide the ones underneath, like in the file
- Passes: plot a layer several times with slight shifts in different colors, for gradients and
  moiré
- Transforms: tile on a grid, or tessellate with all 17 wallpaper patterns (square, triangle and
  hexagon rotations, kaleidoscopes, glides)
- Path optimization to cut pen-up travel
- Accurate preview with a time estimate from the same motion plan the plotter follows
- Direct USB control: connect, jog, pen-height sliders, start / pause / resume / stop, the
  machine's pause button
- Projects with undo and redo, and a searchable help guide built in

## User guide

The guide is in the app (**Help**, ⌘?) and in [docs/guide](docs/guide/01-getting-started.md).

## Supported machines

| Machine                             | Status           |
| ----------------------------------- | ---------------- |
| AxiDraw V3/A3 (standard servo lift) | Primary, tested  |
| Other AxiDraw models                | Community tested |
| Bantam Tools NextDraw               | Community tested |

Any EiBotBoard (EBB) based plotter should work with a machine profile. See
[CONTRIBUTING.md](CONTRIBUTING.md#adding-a-machine-profile).

## Install

Builds for macOS (Apple Silicon and Intel) will be attached to
[GitHub releases](../../releases). Windows and Linux builds will come later.

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
pnpm hooks:on     # optional (macOS): rebuild the .dmg in the background after each commit
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
