# Repository Guidelines

## Layout

Bun workspaces:

- `packages/auth`: `@exwave-nexus/auth`. Entries: `.` (browser and route
  clients), `./messages`, `./react` (provider, hooks, gates), `./server`,
  `./next` and `./next/client`.
- `packages/auth-mock`: `@exwave-nexus/auth-mock`, the in-memory Auth API and
  its `exwave-auth-mock` CLI.
- `packages/create`: `create-exwave` (`npm create exwave`), and
  `templates/{next,vite}`: the apps it copies, which are also the dev
  playgrounds and workspace members. They use no UI library: plain React and
  one stylesheet. `shared/` holds what both copy (the auth screens, the
  stylesheet, the logo).
- `registry/`: the shadcn registry, for apps that use shadcn/ui.
  `registry/exwave/*` are the components, `registry/next/*` the pages and
  wiring the auth-nextjs block adds, `registry/ui/*` shadcn's own primitives
  (only to typecheck against: it's a private workspace), and
  `registry/public/r/*` the built JSON the website serves.
- `tests/`: the packages tested together (private, never published): the
  clients, the route handler, Next.js and React against the mock, through
  `@exwave-nexus/auth`'s public entry points.
- `scripts/`: the shared build, stage, version, registry, bundle-size and
  smoke scripts.

`README.md` is also `@exwave-nexus/auth`'s README; other packages publish
their own.

The core (`packages/auth/src/*.ts`, the `.` export) has no runtime
dependencies and must run in browsers, Bun and Node. `jose` is only used by
`./server` and `./next`; React only by `./react` and `./next/client`;
Next.js only by `./next` and `./next/client`. Each client stays under 6 KB
min+gz and `./react` under 10 KB (`bun run size`, enforced by a test).

## Commands

- `bun install` (respects `minimumReleaseAge` in `bunfig.toml`: dependencies
  must be a week old)
- `bun run lint`, `bun run format` (Biome is the source of truth)
- `bun run typecheck`, `bun test`, `bun run build` (packages and templates)
- `bun run mock`, `bun run dev:next`, `bun run dev:vite`
- `bun run templates:sync` after changing `packages/create/shared/*` (copies
  it into both templates), `bun run templates:check`
- `bun run registry:build` after changing `registry/` (rebuilds
  `registry/public/r`)
- `bun run stage` (builds everything, then writes what a release publishes to
  each `packages/*/publish/`)
- `bun run smoke` (slow, needs the network: npm-installs the staged tarballs
  into apps made by create-exwave and a fresh shadcn app, builds them, and
  signs in against the mock)
- `bun run check-versions` (every package shares one version)

## Conventions

Strict TypeScript, ES modules, kebab-case files, tests next to the code as
`*.test.ts(x)` run by `bun test`; never the network. A package's own tests
use only its own code and fakes (`packages/auth/src/test-utils.ts`: clock,
Web Locks, BroadcastChannel, shared storage). `@exwave-nexus/auth` never
depends on `@exwave-nexus/auth-mock`, not even for development (the mock
depends on it): tests that need the mock go in `tests/`, where
`tests/harness.ts` sets up both clients, the route client through
`handleAuthRequest`. React tests register happy-dom for their own file only.

Each package builds with `scripts/build-lib.ts`. Its `forbid` lists keep
React, Next.js and jose out of the entries that must not need them; the build
fails when one leaks in.

The screens come twice: plain in `packages/create/shared/components/exwave/`
(the templates; edit there, then `bun run templates:sync`) and as shadcn
components in `registry/exwave/`. Keep their logic in the hooks (fixes reach
people through npm) and the components to markup, and change both when the
markup's behavior changes. The templates' screens may only use React and
`@exwave-nexus/auth`, plus `@/lib/local-mock`, which each template provides.

The player API contract lives in exwave-auth (v0.7.0,
`/orbit/v1/platforms/:platformId/…`). When it changes, update the mock with
it. For Next.js APIs, read
`packages/create/templates/next/node_modules/next/dist/docs` for the
installed version.

"User" is the signed-in account; "player access token" (PAT) is the
short-lived token games use, and keeps its name.

Concise, imperative commit subjects. PRs say why, and how it was verified.

## Releases

The packages share one version and are public on npm. Bump `version` in
every `packages/*/package.json`, merge to `main`, then push a matching tag
(`git tag v0.2.0 && git push origin v0.2.0`). The Release workflow checks the
tag, runs the checks and the smoke test, stages, and publishes
`@exwave-nexus/auth`, `@exwave-nexus/auth-mock` and `create-exwave` with the
`NPM_TOKEN` repository secret (a granular npm token that can publish them),
skipping any version already published. Published versions can't be
overwritten. After a release, the website copies `registry/public/r` (see its
`scripts/sync-registry.ts`).
