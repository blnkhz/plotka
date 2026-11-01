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
