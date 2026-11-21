# Repository Guidelines

## Layout

Bun workspaces: `packages/auth` (the `@exwave-nexus/auth` library),
`packages/auth-mock` (`@exwave-nexus/auth-mock`, the in-memory Auth API and
its `exwave-auth-mock` CLI), `examples/*` (a Vite SPA and a Next.js app), and
`scripts/` (the shared build, stage and version checks, and the bundle size
check). `README.md` is also `@exwave-nexus/auth`'s README; other packages
publish their own.

The library's core (`packages/auth/src/*.ts`, the `.` export) has no runtime
dependencies and must run in browsers, Bun and Node. `jose` is only used by
`./server` and `./next`; React only by `./react`; Next.js only by `./next`.
Keep the core under 6 KB min+gz (`bun run size`, enforced by a test).

## Commands

- `bun install` (respects `minimumReleaseAge` in `bunfig.toml`)
- `bun run lint`, `bun run format` (Biome is the source of truth)
- `bun run typecheck`, `bun test`, `bun run build`
- `bun run mock`, `bun run dev:spa`, `bun run dev:next`
- `bun run stage` (builds everything, then writes what a release publishes to
  each `packages/*/publish/`)
- `bun run check-versions` (every package shares one version)

## Conventions

Strict TypeScript, ES modules, kebab-case files, tests next to the code as
`*.test.ts` run by `bun test`. Tests use the fakes in
`packages/auth/src/test-utils.ts` (clock, Web Locks, BroadcastChannel, shared
storage) or `@exwave-nexus/auth-mock` (`packages/auth-mock/src/mock.ts`);
never the network. `packages/auth/src/contract.test.ts` runs the library
against the mock end to end.

Each package builds with `scripts/build-lib.ts`. Its `forbid` lists keep
React, Next.js and jose out of the entries that must not need them: the core
imports none of them, `./react` imports no Next.js or jose. The build fails
when one leaks in.

The player API contract lives in exwave-auth (v0.7.0,
`/orbit/v1/platforms/:platformId/…`). When it changes, update the mock with
it. For Next.js APIs, read
`examples/next-server/node_modules/next/dist/docs` for the installed version.

Concise, imperative commit subjects. PRs say why, and how it was verified.

## Releases

The packages are private on GitHub Packages and share one version. Bump
`version` in every `packages/*/package.json`, merge to `main`, then push a
matching tag (`git tag v0.2.0 && git push origin v0.2.0`). The Release
workflow checks the tag, runs the checks, stages and publishes with the
workflow's token, skipping any version already published. Published versions
can't be overwritten.
