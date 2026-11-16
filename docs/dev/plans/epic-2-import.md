# Epic 2 plan: IMPORT-1 to IMPORT-4, IMPORT-6

## Data model

`packages/core/src/model.ts` implements the types from spec section 2 (`Polyline`, `Layer`,
`FillRegion`, `LayerSettings`, `FillSettings`, `PlotDocument`). Additions:

- `FillRegion.color` (optional): source fill color, for HATCH-8 later.
- `PlotDocument.warnings` and `PlotDocument.source` (`hasLayers`, `generator`) so the UI can
  show warnings and offer the "one layer / split by color" choice.

## IMPORT-6: importer interface

`packages/core/src/importers/`: `Importer` interface exactly as specced, plus a registry
(`registerImporter`, `supportedExtensions`, `findImporter`, `importFile`).

## SVG importer (IMPORT-1 to 4)

Core has to stay free of DOM APIs, so instead of DOMParser:

- Hand-written XML parser (`svg/xml.ts`): elements, attributes, CDATA, comments, DOCTYPE
  internal entities (old Illustrator exports use `&ns_svg;`).
- Hand-written UTF-8 decoder (TextDecoder isn't in the ES lib).
- Minimal CSS for `<style>` (class / id / tag selectors). Cascade: presentation attributes <
  stylesheet < inline style.
- Path data via `svgpath` (MIT) for parsing, `abs()` and `unshort()`. Cubic/quadratic flattening
  by adaptive subdivision (`geometry/flatten.ts`); arcs flattened directly from the center
  parameterization (`geometry/arc.ts`) so the tolerance is exact. Control points are transformed
  to mm before flattening, so the tolerance is in mm.
- Shapes (rect incl. rounded, circle, ellipse, line, polyline, polygon) become path data.
- Root viewport: width/height units to mm, viewBox + preserveAspectRatio. Nested `<svg>`,
  `<use>` (href and xlink:href, symbols with viewBox), cycle protection.
- Hidden: `display:none` skips the subtree; `visibility:hidden` is inherited and can be
  overridden by a child.
- Fills: any non-none fill becomes a `FillRegion` with its fill-rule. Default SVG fill is black.
- Layers: top-level Inkscape layers become app layers (sublayers merge into their parent);
  otherwise `single` or `byColor` via `ImportOptions.layerMode`.
- Warnings: text, images, clip paths (not applied yet), masks, unresolved `<use>`, missing size.

## Decisions taken

- **Illustrator px = pt.** Illustrator writes points but labels them px. When the generator
  comment says Adobe Illustrator, px default to 72 per inch, so an A4 artboard imports as
  210 x 297 mm. Override with `ImportOptions.pxPerInch`.
- Clip paths aren't applied (warned). Can be added with clipper later.

## Fixtures

`packages/core/test/fixtures/svg/` has one hand-made file per tool reproducing its quirks.
To do: replace with real exports from each tool.
