# Repository Guidelines

## Layout

Bun workspaces: `packages/auth` (the `@exwave-nexus/auth` library), `examples/*`
(a Vite SPA and a Next.js app), `scripts/` (the mock player API and the bundle
size check). `README.md` is also the package's README on GitHub Packages.

The library's core (`packages/auth/src/*.ts`, the `.` export) has no runtime
dependencies and must run in browsers, Bun and Node. `jose` is only used by
`./server` and `./next`; React only by `./react`; Next.js only by `./next`.
Keep the core under 6 KB min+gz (`bun run size`, enforced by a test).

## Commands

- `bun install` (respects `minimumReleaseAge` in `bunfig.toml`)
- `bun run lint`, `bun run format` (Biome is the source of truth)
- `bun run typecheck`, `bun test`, `bun run build`
- `bun run mock`, `bun run dev:spa`, `bun run dev:next`
- `bun run --cwd packages/auth stage` (what a release publishes, in
  `packages/auth/publish/`)

## Conventions

Strict TypeScript, ES modules, kebab-case files, tests next to the code as
`*.test.ts` run by `bun test`. Tests use the fakes in
`packages/auth/src/test-utils.ts` (clock, Web Locks, BroadcastChannel, shared
storage) or the mock in `scripts/mock-auth.ts`; never the network.

The player API contract lives in exwave-auth (v0.7.0,
`/orbit/v1/platforms/:platformId/…`). When it changes, update the mock with
it. For Next.js APIs, read
`examples/next-server/node_modules/next/dist/docs` for the installed version.

Concise, imperative commit subjects. PRs say why, and how it was verified.

## Releases

`@exwave-nexus/auth` is private on GitHub Packages. Bump `version` in
`packages/auth/package.json`, merge to `main`, then push a matching tag
(`git tag v0.2.0 && git push origin v0.2.0`). The Release workflow checks the
tag, runs the checks and publishes with the workflow's token. Published
versions can't be overwritten.
