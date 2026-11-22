# @exwave-nexus/auth

Exwave Auth for any JavaScript: sign-up, email verification, sign-in,
password reset and sessions, in browsers, Bun and Node. No framework: the
framework packages build on this one.

| Package | For |
| --- | --- |
| `@exwave-nexus/auth` | The clients, the messages and the server side (this package) |
| [`@exwave-nexus/auth-react`](https://www.npmjs.com/package/@exwave-nexus/auth-react) | React: the provider and the hooks |
| [`@exwave-nexus/auth-nextjs`](https://www.npmjs.com/package/@exwave-nexus/auth-nextjs) | Next.js App Router: the session in an httpOnly cookie |
| [`@exwave-nexus/auth-mock`](https://www.npmjs.com/package/@exwave-nexus/auth-mock) | A local Exwave Auth for development and tests |
| [`create-exwave`](https://www.npmjs.com/package/create-exwave) | `npm create exwave`: a new Next.js or Vite app, ready to run |

Full guide: <https://www.exwave.net/docs/auth/get-started/>

```bash
npm install @exwave-nexus/auth
```

Your publishable key is in **Nexus → Auth**: it holds no secret. In **Nexus →
Auth → Settings**, add your site's origins to the Redirect URLs, so
verification and password reset links can land on them.

## In the browser

```ts
import { createExwaveAuth } from "@exwave-nexus/auth";

const auth = createExwaveAuth({ publishableKey: "exw_pk_..." });

auth.onAuthStateChange((event, session) => render(session?.user ?? null));
await auth.signIn({ login: "ada@example.com", password: "..." });
```

The browser talks to Exwave Auth. The session survives reloads (the refresh
token is in `localStorage`, or the `storage` you pass) and is shared between
tabs.

`createExwaveRouteClient()` makes the same calls to your server's
`/api/exwave` routes instead, when the session lives in an httpOnly cookie
(see [On your server](#on-your-server)).

| Method | Does |
| --- | --- |
| `signUp({ displayName, email, password })` | Creates the account and emails a verification link |
| `resendVerification({ email })` | Sends the verification link again |
| `signIn({ login, password })` | Signs in with an email or username |
| `handleEmailLink()` | On the page an email link opens: verifies, or returns the reset code |
| `resetPassword({ email })`, `confirmPasswordReset(...)` | Emails a reset link, then sets the new password |
| `signOut({ everywhere })` | Signs out here, or on every device |
| `getSession()`, `onAuthStateChange(listener)` | The session now, and every change |
| `getConfig()` | The platform's settings, such as its password policy |

## Messages

`@exwave-nexus/auth/messages` says errors, password rules and sign-out reasons
in English, for your own screens:

```ts
import { describeError } from "@exwave-nexus/auth/messages";

await auth.signIn(input).catch((error) => show(describeError(error)));
```

Pass `messages` to change any of them, or translate them all.

## On your server

`@exwave-nexus/auth/server` keeps the session in a sealed httpOnly cookie,
with the Web `Request` and `Response` of any runtime. Mount
`handleAuthRequest(auth, request, action)` at `/api/exwave/*` and point a route
client at it. On Next.js, `@exwave-nexus/auth-nextjs` does all of it.

## Games: player access tokens

A player access token (PAT) is a short-lived token a game sends to its game
servers. Get one from the signed-in session, and check it on the game server:

```ts
const token = await auth.getPlayerAccessToken();

import { verifyPlayerAccessToken } from "@exwave-nexus/auth/server";
const { userId } = await verifyPlayerAccessToken(token, {
  publishableKey: "exw_pk_...",
});
```

Engines and launchers can sign in with OpenID Connect instead: see
<https://www.exwave.net/docs/auth/games/>.

## Errors

Calls throw an `ExwaveAuthError` with a `code`. `describeError(error)` says it
in words.

| Code | Meaning |
| --- | --- |
| `invalid_credentials` | Wrong login or password |
| `email_not_verified` | The user hasn't opened the verification link yet |
| `player_locked` | The account was locked in Nexus (the session ends with `account_locked`) |
| `email_taken` | Sign-up with an email that's already in use |
| `weak_password` | The password breaks the platform's rules, listed in `error.failedRules` |
| `invalid_code` | The email link was already used or has expired |
| `invalid_redirect_to` | The page's origin isn't the Site URL or a Redirect URL in Nexus |
| `rate_limited` | Too many attempts: retry after `error.retryAfter` seconds |

## Upgrading

From 0.2, React and Next.js have their own packages:

| 0.2 | 0.3 |
| --- | --- |
| `@exwave-nexus/auth/react` | `@exwave-nexus/auth-react` |
| `@exwave-nexus/auth/next` | `@exwave-nexus/auth-nextjs` |
| `@exwave-nexus/auth/next/client` | `@exwave-nexus/auth-nextjs/client` |

Nothing else changed: install the new package and change the imports.

From 0.1, "player" became "user": `Player` is `User`, `session.player` is
`session.user`, `getPlayer()` is `getUser()`, and the sign-out reason
`player_locked` is `account_locked` (the error code stays `player_locked`).
The player access token API keeps its names.
