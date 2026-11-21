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
  playgrounds and workspace members.
- `registry/`: the shadcn registry. `registry/exwave/*` are the components;
  `registry/public/r/*` is the built JSON the website serves.
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
- `bun run registry:sync` after changing `registry/exwave/*` (copies the
  components into the templates), `bun run registry:build` (rebuilds
  `registry/public/r`), `bun run registry:check`
- `bun run stage` (builds everything, then writes what a release publishes to
  each `packages/*/publish/`)
- `bun run smoke` (slow, needs the network: npm-installs the staged tarballs
  into apps made by create-exwave and a fresh shadcn app, builds them, and
  signs in against the mock)
- `bun run check-versions` (every package shares one version)

## Conventions

Strict TypeScript, ES modules, kebab-case files, tests next to the code as
`*.test.ts(x)` run by `bun test`. Tests use the fakes in
`packages/auth/src/test-utils.ts` (clock, Web Locks, BroadcastChannel, shared
storage), `packages/auth/src/test-harness.ts` (both clients, the route client
through `handleAuthRequest`) or `@exwave-nexus/auth-mock`; never the network.
React tests register happy-dom for their own file only.

Each package builds with `scripts/build-lib.ts`. Its `forbid` lists keep
React, Next.js and jose out of the entries that must not need them; the build
fails when one leaks in.

The registry's components are the product: keep their logic in the hooks
(fixes reach people through npm) and the components to markup. Edit them in
`registry/exwave/`, then `bun run registry:sync`. The Next.js template's
pages, route handler, `lib/exwave.ts` and `proxy.ts` are also what the
`auth-nextjs` block installs.

The player API contract lives in exwave-auth (v0.7.0,
`/orbit/v1/platforms/:platformId/…`). When it changes, update the mock with
it. For Next.js APIs, read
`packages/create/templates/next/node_modules/next/dist/docs` for the
installed version.

"User" is the signed-in account; "player access token" (PAT) is the
short-lived token games use, and keeps its name.

Concise, imperative commit subjects. PRs say why, and how it was verified.

## Releases

The packages share one version. Bump `version` in every
`packages/*/package.json`, merge to `main`, then push a matching tag
(`git tag v0.2.0 && git push origin v0.2.0`). The Release workflow checks the
tag, runs the checks and the smoke test, stages, and publishes
`@exwave-nexus/auth` and `@exwave-nexus/auth-mock` to GitHub Packages with the
workflow's token, skipping any version already published. Published versions
can't be overwritten. `create-exwave` is unscoped, so it can only be published
to npmjs. After a release, the website copies `registry/public/r` (see its
`scripts/sync-registry.ts`).
