# Decisions

| Date       | Decision                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------- |
| 2026-11-01 | License: MIT.                                                                                 |
| 2026-11-01 | Illustrator SVGs: px are read as points (72 per inch), so artboard sizes import exactly.      |
| 2026-11-01 | White and near-white fills (#f0f0f0 and lighter) are ignored on import by default.            |
| 2026-11-02 | White fills are kept as knockouts: not drawn, but they hide shapes under them in their layer. |
| 2026-11-02 | Polygon booleans and offsets: `@countertype/clipper2-ts` (Boost license, no dependencies).    |
| 2026-11-01 | Paper alignment: the paper's top-left corner sits at the machine's home. No custom origin.    |
| 2026-11-02 | Kaleidoscope: cuts a wedge by default (squeeze is an option); adjustable by dragging.         |
| 2026-11-02 | Only the AxiDraw V3/A3 is tested; other machines are community-tested through PRs.            |
| 2026-11-02 | macOS only for now: no Windows or Linux builds.                                               |
| 2026-11-02 | Text uses the Hershey fonts (Usenet distribution, credited); SVG text is drawn with them.     |
