# Next.js with Exwave Auth

Sign-up, sign-in, email verification and password reset, made with
`npm create exwave`. The session lives in an httpOnly cookie, so Server
Components and Route Handlers can read it.

```sh
npm run dev   # http://localhost:3000
```

Using the local mock (no publishable key yet)? Run `npm run mock` in a second
terminal and sign in as `player1` / `Password123!`. Email links are printed
there. The home page says which one the app talks to.

## What's where

| Path | What it does |
| --- | --- |
| `lib/exwave.ts` | The server helper: `exwave.getUser()`, `exwave.getAuthState()`… |
| `app/api/exwave/[...action]/route.ts` | The routes the components call |
| `proxy.ts` | Keeps sessions fresh before pages render |
| `app/layout.tsx` | `<ExwaveProvider>` with the session from the server |
| `app/(auth)/*` | Sign-in, sign-up, verify, forgot and reset password pages |
| `app/account/page.tsx` | A page only signed-in users see |
| `components/exwave/*` | The auth screens, as plain React components: edit them freely |
| `app/globals.css` | Their styles, and the colors as CSS variables (light and dark) |
| `lib/local-mock.ts`, `components/exwave/backend-notice.tsx` | The local mock notices: delete them once you're live |

Using shadcn/ui? The same screens exist as shadcn components:
`npx shadcn@latest add https://www.exwave.net/r/auth-nextjs.json`.

## Before you deploy

- Set `NEXT_PUBLIC_EXWAVE_PUBLISHABLE_KEY` (Nexus → Auth) and a new
  `EXWAVE_COOKIE_SECRET` (`openssl rand -base64 32`) on your host.
- In Nexus → Auth → Settings, set the Site URL to your site, and add every
  origin email links may land on (such as `http://localhost:3000`) to the
  Redirect URLs.

Guide: https://www.exwave.net/docs/auth/get-started/
