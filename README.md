# @exwave-nexus/auth

Sign users in to your website or app with Exwave Auth: sign-up, email
verification, sign-in, password reset and sessions, with Next.js, React or
plain JavaScript. Games can get a player access token from the same session.

Full guide: <https://www.exwave.net/docs/auth/get-started/>

## Start a new app

```bash
npm create exwave@latest my-app -- --template next --key exw_pk_...
```

`--template next` makes a Next.js app (the session lives in an httpOnly
cookie). `--template vite` makes a React app (the browser talks to Exwave
Auth). Your publishable key is in **Nexus → Auth**: it holds no secret. Leave
`--key` out to start against a local mock.

In **Nexus → Auth → Settings**, add `http://localhost:3000` (or `:5173`) to the
Redirect URLs, so verification and password reset links can land on your app.

## Add it to an existing app

The sign-in, sign-up, verification and password reset screens are
[shadcn](https://ui.shadcn.com) components you copy into your app and change as
you like.

### Next.js (App Router)

```bash
npm install @exwave-nexus/auth
npx shadcn@latest add https://www.exwave.net/r/auth-nextjs.json
```

That adds the screens, their pages, `app/api/exwave/[...action]/route.ts`,
`lib/exwave.ts` and `proxy.ts`. Then set the environment and the provider:

```bash
# .env.local
NEXT_PUBLIC_EXWAVE_PUBLISHABLE_KEY=exw_pk_...
EXWAVE_COOKIE_SECRET=...   # openssl rand -base64 32
```

```tsx
// app/layout.tsx
import { ExwaveProvider } from "@exwave-nexus/auth/next/client";
import { exwave } from "@/lib/exwave";

export default async function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ExwaveProvider initialState={await exwave.getAuthState()}>
          {children}
        </ExwaveProvider>
      </body>
    </html>
  );
}
```

Read the user in Server Components, Server Functions and Route Handlers:

```ts
const user = await exwave.getUser(); // null when signed out
```

### React (Vite, or any single-page app)

```bash
npm install @exwave-nexus/auth
npx shadcn@latest add https://www.exwave.net/r/auth-react.json
```

```tsx
import { ExwaveProvider } from "@exwave-nexus/auth/react";

<ExwaveProvider
  publishableKey={import.meta.env.VITE_EXWAVE_PUBLISHABLE_KEY}
  navigate={(to) => router.navigate(to)} // your router
>
  <App />
</ExwaveProvider>;
```

Then route `/sign-in`, `/sign-up`, `/verify`, `/forgot-password` and
`/reset-password` to `<SignInForm />`, `<SignUpForm />`, `<VerifyEmail />`,
`<ForgotPasswordForm />` and `<ResetPasswordForm />`. Pass `paths` to the
provider to use other URLs.

## Your own screens: hooks

The components are built on hooks you can use with your own markup. Each
action has `run()`, which never throws, plus `pending`, `error` and `message`
(the error in words).

| Hook | For |
| --- | --- |
| `useExwave()` | `user`, `isSignedIn`, `isLoaded`, `signOutReason`, `navigate`, `paths` |
| `useSignIn()` | Sign-in, and `unverifiedEmail` to offer a new link |
| `useSignUp()` | Sign-up, then `step: "check_email"` with `resend` |
| `useEmailLink()` | The page an email link opens: verifies, or hands back the reset code |
| `usePasswordReset()` | `request` a link, then `confirm` the new password |
| `useSignOut()` | Sign out, here or `{ everywhere: true }` |
| `usePasswordCheck()` | The platform's password rules, ticked off as the user types |
| `<SignedIn>`, `<SignedOut>` | Render once the session is known |

```tsx
import { useSignIn } from "@exwave-nexus/auth/react";

function SignIn() {
  const signIn = useSignIn();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        signIn.run({
          login: String(form.get("login")),
          password: String(form.get("password")),
        });
      }}
    >
      <input name="login" autoComplete="username" />
      <input name="password" type="password" autoComplete="current-password" />
      {signIn.message && <p role="alert">{signIn.message}</p>}
      <button disabled={signIn.pending}>Sign in</button>
    </form>
  );
}
```

Messages come from `@exwave-nexus/auth/messages` in English. Pass
`messages={{ "error.invalid_credentials": "…" }}` to the provider to change any
of them.

## Without React

```ts
import { createExwaveAuth } from "@exwave-nexus/auth";

const auth = createExwaveAuth({ publishableKey: "exw_pk_..." });

auth.onAuthStateChange((event, session) => render(session?.user ?? null));
await auth.signIn({ login: "ada@example.com", password: "..." });
```

`createExwaveRouteClient()` makes the same calls to your server's
`/api/exwave` routes instead, when the session lives in a cookie. React and
Next.js are optional peers: the core never imports them.

## On your server

`createExwaveNext()` (`@exwave-nexus/auth/next`) does it all for Next.js.
Anywhere else, `@exwave-nexus/auth/server` has the same pieces: mount
`handleAuthRequest(auth, request, action)` at `/api/exwave/*` and point a route
client at it.

## Games: player access tokens

A player access token (PAT) is a short-lived token a game sends to its game
servers. Get one from the signed-in session, and check it on the game server:

```ts
const token = await auth.getPlayerAccessToken(); // browser client
// Next.js: GET /api/exwave/token from the page

import { verifyPlayerAccessToken } from "@exwave-nexus/auth/server";
const { userId } = await verifyPlayerAccessToken(token, {
  publishableKey: "exw_pk_...",
});
```

Engines and launchers can sign in with OpenID Connect instead: see
<https://www.exwave.net/docs/auth/games/>.

## Errors

Calls throw an `ExwaveAuthError` with a `code`; hooks put it in `error`.
`describeError(error)` from `@exwave-nexus/auth/messages` says it in words.

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

## Develop without a platform

`@exwave-nexus/auth-mock` is an in-memory Exwave Auth for local work and
tests:

```bash
npx exwave-auth-mock   # http://localhost:4010, prints its publishable key
```

Sign in as `player1` with `Password123!`, or sign up and open the link it
prints.

## Upgrading from 0.1

| 0.1 | 0.2 |
| --- | --- |
| `Player` | `User` |
| `session.player`, `useExwave().player` | `session.user`, `useExwave().user` |
| `auth.getPlayer()`, `exwave.getPlayer()` | `auth.getUser()`, `exwave.getUser()` |
| Route handler JSON `{ player }` | `{ user }` |
| Sign-out reason `player_locked` | `account_locked` (the error code stays `player_locked`) |
| `useExwave().auth` is `ExwaveAuth` | `ExwaveAuth \| ExwaveRouteClient`: check `auth.mode` |

The player access token API keeps its names.

## This repository

| Path | What |
| --- | --- |
| `packages/auth` | `@exwave-nexus/auth` |
| `packages/auth-mock` | `@exwave-nexus/auth-mock` |
| `packages/create` | `create-exwave`, and its `templates/` (also the dev playgrounds) |
| `registry/` | The shadcn registry: the components, and the built JSON the website serves |

```bash
bun install
bun run mock       # the mock, on http://localhost:4010
bun run dev:next   # the Next.js template, http://localhost:3000
bun run dev:vite   # the Vite template, http://localhost:5173
```
