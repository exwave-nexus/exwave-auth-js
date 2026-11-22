# React (Vite) with Exwave Auth

Sign-up, sign-in, email verification and password reset, made with
`npm create exwave`. The browser talks to Exwave Auth; the session survives
reloads and is shared between tabs.

```sh
npm run dev   # http://localhost:5173
```

Using the local mock (no publishable key yet)? Run `npm run mock` in a second
terminal and sign in as `player1` / `Password123!`. Email links are printed
there. The home page says which one the app talks to.

## What's where

| Path | What it does |
| --- | --- |
| `src/main.tsx` | `<ExwaveProvider>` with the publishable key and the router's `navigate` |
| `src/app.tsx` | The routes, including the auth pages |
| `src/router.tsx` | A few lines of routing: swap in your router |
| `src/pages/account.tsx` | A page only signed-in users see |
| `src/components/exwave/*` | The auth screens, as plain React components: edit them freely |
| `src/index.css` | Their styles, and the colors as CSS variables (light and dark) |
| `src/lib/local-mock.ts`, `src/components/exwave/backend-notice.tsx` | The local mock notices: delete them once you're live |

Using shadcn/ui? The same screens exist as shadcn components:
`npx shadcn@latest add https://www.exwave.net/r/auth-react.json`.

## Before you deploy

- Set `VITE_EXWAVE_PUBLISHABLE_KEY` (Nexus → Auth) on your host.
- In Nexus → Auth → Settings, set the Site URL to your site, and add every
  origin email links may land on (such as `http://localhost:5173`) to the
  Redirect URLs.

Guide: https://www.exwave.net/docs/auth/get-started/
