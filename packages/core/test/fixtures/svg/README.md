# SVG fixtures

One file per vector tool, each written to reproduce that tool's export quirks.
These are hand-made stand-ins; replace them with real exports when available
(keep the file names so the snapshot tests still apply).

| File            | Quirks covered                                                                       |
| --------------- | ------------------------------------------------------------------------------------ |
| illustrator.svg | Generator comment, DOCTYPE entities, `<style>` classes in CDATA, px = pt (72 dpi)    |
| inkscape.svg    | mm size with scaled viewBox, `inkscape:groupmode="layer"`, hidden layer, sodipodi    |
| figma.svg       | px size, `clip-path` group with `<defs>`, presentation attributes, `fill-rule`       |
| affinity.svg    | `width="100%"`, `serif:id`, inline styles, nested `matrix()` transforms, `<use>`     |
| overlap.svg     | Hand-written: overlapping black, grey and white fills (covering, knockouts, density) |
| motif.svg       | Hand-written asymmetric motif (curl, dot, filled leaf) for tile and tessellate       |
