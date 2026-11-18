# Findings: managed auth for websites (EXC-294)

Two ways to sign players in to a website with Exwave managed auth, built on
the player REST API (exwave-auth v0.7.0, `/orbit/v1/platforms/:platformId/…`):

- **SPA** (`examples/vite-spa`): the browser calls the API with
  `@exwave/auth`. The PAT stays in memory; the refresh token sits in
  `localStorage`.
- **Server** (`examples/next-server`): the Next.js server calls the API with
  `@exwave/auth/next`. The browser holds one sealed, httpOnly cookie.

Status (2026-11-18): built against the in-memory mock
(`scripts/mock-auth.ts`), then run against production (Auth v0.7.0, platform
"Auth test") with only the publishable key from Nexus. Everything below held in
production; see [Production run](#production-run-2026-11-18) for what was
checked and what it found.

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

## Password rules

Added after the production run, where three sign-ups in a row got
`422 weak_password` (verified against the mock; not yet run in production).

- `GET config` carries the policy. The core's `checkPassword(password,
  policy)` checks it the way Auth does before answering `weak_password`: the
  length in code points, and Zitadel's ASCII classes (a symbol is anything but
  `A-Za-z0-9`). `passwordRules(policy)` lists the rules it turns on.
- Both examples list the rules under the password field on sign-up and
  password reset, tick them off as the player types, and block the submit
  (native validation through `setCustomValidity`) until they pass.
- Auth answers `weak_password` with no detail, so on a 422 the library reads
  the policy again and sets `error.failedRules` (`["symbol"]`). The examples
  say "Your password needs a symbol (like ! or #)."; the route handler passes
  `failedRules` on in its error body.
- The mock now uses Zitadel's default policy (8 characters, upper case, lower
  case, a number, a symbol), the one new production platforms get, and checks
  it before the email lookup and before the reset code, as Auth does.

## Why a session ended

| Reason | When |
| --- | --- |
| `player_locked` | A refresh answered `403 player_locked` (Nexus → Players → Lock) |
| `invalid_refresh_token` | A refresh answered `401`: sign out everywhere or a password reset on another device, a replayed token, or expiry |
| `signed_out_everywhere` | The player signed out everywhere from this browser |
| `signed_out` | The player signed out here |

- **SPA:** `onAuthStateChange` passes the reason with `SIGNED_OUT`, and with
  `INITIAL_SESSION` when the session ended while loading or in the last
  5 minutes; `useExwave().signOutReason` holds it. Ending a session now leaves
  `{ended, at}` in storage where the refresh token was, so every tab gets the
  same reason whichever news arrives first: the `storage` event, the
  BroadcastChannel message, or the stored entry a tab reads after waiting on
  the lock. Before, the reason was lost on a reload (the production case: the
  load-time refresh ended the session before any listener) and in other tabs
  (the `storage` event beat the channel's message and said `signed_out`).
- **Server:** an ended session's cookie is replaced by
  `exwave_session_signed_out=<reason>` (httpOnly, `Max-Age=300`, nothing
  secret), set by `proxy.ts`, the route handler and Server Functions; a new
  sign-in clears it. `exwave.getSignOutReason()` reads it in a Server
  Component, and `GET /api/exwave/session` returns it as `signOutReason`.
- Both sign-in pages show it: "This account was locked, so you were signed
  out." for a lock, "Your session ended: you signed out everywhere or changed
  your password on another device, or it expired." for a `401`, and a short
  confirmation for the player's own sign-out.

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
2026-11-18. The Exwave columns were run from Nexus in production the same day.

| | Exwave SPA | Exwave Next.js | Clerk | Supabase | Neon Auth |
| --- | --- | --- | --- | --- | --- |
| Env vars | 1 | 2 | 2 (publishable + secret key) | 2 (URL + publishable key) | 2 (auth URL + cookie secret) |
| Server files (Next.js) | — | 3 | 1 (`proxy.ts`) + provider | 3 (browser client, server client, `proxy.ts`) | 2–3 (auth instance, handler route, proxy) |
| Prebuilt UI | no | no | yes | no (auth-ui is separate) | yes |
| Custom forms | yes, the only way | yes | yes (hooks) | yes | yes |
| Steps to first sign-in | enable in Nexus → copy key → install → provider → form | same, plus a cookie secret and 3 files | create app → keys → install → proxy + provider | create project → keys → install → clients + proxy | enable auth → copy URL → install → handler + proxy |
| Time to first sign-in | 4 steps in Nexus, then sign up; not timed | same, plus the cookie secret | — | — | — |

Takeaways:
- One public key and no secret makes the SPA path the simplest of the five.
- The server path matches Neon Auth's shape (an auth URL equivalent plus a
  cookie secret). Clerk saves files with one `clerkMiddleware()`; an
  `exwaveMiddleware()` wrapper that also mounts the route handler could match
  it.
- No prebuilt UI is the biggest gap against Clerk and Neon.

## Core bundle size

`@exwave/auth` (the `.` entry: client, publishable key, errors, storage,
password rules),
bundled for the browser by `Bun.build` with minification, then gzip level 9
(`bun run size`):

| Minified | Min+gz | Budget |
| --- | --- | --- |
| 9.57 KB | **3.91 KB** (3,999 B) | 6 KB |

`scripts/bundle-size.test.ts` fails CI above the budget. The session cookie is
1,365 B for a typical player and 2,041 B for the largest one the API accepts
(limit 4,096 B, asserted in `packages/auth/src/server/cookie.test.ts`).

## Contract questions, answered

Found while building against the plan's contract and answered by the
player API session in exwave-auth PR #12 (commit `5b27925`, released in v0.7.0).
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

## Production run (2026-11-18)

Auth v0.7.0 on `auth-prod.exwave.net`, exwave-db 0064 and 0065 applied, and a
new platform "Auth test" (Free plan) with managed auth turned on from Nexus.
Turning it on created the platform's Zitadel org and PKCE app. Both examples
ran on localhost with only `.env.development.local` changed: the publishable
key, plus the cookie secret for Next.js.

| Check | SPA | Next.js |
| --- | --- | --- |
| Sign up, verify by email link, signed in | ✓ (the email came through Zitadel's Resend SMTP provider) | — (same player) |
| Sign in | ✓ | ✓ |
| PAT claims (`iss`, `aud`, `managed:<platform>:<user>` subject, 900 s) | ✓ | ✓ |
| PAT signature against `/orbit/v1/jwks` | ✓ (WebCrypto Ed25519, in the page) | ✓ (`GET /api/protected`, `verifyPlayerAccessToken()`) |
| `GET players/me` with the PAT | ✓ | — |
| Refresh and rotation | ✓ A new tab refreshed once, and the open tab took the new PAT | not waited out (proxy refresh at 14 min) |
| Two-tab sign-out | ✓ Immediate | — |
| Sign out everywhere | ✓ The SPA's next refresh got `401` and cleared every tab | ✓ Signed out at once (triggered here) |
| Lock in Nexus | ✓ Next refresh got `403 player_locked`; both live sessions were revoked (`revoke_reason = player_locked`) | ✓ (its session was one of the two) |
| Player in Nexus → Players | ✓ Managed auth, Active / Locked / Active | |

**Client-side secrets.** Nothing leaks beyond what each design keeps in the
browser:
- **SPA:**
  - storage holds only the refresh token and a player summary, in
    `localStorage`. No PAT is stored anywhere (sessionStorage, cookies,
    IndexedDB);
  - no raw token is in the DOM;
  - the delivered JS (24 scripts) and a production build contain only
    `VITE_EXWAVE_PUBLISHABLE_KEY`: no secret, JWT, refresh token or
    `process.env` read;
  - the page contacts only its own origin and `auth-prod.exwave.net`, and no
    token reaches the console.
- **Next.js:**
  - JavaScript can see no cookie, because the session cookie is `HttpOnly`;
  - storage is empty;
  - the DOM, server HTML and RSC payload hold no JWT, refresh token or sealed
    cookie;
  - none of the 17 client chunks contains the cookie secret's value, and `jose`
    is not shipped.
- **`GET /api/exwave/token`:**
  - `200` with only `{access_token, token_type, expires_in}` and `no-store` to
    the page itself;
  - `403` to another origin on the same host (`localhost:5173`), even with the
    real cookie attached;
  - `403` to cross-site requests, `same-site` requests and requests without
    `Sec-Fetch-Site`;
  - `401` to a forged cookie.

**Found:**
- **Password policy.** The default requires a symbol. The first sign-up
  attempts got `422 weak_password` three times before one passed. The examples
  should show `password_policy` from `GET config` next to the field, and say
  which rule failed. Since fixed: see [Password rules](#password-rules).
- **Unexplained sign-out.** The SPA, not only Next.js, signs a locked player
  out without saying why. Since fixed: see
  [Why a session ended](#why-a-session-ended).
- **Stale status in Nexus.** After Unlock, the Players table showed "Locked"
  until a reload, although the toast said "Player unlocked".
- **No confirmation for Lock.** Lock acts at once. That is acceptable because
  Unlock reverses it.
- **Sessions on unlock.** Unlocking does not bring back the revoked sessions.
  The player signs in again, as designed.
- **Steps from Nexus to first sign-in:**
  1. create the platform and pick a plan;
  2. Auth → Enable managed auth;
  3. Settings → Site URL and redirect URLs;
  4. copy the publishable key into `.env.development.local`.

  The overview's quickstart snippet matched the library. Time was not measured
  with a stopwatch.

## Remaining gaps

- Prebuilt, themeable forms (Clerk and Neon ship them).
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
