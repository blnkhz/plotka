# Epic 1 plan: SETUP-1, SETUP-2, SETUP-4

## SETUP-1: monorepo

- pnpm workspaces: `apps/desktop`, `packages/core`, `packages/plotter`.
- Desktop app: electron-vite (main / preload / renderer), React + Zustand, CSS modules.
- `packages/core` and `packages/plotter` are TS source packages consumed directly by the
  desktop app via workspace deps (no separate build step; Vite bundles them).
- Root scripts: `dev`, `build`, `test`, `lint`, `format`, `typecheck`.
- TypeScript strict everywhere (`tsconfig.base.json`). TS pinned to 6.0.x because
  typescript-eslint does not support 7.x yet.
- ESLint flat config (typescript-eslint + react-hooks) + Prettier.
- `packages/core` lint rule: no imports of `electron`, `node:*`, `fs`, `path`, and no DOM lib
  in its tsconfig, so it stays pure.

## SETUP-2: typed IPC

- `apps/desktop/src/shared/ipc.ts` defines every channel: request/response invoke channels and
  main->renderer event channels, as TS types.
- Preload exposes `window.api` built from that map with `contextBridge`. `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`.
- First channels: `app:getVersion`, `file:openDialog`.

## SETUP-4: public-ready

- LICENSE (MIT), README, CONTRIBUTING, CODE_OF_CONDUCT (Contributor Covenant 2.1).
- Issue templates (bug with machine/firmware/macOS fields, feature request).
- GitHub Actions: lint, typecheck, test on PRs and pushes to main.

## Dependency licenses

All MIT except: TypeScript (Apache-2.0), Playwright (Apache-2.0), clipper2-js (Boost 1.0, later).
All permissive and MIT-compatible.
