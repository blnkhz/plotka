# GEN-3: Fractal

The artwork copied through a set of transforms, then each copy through them again, for N levels
(an iterated function system).

## Params

- **Copies per level** (1–4) and, for each copy, **size** (1–100%), **turn** (°) and **X / Y**
  (% of the artwork's size, from its middle; y down). A copy's fields show only while it's used:
  `ParamSpec.visible(params)` is new, generic, and used by the settings form.
- **Levels** (1–30).
- **Smallest copy** (% of the artwork's size): copies smaller than this are left out and stop
  the branch. The spec says mm; a share of the artwork is used instead because the page fit
  scales the result, so artwork mm don't mean anything on paper.
- **Keep every level**: on draws every level (trees, spirals); off draws only the last one
  (Sierpinski-like), where a branch stopped by the size cutoff draws its last copy.
- **Start from** presets (`TransformDef.presets`, new, generic): a select in the card that sets
  all params at once: Triangle (Sierpinski), Branches (tree), Spiral, Pinwheel.

Sizes are capped at 100% so every branch shrinks and the recursion ends.

## Core

Depth-first over the copies, composing matrices `C + offset + rot · scale · (p − C)`. Caps: total
output points (2,000,000) and copies (100,000); hitting one stops with a warning. Fills are
copied like strokes, so hatching applies after.

## Tests

Copies per level and levels give n^levels copies (or the sum with every level kept); size and
offsets compose; the cutoff drops small copies; the cap warns; presets only use known params;
`visible` hides unused copy fields in the app; choosing a preset changes the fields.
