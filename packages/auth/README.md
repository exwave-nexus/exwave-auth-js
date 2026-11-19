# @exwave/auth

Managed player auth for Exwave platforms: a framework-free core for browsers,
Bun, Node and game JS glue, plus `./server`, `./next` and `./react` entries.

## Install

While the repository is private, the package is on GitHub Packages as
`@exwave-nexus/auth`, readable by members of the exwave-nexus organization.
Create a classic personal access token with `read:packages` and add this
`.npmrc` next to your `package.json` (Bun reads it too):

```ini
@exwave-nexus:registry=https://npm.pkg.github.com
@exwave:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

The `@exwave` line is for npm 12, which otherwise refuses the aliased tarball
below (`EALLOWREMOTE`). Drop it when the package moves to npmjs.

Install it under its own name, so imports stay `@exwave/auth` when it moves to
npmjs:

```bash
npm install @exwave/auth@npm:@exwave-nexus/auth
bun add @exwave/auth@npm:@exwave-nexus/auth
```

In GitHub Actions, give the job `permissions: packages: read` and pass
`secrets.GITHUB_TOKEN`, after granting the repository read access in the
package's settings.

## Use it

```ts
import { createExwaveAuth } from "@exwave/auth";

const auth = createExwaveAuth({ publishableKey: "exw_pk_…" });
await auth.signIn({ login: "player1", password });
const pat = await auth.getPlayerAccessToken(); // ≥ 60 s left, refreshed for you
```

| Entry | For |
| --- | --- |
| `@exwave/auth` | Browsers, Bun, Node, game JS glue: sign in and up, PATs, password rules |
| `@exwave/auth/server` | `verifyPlayerAccessToken()` and server-side sessions |
| `@exwave/auth/next` | `createExwaveNext()`: route handlers, `proxy`, Server Components |
| `@exwave/auth/react` | `<ExwaveProvider>` and `useExwave()` |

`./next` needs `next` ≥ 16, `./react` needs `react` ≥ 19. The
[repository README](https://github.com/exwave-nexus/exwave-auth-js#use-it)
has the full guide and two example apps.
