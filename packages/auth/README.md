# @exwave-nexus/auth

Managed player auth for Exwave platforms: a framework-free core for browsers,
Bun, Node and game JS glue, plus `./server`, `./next` and `./react` entries.

## Install

The package is on GitHub Packages, readable by members of the exwave-nexus
organization. Create a classic personal access token with `read:packages` and
add this `.npmrc` next to your `package.json` (Bun reads it too):

```ini
@exwave-nexus:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```bash
npm install @exwave-nexus/auth
bun add @exwave-nexus/auth
```

In GitHub Actions, give the job `permissions: packages: read` and pass
`secrets.GITHUB_TOKEN`, after granting the repository read access in the
package's settings.

## Use it

```ts
import { createExwaveAuth } from "@exwave-nexus/auth";

const auth = createExwaveAuth({ publishableKey: "exw_pk_…" });
await auth.signIn({ login: "player1", password });
const pat = await auth.getPlayerAccessToken(); // ≥ 60 s left, refreshed for you
```

| Entry | For |
| --- | --- |
| `@exwave-nexus/auth` | Browsers, Bun, Node, game JS glue: sign in and up, PATs, password rules |
| `@exwave-nexus/auth/server` | `verifyPlayerAccessToken()` and server-side sessions |
| `@exwave-nexus/auth/next` | `createExwaveNext()`: route handlers, `proxy`, Server Components |
| `@exwave-nexus/auth/react` | `<ExwaveProvider>` and `useExwave()` |

`./next` needs `next` ≥ 16, `./react` needs `react` ≥ 19.

## Email links

Sign-up verification and password reset emails link to your site with
`?exwave_verify=…&uid=…` or `?exwave_reset=…&uid=…`. Nothing happens until
the page they open spends the code: neither `<ExwaveProvider>` nor the core
reads the URL by itself.

The link lands on the `redirectTo` you pass, which must share an origin with
the Site URL or a redirect URL in Nexus → Managed auth → Settings. Without
`redirectTo`, it lands on the Site URL itself.

```ts
await auth.signUp({ email, password, displayName, redirectTo: `${location.origin}/verify` });
await auth.resetPassword({ email, redirectTo: `${location.origin}/reset-password` });

// On those pages (null when the URL has no code):
const link = await auth.handleEmailLink();
if (link?.type === "email_verified") {
  // Signed in: drop the spent code from the URL.
  history.replaceState(null, "", "/");
} else if (link?.type === "password_reset") {
  await auth.confirmPasswordReset({ userId: link.userId, code: link.code, password }); // signed in
}
// A used or expired code throws ExwaveAuthError "invalid_code";
// auth.resendVerification({ email, redirectTo }) sends a new link.
```

With `createExwaveNext()`, links land on `/verify` and `/reset-password` of
the app's origin (`paths` changes them). Read `exwave_verify` or
`exwave_reset`, and `uid`, from `searchParams`, then call
`exwave.verifyEmail({ userId, code })` or
`exwave.confirmPasswordReset({ userId, code, password })` from a Server
Function, which can set the session cookie.

The [repository README](https://github.com/exwave-nexus/exwave-auth-js#use-it)
has the full guide and two example apps.
