# Findings: managed auth for websites (EXC-294)

Two ways to sign players in to a website with Exwave managed auth, built on
the player REST API (exwave-auth v0.7.0, `/orbit/v1/platforms/:platformId/…`):

- **SPA** (`examples/vite-spa`): the browser calls the API with
  `@exwave/auth`. The PAT stays in memory; the refresh token sits in
  `localStorage`.
- **Server** (`examples/next-server`): the Next.js server calls the API with
  `@exwave/auth/next`. The browser holds one sealed, httpOnly cookie.

Status (2026-11-18): measured against the in-memory mock
(`scripts/mock-auth.ts`), which follows the plan's contract as exwave-auth
PR #12 implements it. The production run (Phase 5) still has to confirm every
point below against the real API.

## Setup effort

| | SPA | Server (Next.js) |
| --- | --- | --- |
| Env vars | 1: `VITE_EXWAVE_PUBLISHABLE_KEY` | 2: `NEXT_PUBLIC_EXWAVE_PUBLISHABLE_KEY`, `EXWAVE_COOKIE_SECRET` |
| Files to add | 0 (wrap the app in `<ExwaveProvider>`) | 3: `lib/exwave.ts` (1 line), `app/api/exwave/[...action]/route.ts` (1 line), `proxy.ts` (4 lines) |
| Code per form | `await auth.signIn({ login, password })` | a Server Function calling `exwave.signIn(…)`, returning errors as values |
| Email links | `auth.handleEmailLink()` on the landing page | a page reading `?exwave_verify=…&uid=…` and calling `exwave.verifyEmail()` from the client once |
| Nexus | enable managed auth; Site URL and redirect URLs must include the app's origin (`redirect_to` is checked against them) | same |

Both need the same forms (sign up, check email, verify landing, sign in,
forgot and reset password, account). The library does not ship UI.

## What a stolen browser token gives an attacker

| Theft | SPA | Server |
| --- | --- | --- |
| XSS on the site | Reads the refresh token from `localStorage`, so it keeps a session from anywhere for up to 30 days idle (90 days absolute) | Cannot read the cookie. While the page is open it can call `GET /api/exwave/token` and get 15-minute PATs, nothing longer |
| Copied PAT | 15 minutes against player services; no revocation yet (EXC-299 part 2) | same |
| Copied refresh token or cookie (malware, a shared machine) | Works until rotation: once both the thief and the player refresh, the second replay after the 30 s grace window revokes the whole session | Same, because the cookie carries the refresh token |
| CSRF | Not applicable: the API takes the token in the body, never a cookie | POST routes require `Sec-Fetch-Site: same-origin` (or a matching `Origin`); `GET token` requires `Sec-Fetch-Site: same-origin`; Server Functions have Next.js's own Origin check |

`storage: "session"` (per tab, gone when the tab closes) or `"memory"` (sign
in on every reload) shrink the SPA's exposure at a UX cost. Sign out
everywhere, a password reset, or locking the player in Nexus ends every
session at its next refresh in both setups.

## Refresh behaviour

**SPA**
- A timer refreshes 60 s before the PAT expires; `getPlayerAccessToken()`
  refreshes on demand inside that minute.
- Tabs share one refresh: Web Locks serialise it, and BroadcastChannel hands
  the new PAT to the other tabs, so N open tabs cost one refresh every
  14 minutes. Opening a new tab costs one refresh, because PATs are never
  stored.
- Sign-in and sign-out reach other tabs through BroadcastChannel, with
  `storage` events as the fallback.
- A failed refresh for a passing reason (network, 5xx, 429) keeps a PAT that
  has not expired yet and retries after 10 s (or `Retry-After`).
- Hidden tabs get throttled timers; returning to the tab refreshes if due.

**Server**
- `proxy.ts` refreshes a session whose PAT has under 60 s left before the page
  renders, and forwards the fresh cookie to the render. `GET token` and
  `GET session` refresh too.
- Server Components never refresh: they cannot set cookies, so a rotated
  refresh token would be lost and the next refresh would count as reuse and
  revoke the session. `getPlayerAccessToken()` there returns the cookie's PAT
  while it is valid, else `null`.
- Concurrent requests race on the same refresh token. The loser gets the grace
  answer (`refresh_token: null`): the helper uses that PAT for its own request
  and does **not** write a cookie, since writing the old refresh token back
  could overwrite the winner's newer cookie (tested in
  `scripts/mock-auth.test.ts`).
- Remaining risk: if the winner's response never reaches the browser (an
  aborted navigation), the browser keeps the old token and its next refresh,
  more than 30 s later, revokes the session.
- An idle tab does not refresh at all; the next request does. Sessions last
  30 days idle.

## How a game on the page gets a PAT

- **SPA:** the game's JS glue calls `auth.getPlayerAccessToken()`, which always
  returns a PAT with at least 60 s left (or `null` when signed out).
- **Server:** the game calls `GET /api/exwave/token` on the same origin and gets
  `{access_token, token_type, expires_in}`, the shape of Auth's other PAT
  routes; it asks again when `expires_in` runs low. Cross-origin requests and
  requests without `Sec-Fetch-Site` are refused.
