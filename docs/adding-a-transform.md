# Adding a transform

Transforms (Tile, Kaleidoscope, Symmetry, and later fractal…) change the artwork before it's
placed on the page. They show up in the **Transforms** list in the left panel, where users can
add, reorder, turn off and remove them. The settings form is generated from each transform's
parameter list, so a new transform needs no UI code.

## 1. Write the transform

Create one file in `packages/core/src/transforms/`, for example `mirror.ts`:

```ts
import type { Matrix } from '../geometry/matrix';
import { transformDocument } from '../geometry/transform-doc';
import type { TransformDef } from './types';

export const mirror: TransformDef = {
  type: 'mirror', // stable id, saved in projects; never rename it
  name: 'Mirror', // shown in the UI
  description: 'Flip the artwork.',
  params: [
    {
      key: 'axis',
      label: 'Axis',
      type: 'select',
      default: 'x',
      options: [
        { value: 'x', label: 'Left–right' },
        { value: 'y', label: 'Top–bottom' },
      ],
    },
  ],
  apply(doc, p) {
    const m: Matrix = p.axis === 'y' ? [1, 0, 0, -1, 0, 0] : [-1, 0, 0, 1, 0, 0];
    return transformDocument(doc, m);
  },
};
```

Rules:

- `apply` is **pure**: return a new document, never change the input.
- Coordinates are mm, origin top left, y down. Absolute position doesn't matter (the page setup
  places the result), but keep `width`/`height` meaningful (the result's size).
- Work on both `strokes` and `fills` of every layer, and keep layer ids, so layer settings
  (fills, passes, speeds) still apply.
- Randomness takes a `seed` param and uses `seededRandom` from `./random`, so the preview and the
  plot are identical.
- Anything that can grow without bound needs a cap and a message in `doc.warnings` (see
  `MAX_TILE_POINTS` in `tile.ts`).
- Param types: `number` (with `min`, `max`, `step`, optional `suffix`, `integer`), `select`,
  `boolean`. Add `help` for a tooltip. Labels use plain words.

### Adjusting in the preview (optional)

A transform can also return a `guide(doc, params)`: an outline (in its output coordinates) and
which params a drag and a zoom change, with mm-to-param factors. Its card then gets **Adjust in
preview**, and the preview draws the outline and turns drags and scrolling into param changes
(one undo step per drag). Only the last enabled transform can be adjusted. See
`kaleidoscope.ts`; test that a drag of (dx, dy) moves the content by exactly that.

## 2. Register it

Add it to `TRANSFORMS` in `packages/core/src/transforms/index.ts` (the list order is the menu
order) and export it there.

## 3. Test it

Add `packages/core/test/transforms/<name>.test.ts`. At least: default params do something
sensible, each param has the documented effect, seeds are repeatable, caps produce a warning.
`tile.test.ts` is a good example.
