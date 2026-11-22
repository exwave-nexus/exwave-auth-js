# @exwave-nexus/auth-nextjs

Exwave Auth for the Next.js App Router. The session lives in a sealed
httpOnly cookie: Server Components, Server Functions and Route Handlers read
the user, and pages render signed in from the first byte. Built on
[`@exwave-nexus/auth`](https://www.npmjs.com/package/@exwave-nexus/auth) and
[`@exwave-nexus/auth-react`](https://www.npmjs.com/package/@exwave-nexus/auth-react).

Full guide: <https://www.exwave.net/docs/auth/nextjs/>

```bash
npm install @exwave-nexus/auth @exwave-nexus/auth-react @exwave-nexus/auth-nextjs
```

Starting from scratch? `npm create exwave@latest -- --template next` makes an
app with all of this, and every screen, already in place.

## Set it up

```bash
# .env.local
NEXT_PUBLIC_EXWAVE_PUBLISHABLE_KEY=exw_pk_...   # Nexus → Auth
EXWAVE_COOKIE_SECRET=...                        # openssl rand -base64 32
```

```ts
// lib/exwave.ts
import { createExwaveNext } from "@exwave-nexus/auth-nextjs";

export const exwave = createExwaveNext();
```

```ts
// app/api/exwave/[...action]/route.ts: the routes the hooks call
import { exwave } from "@/lib/exwave";

export const { GET, POST } = exwave.routeHandlers();
```

```ts
// proxy.ts: keeps sessions fresh before pages render
import type { NextRequest } from "next/server";
import { exwave } from "@/lib/exwave";

export function proxy(request: NextRequest) {
  return exwave.proxy(request);
}

export const config = {
  matcher: ["/((?!api/exwave|_next/static|_next/image|favicon.ico).*)"],
};
```

```tsx
// app/layout.tsx
import { ExwaveProvider } from "@exwave-nexus/auth-nextjs/client";
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

`ExwaveProvider` from `./client` is `@exwave-nexus/auth-react`'s, wired to the
router: it navigates with `router.push` and refreshes Server Components when
someone signs in or out. Every hook from `@exwave-nexus/auth-react` works
under it.

## On the server

```ts
const user = await exwave.getUser(); // null when signed out
```

| Method | Does |
| --- | --- |
| `getUser()` | The signed-in user, or `null`. Safe in Server Components |
| `getAuthState()` | The session as the browser may see it, for the provider |
| `getSession()` | The user and a player access token |
| `getPlayerAccessToken()` | A PAT with at least 60 s left, for a game |
| `getSignOutReason()` | Why the last session in this browser ended |
| `getConfig()` | The platform's settings, cached for 60 s |
| `signIn()`, `verifyEmail()`, `confirmPasswordReset()`, `signOut()` | The same, from Server Functions |
| `routeHandlers()`, `proxy(request)` | The wiring above |

`createExwaveNext(options)` takes `publishableKey` and `cookieSecret` to read
them from elsewhere, `appUrl` when email links should name another origin
than the request's, and `paths` for the pages they land on.

## Ready-made screens

The sign-in, sign-up, verification and password reset pages, with the files
above, as shadcn/ui components:

```bash
npx shadcn@latest add https://www.exwave.net/r/auth-nextjs.json
```

Or a whole new app on shadcn/ui, in Exwave's colors, with a home page and an
account page too:

```bash
npx shadcn@latest create -t next -n my-app https://www.exwave.net/r/exwave-app.json
```

Next.js 16 or later and React 19 or later are peer dependencies.