- Either way, services verify the PAT with `/orbit/v1/jwks`
  (`verifyPlayerAccessToken()` in `@exwave/auth/server`), as
  `examples/next-server/app/api/protected` does.

## DX scorecard

Competitors from their current Next.js quickstarts
([Clerk](https://clerk.com/docs/nextjs/getting-started/quickstart),
[Supabase](https://supabase.com/docs/guides/auth/server-side/nextjs),
[Neon Auth](https://neon.com/docs/auth/quick-start/nextjs)), read on
2026-11-18. Phase 5 times the real path from Nexus.

| | Exwave SPA | Exwave Next.js | Clerk | Supabase | Neon Auth |
| --- | --- | --- | --- | --- | --- |
| Env vars | 1 | 2 | 2 (publishable + secret key) | 2 (URL + publishable key) | 2 (auth URL + cookie secret) |
| Server files (Next.js) | — | 3 | 1 (`proxy.ts`) + provider | 3 (browser client, server client, `proxy.ts`) | 2–3 (auth instance, handler route, proxy) |
| Prebuilt UI | no | no | yes | no (auth-ui is separate) | yes |
| Custom forms | yes, the only way | yes | yes (hooks) | yes | yes |
| Steps to first sign-in | enable in Nexus → copy key → install → provider → form | same, plus a cookie secret and 3 files | create app → keys → install → proxy + provider | create project → keys → install → clients + proxy | enable auth → copy URL → install → handler + proxy |
| Time to first sign-in | not measured yet (Phase 5, from Nexus) | not measured yet | — | — | — |

Takeaways:
- One public key and no secret makes the SPA path the simplest of the five.
- The server path matches Neon Auth's shape (an auth URL equivalent plus a
  cookie secret). Clerk saves files with one `clerkMiddleware()`; an
  `exwaveMiddleware()` wrapper that also mounts the route handler could match
  it.
- No prebuilt UI is the biggest gap against Clerk and Neon.

## Core bundle size

`@exwave/auth` (the `.` entry: client, publishable key, errors, storage),
bundled for the browser by `Bun.build` with minification, then gzip level 9
(`bun run size`):

| Minified | Min+gz | Budget |
| --- | --- | --- |
| 8.67 KB | **3.55 KB** (3,640 B) | 6 KB |

`scripts/bundle-size.test.ts` fails CI above the budget. The session cookie is
1,365 B for a typical player and 2,041 B for the largest one the API accepts
(limit 4,096 B, asserted in `packages/auth/src/server/cookie.test.ts`).

## Contract questions, answered

Found while building against the plan's contract and answered by the
player API session in exwave-auth PR #12 (commit `5b27925`, not merged yet).
The mock and the client now follow these answers; `scripts/mock-auth.test.ts`
pins them.

| # | Question | Answer in PR #12 |
| --- | --- | --- |
| 1 | Can browsers read `Retry-After` on `429 rate_limited`? | Yes: `/orbit/v1` CORS exposes it (new in PR #12; Auth v0.6.0 does not). No `retry_after` body field |
| 2 | `GET players/me` shape | The bare player object, no `{player}` wrapper (the client accepts both) |
| 3 | `player.id` vs `player.user_id` | `id` is the PAT subject `managed:<platform id>:<user id>`; `user_id` is the Zitadel user ID, the `uid` of email links |
| 4 | A locked player's refresh, after the lock revoked the session | `403 player_locked` (status checked before revocation and expiry); after an unlock, `401 invalid_refresh_token` |
| 5 | A `redirect_to` off the allowed origins | `400 invalid_redirect_to`, also when the link would not fit Zitadel's 200-character template |
| 6 | `password_policy` fields | `{min_length, requires_uppercase, requires_lowercase, requires_number, requires_symbol}` |
| 7 | `oidc.scopes` | An array |
| 8 | Reset confirm on an unverified email | Marks the email verified and signs in |
| 9 | Locked player at verify-email or reset confirm | `403 player_locked`, after the code is used |
| 10 | Publishable key encoding | Nexus's choice; the decoder accepts padding and a trailing slash, and expects neither |

Also from PR #12: 202 routes answer `{}`; failed sign-ins (10 per 15 minutes
per login) reset on a success; wrong codes are limited to 10 per 15 minutes
per user; usernames match `^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$`; Zitadel failures
answer `502 managed_auth_unavailable`. The mock does the same.

## Remaining gaps

- Prebuilt, themeable forms (Clerk and Neon ship them).
- The Next.js app cannot tell the player why a session ended (locked vs
  expired): the proxy clears the cookie and the page just redirects. A
  short-lived "signed out because" cookie would fix it.
- A new SPA tab refreshes once instead of asking an open tab for its PAT.
- `@exwave/auth` exports TypeScript sources; publishing needs `exports` to point
  at `dist/` (the build already emits ESM and `.d.ts`).
- `__Host-` cookie prefix in production (it cannot work on plain-HTTP
  localhost, so it needs a per-environment name).
- Playwright smoke tests for both examples (sign in, refresh, sign out, two
  tabs), against the mock in CI and production by hand.
- Out of scope per the plan: CAPTCHA, social login, per-platform allowed
  origins, shared rate limits, live PAT revocation, sign-up enumeration
  hardening, Godot.
