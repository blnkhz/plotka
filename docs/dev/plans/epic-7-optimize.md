# Epic 7 plan: OPT-1, OPT-2

Runs per layer after clipping, in `processDocument`. Layers keep their order; each layer starts
from where the previous one ended (home for the first).

- **Spatial index** (`optimize/grid.ts`): uniform grid with removal and ring-expanding
  nearest-neighbor search.
- **OPT-2 merge** (`mergeTouching`): open paths whose endpoints are within the tolerance (default
  0.1 mm) are chained, reversing as needed, extending from both ends. A chain whose ends meet
  becomes closed. Closed paths are untouched.
- **OPT-1 order** (`orderGreedy`): nearest-neighbor from the current pen position over every
  open path's two ends (so paths can be reversed) and closed paths' start points.
- **2-opt** (`improveTwoOpt`): reverses runs of paths when it shortens travel, within a window
  of 50 paths. The spec asks for a time budget; this uses a fixed evaluation budget (1M moves,
  ~60 ms) instead, so results are deterministic and the preview always matches the plot.
- Preview stats show travel / lifts / time in file order vs optimized.

Benchmarks (random short segments): 50k paths: merge 46 ms, greedy 79 ms, 2-opt capped.
Greedy cuts travel ~98% vs file order on random input; 2-opt adds 1-5%.

Later (P1): OPT-5 closed paths start at the vertex nearest the pen; OPT-3 dedupe; OPT-4
simplify. Heavy work moves to a Web Worker with PREVIEW-5.
