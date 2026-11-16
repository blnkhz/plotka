# Backlog

Work not done yet, newest requests first. Story IDs refer to the spec; "new" items came up while
building. Each item gets a plan in `docs/plans/` when it's picked up.

## New features (requested 2026-11-03)

These come from the earlier web tools at https://blnkhz.github.io/plotter-tools/ (source:
`blnkhz/plotter-tools`). They're new ways to bring artwork in, so they'd sit next to Open… and
Doodle…, and their output goes through the usual fills, transforms, optimisation and plotting.

- **3D slicer**: done (see `docs/plans/3d-slicer.md`).
- **Image dithering**: done (see `docs/plans/image-dithering.md`).

## Remaining spec stories (P2 and later)

- PROJ-3 pen library (name, color, tip width, preferred speed, pen heights)
- LATER-1 to LATER-8 (LATER-6 single-stroke text is done): multi-pen plotting with pen-swap
  prompts, split by color, registration marks, more import formats, a browser version
- LATER-5 signed builds: the release script signs and notarizes (`docs/releasing.md`); needs
  the Developer ID certificate set up, then the README's "Open Anyway" steps can go

## Needs a decision

- Code of conduct contact method (`CODE_OF_CONDUCT.md`)

## Not planned for now (decided 2026-11-02)

- **Other plotters**: only the AxiDraw V3/A3 is tested. The other AxiDraw and NextDraw profiles
  (and the NextDraw 1117 travel, 430 × 297 mm assumed) stay marked untested until owners test
  them and send a pull request. The same goes for DRIVER-6, the brushless pen-lift upgrade on
  AxiDraws.
- **SETUP-6 Windows and Linux builds**: macOS only.
