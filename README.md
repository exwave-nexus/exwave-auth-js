# @exwave-nexus/auth

Sign players in to your Exwave platform from a website or a game: in the
browser, with React, with Next.js, or on your own server.

## Install

The package is private on GitHub Packages. Add an `.npmrc` next to your
`package.json`, with a GitHub token that has the `read:packages` scope:

```ini
@exwave-nexus:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then install it:

```bash
npm install @exwave-nexus/auth
```

## Quick start

Copy your publishable key from **Nexus → Managed auth**. It holds no secret, so
it's safe in browser code.

```ts
import { createExwaveAuth } from "@exwave-nexus/auth";

const auth = createExwaveAuth({
  publishableKey: "exw_pk_...",
});

await auth.signIn({
  login: "player@example.com", // email or username
  password: "...",
});

const token = await auth.getPlayerAccessToken();
```

The token is always valid for at least a minute, and refreshed for you. Send it
to your game servers and APIs as `Authorization: Bearer <token>`.

To follow sign-ins and sign-outs, in every open tab:

```ts
auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") {
    showSignIn();
  }
});
```

## Sign-up

Sign-up sends a verification email. The link in it opens your site, and **your
page has to finish the job** by calling `handleEmailLink()`:

```ts
await auth.signUp({
  email: "player@example.com",
  password: "...",
  displayName: "Player One",
  redirectTo: `${location.origin}/verify`,
});
```

```ts
// On /verify
const link = await auth.handleEmailLink();

if (link?.type === "email_verified") {
  // The player is verified and signed in.
}
```

`redirectTo` must be on the same domain as your Site URL or one of your
redirect URLs, in **Nexus → Managed auth → Settings**. Without it, the link
opens your Site URL.

To show the platform's password rules on your form:

```ts
import { checkPassword } from "@exwave-nexus/auth";

const { passwordPolicy } = await auth.getConfig();

checkPassword("hunter2", passwordPolicy);
// ["min_length", "uppercase", "symbol"]
```

## Password reset

Same idea: the email link opens your page, which sets the new password.

```ts
await auth.resetPassword({
  email: "player@example.com",
  redirectTo: `${location.origin}/reset-password`,
});
```

```ts
// On /reset-password
const link = await auth.handleEmailLink();

if (link?.type === "password_reset") {
  await auth.confirmPasswordReset({
    userId: link.userId,
    code: link.code,
    password: newPassword,
  });
}
```

## React

```tsx
import { ExwaveProvider, useExwave } from "@exwave-nexus/auth/react";

export function App() {
  return (
    <ExwaveProvider publishableKey="exw_pk_...">
      <Account />
    </ExwaveProvider>
  );
}

function Account() {
  const { auth, isLoaded, player } = useExwave();

  if (!isLoaded) return null;
  if (!player) return <SignInForm />;

  return (
    <>
      <p>Hi {player.displayName}</p>
      <button type="button" onClick={() => auth.signOut()}>
        Sign out
      </button>
    </>
  );
}
```

`auth` is the same client as in the quick start, so sign-up and email links
work the same way.

## Next.js

The session lives in an httpOnly cookie, and the browser never sees a refresh
token. Set two environment variables:

```bash
NEXT_PUBLIC_EXWAVE_PUBLISHABLE_KEY=exw_pk_...
EXWAVE_COOKIE_SECRET=... # openssl rand -base64 32
```

Then add three files:

```ts
// lib/exwave.ts
import { createExwaveNext } from "@exwave-nexus/auth/next";

export const exwave = createExwaveNext();
```

```ts
// app/api/exwave/[...action]/route.ts
import { exwave } from "@/lib/exwave";

export const { GET, POST } = exwave.routeHandlers();
```

```ts
// proxy.ts
import type { NextRequest } from "next/server";
import { exwave } from "@/lib/exwave";

export function proxy(request: NextRequest) {
  return exwave.proxy(request);
}

export const config = {
  matcher: ["/((?!api/exwave|_next/static|_next/image|favicon.ico).*)"],
};
```

Sign in from a Server Function, and read the player in a Server Component:

```ts
// app/actions.ts
"use server";

import { exwave } from "@/lib/exwave";

export async function signIn(login: string, password: string) {
  await exwave.signIn({ login, password });
}
```

```tsx
// app/page.tsx
import { exwave } from "@/lib/exwave";

export default async function Home() {
  const player = await exwave.getPlayer();

  return <p>{player ? `Hi ${player.displayName}` : "Signed out"}</p>;
}
```

Verification emails open `/verify`. Finish there from a form, since only a
Server Function can set the session cookie:

```tsx
// app/verify/page.tsx
import { redirect } from "next/navigation";
import { exwave } from "@/lib/exwave";

type Props = {
  searchParams: Promise<{ uid?: string; exwave_verify?: string }>;
};

export default async function VerifyPage({ searchParams }: Props) {
  const { uid = "", exwave_verify: code = "" } = await searchParams;

  async function verify() {
    "use server";
    await exwave.verifyEmail({ userId: uid, code });
    redirect("/");
  }

  return (
    <form action={verify}>
      <button type="submit">Verify my email</button>
    </form>
  );
}
```

Password reset emails open `/reset-password`: call
`exwave.confirmPasswordReset({ userId, code, password })` the same way, with
`code` from `exwave_reset`. A game running on the page gets its token from
`GET /api/exwave/token`.

## Your own server

Check a player's token before trusting it:

```ts
import { verifyPlayerAccessToken } from "@exwave-nexus/auth/server";

const { userId, claims } = await verifyPlayerAccessToken(token, {
  publishableKey: "exw_pk_...",
});
```

It throws an `ExwaveAuthError` with the code `invalid_token` when the token is
expired, forged, or for another platform.

## Errors

Every call throws an `ExwaveAuthError` with a `code` you can show to players:

```ts
import { isExwaveAuthError } from "@exwave-nexus/auth";

try {
  await auth.signIn({ login, password });
} catch (error) {
  if (isExwaveAuthError(error) && error.code === "invalid_credentials") {
    showError("Wrong email or password");
  }
}
```

| Code | Meaning |
| --- | --- |
| `invalid_credentials` | Wrong login or password |
| `email_not_verified` | The player hasn't opened the verification link yet |
| `player_locked` | The player was locked in Nexus → Players |
| `email_taken` | Sign-up with an email that's already in use |
| `weak_password` | The password breaks the platform's rules, listed in `error.failedRules` |
| `invalid_code` | The email link was already used or has expired |
| `rate_limited` | Too many attempts: retry after `error.retryAfter` seconds |

## Examples

`examples/` has a React + Vite app and a Next.js app. They run against a local
mock of the player API:

```bash
bun install
bun run mock      # mock player API on http://localhost:4010
bun run dev:spa   # http://localhost:5173
bun run dev:next  # http://localhost:3000
```

Sign in as `player1` with `Password123!`, or sign up and open the link the
mock prints.
