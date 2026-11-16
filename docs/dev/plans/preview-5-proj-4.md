# Plan: PREVIEW-5 background processing, PROJ-4 recent files and autosave

## PREVIEW-5: stay responsive with big files

Found while planning: seven components each called `useProcessed()`, and each memoized its own
copy, so every change ran the whole pipeline up to seven times on the main thread.

- **One computation**: `lib/pipeline.ts` holds the pure `computeProcessed(input)` (fit, fills,
  passes, clip, optimize, stats, motion plan). A single controller (`lib/pipelineRunner.ts`)
  watches the inputs (document + overrides, page, optimize, transforms, profile, pen heights),
  runs it, and stores the result; `useProcessed()` just reads it.
- **In a Web Worker** (`workers/pipeline.worker.ts`), so the window never freezes. When the
  input changes mid-computation, the busy worker is terminated and a fresh one started with the
  latest input (no queue of stale work). Without Worker support (unit tests) it runs inline.
- **Stale while updating**: the last result stays on screen; the toolbar shows "Updating…".
  Opening a new file clears the old result.
- **Preview**: each layer's paths are built into a `Path2D` once per result (cached by result),
  so panning and zooming only re-stroke them instead of walking every point in JavaScript.

## PROJ-4: recent files and autosave

- **Recent files**: the main process keeps the last 10 opened or saved files (projects and SVGs)
  in `userData/recent.json`, shows them in **File → Open Recent** (with Clear), and adds them to
  the macOS Dock menu. Choosing one opens it like Open…; a missing file is dropped with a
  message.
- **Autosave** protects against crashes and forced quits without silently overwriting the
  user's own files: while there are unsaved changes, the project is written to a recovery file in
  `userData` (a few seconds after the last change). Saving, opening another file, or closing
  without saving (confirmed) removes it. On the next start, if a recovery file exists, a banner
  offers **Restore** or **Discard**.
