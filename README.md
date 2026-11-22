# Exwave Auth for JavaScript

Sign users in to your website or app with Exwave Auth: sign-up, email
verification, sign-in, password reset and sessions. Games can get a player
access token from the same session.

Full guide: <https://www.exwave.net/docs/auth/get-started/>

## Packages

| Package | For |
| --- | --- |
| [`@exwave-nexus/auth`](packages/auth) | Any JavaScript: the browser and route clients, messages, and the server side |
| [`@exwave-nexus/auth-react`](packages/auth-react) | React: the provider, and hooks for your own screens |
| [`@exwave-nexus/auth-nextjs`](packages/auth-nextjs) | Next.js App Router: the session in an httpOnly cookie, read in Server Components |
| [`@exwave-nexus/auth-mock`](packages/auth-mock) | An in-memory Exwave Auth for local work and tests |
| [`create-exwave`](packages/create) | `npm create exwave`: a Next.js or Vite app with every screen built |

Each framework gets its own package on top of `@exwave-nexus/auth`, so an app
only installs what it uses. All of them share one version.

## Start a new app

```bash
npm create exwave@latest my-app -- --template next --key exw_pk_...
```

`--template next` makes a Next.js app, `--template vite` a React app, and
`--template next-shadcn` a Next.js app built from shadcn/ui components. Your
publishable key is in **Nexus → Auth**. Leave `--key` out to start against the
local mock.

The shadcn/ui app also comes through the shadcn CLI:

```bash
npx shadcn@latest create -t next -n my-app https://www.exwave.net/r/exwave-app.json
```

## Add it to an existing app

Install the package for your framework (see its README), then build your
screens on the hooks, or add ready-made ones as shadcn/ui components:

```bash
npx shadcn@latest add https://www.exwave.net/r/auth-nextjs.json   # or auth-react.json
npx shadcn@latest add https://www.exwave.net/r/exwave-theme.json  # Exwave's colors, if you want them
```

## This repository

| Path | What |
| --- | --- |
| `packages/auth`, `packages/auth-react`, `packages/auth-nextjs` | The libraries |
| `packages/auth-mock` | The mock, and its `exwave-auth-mock` CLI |
| `packages/create` | `create-exwave`, its `templates/` (also the dev playgrounds), and `shared/`: the screens and styles both templates copy |
| `registry/` | The shadcn registry: the components, the Next.js files the block adds, the full app and its theme, and the built JSON the website serves |
| `tests/` | The packages tested together against the mock, through their public entry points |

```bash
bun install
bun run mock       # the mock, on http://localhost:4010
bun run dev:next   # the Next.js template, http://localhost:3000
bun run dev:vite   # the Vite template, http://localhost:5173
bun run dev:next-shadcn   # the shadcn/ui template, http://localhost:3000
```

`AGENTS.md` has the conventions, the checks and how releases work.
