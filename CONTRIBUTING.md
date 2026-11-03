# Contributing

Thanks for helping. This is a small project, so keep changes focused and ask in an issue
before starting something large.

## Setup

```sh
corepack enable pnpm
pnpm install
pnpm dev
```

Before opening a PR, run:

```sh
pnpm lint && pnpm typecheck && pnpm test
```

CI runs the same checks on every pull request.

## Ground rules

- **`packages/core` stays pure TypeScript.** No Electron, Node or DOM APIs. ESLint enforces
  this. Everything in it needs unit tests.
- **Never send motion commands to real hardware from tests.** Use the simulated driver.
- **Licenses:** the project is MIT. Only add dependencies with a permissive license (MIT, BSD,
  ISC, Apache-2.0, Boost, etc.). Do not copy code from GPL/AGPL projects. Reading them to
  understand behavior is fine.
- **Hardware values** (steps per mm, bed size, servo ranges) must cite a source in
  `docs/hardware-notes.md`.
- Commit messages reference the story ID where there is one, for example
  `feat(core): HATCH-2 crosshatch fill`.

## Adding a machine profile

Profiles are JSON files in `packages/plotter/profiles/`.

1. Copy an existing profile and give it a new `id`.
2. Fill in bed size, steps per mm, speed limits and servo defaults from your machine's
   documentation. Add the sources to `docs/hardware-notes.md`.
3. Set `"tested": false` until someone has plotted with it, then open a PR.

Only the AxiDraw V3/A3 has been tested by the maintainer. If you own one of the other models,
run the checklist in `docs/hardware-test.md` and open a PR with the results (and any fixed
values) to mark its profile `"tested": true`.

## Adding an importer

Importers implement the `Importer` interface in `packages/core/src/importers/`.

1. Create `packages/core/src/importers/<format>.ts` exporting an `Importer` with an `id`,
   `label`, `extensions`, `canImport()` and `import()`.
2. Register it in `packages/core/src/importers/index.ts`. The file picker and drag and drop
   pick up its extensions automatically.
3. Add small fixture files to `packages/core/test/fixtures/<format>/` and tests in
   `packages/core/test/importers/<format>.test.ts`.
4. Parsers must be hand written or use an MIT-compatible library.

## Adding a transform

Transforms are pipeline steps in `packages/core/src/transforms/`: one file per transform,
exporting a `PipelineStep` with a params schema (which generates the settings UI) and a pure
`apply()` function. Register it in the transforms index and add tests. Any randomness must take
a seed. Full guide: `docs/adding-a-transform.md` (coming with the transforms epic).

## Reporting bugs

Use the bug report template and include your machine model, firmware version and macOS
version.

## Keeping the user guide up to date

The user guide in `docs/guide/` is built into the app's Help window. When you change something
users see (a label, a setting, a new feature), update the matching page in the same pull request.
Use the exact labels from the UI, and plain words. Links between pages use the file name
(`[Fills](04-fills.md)`, or `04-fills.md#settings` for a section); the tests check that every link
and every "?" button points to a page and section that exist.

## App icon

The icon's source is `apps/desktop/build/icon.svg`. After editing it, run
`apps/desktop/scripts/make-icon.sh` (macOS) to regenerate `build/icon.icns`.
