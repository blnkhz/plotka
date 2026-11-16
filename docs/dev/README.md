# How the work is planned

Plotka is built with Claude Code. These files are how I direct that work:

- [spec.md](spec.md): the build spec. The product, the technology choices, the rules for the
  code (for example, the geometry core has no Electron or DOM code, and tests never move real
  hardware), and every epic as user stories with acceptance criteria. Commits reference the
  story IDs, like `HATCH-2`.
- [plans/](plans/): a short plan written before each epic or larger feature, then checked
  against its acceptance criteria when it's done.
- [backlog.md](backlog.md): what's left, newest requests first, and what's not planned.

Decisions made along the way are in [../decisions.md](../decisions.md), and every hardware value
and its source is in [../hardware-notes.md](../hardware-notes.md).
