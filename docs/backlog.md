# Backlog

Work not done yet, newest requests first. Story IDs refer to the spec; "new" items came up while
building. Each item gets a plan in `docs/plans/` when it's picked up.

## Remaining spec stories (P2 and later)

- PROJ-3 pen library (name, color, tip width, preferred speed, pen heights)
- LATER-1 to LATER-8: multi-pen plotting with pen-swap prompts, split by color, registration
  marks, single-stroke text, more import formats, a browser version, signed builds

## Needs a decision

- Final project name (before the repo or a release goes public)
- Code of conduct contact method (`CODE_OF_CONDUCT.md`)
- README screenshot
- Whether to commit `specs.md` (e.g. as `docs/spec.md`)

## Needs a test on hardware

- Dry run, continue after Stop, and the installed app (`pnpm build:mac`) on the AxiDraw

## Not planned for now (decided 2026-11-02)

- **Other plotters**: only the AxiDraw V3/A3 is tested. The other AxiDraw and NextDraw profiles
  (and the NextDraw 1117 travel, 430 × 297 mm assumed) stay marked untested until owners test
  them and send a pull request. The same goes for DRIVER-6, the brushless pen-lift upgrade on
  AxiDraws.
- **SETUP-6 Windows and Linux builds**: macOS only.
