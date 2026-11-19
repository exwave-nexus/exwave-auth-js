# exwave-auth-js

`@exwave-nexus/auth`: managed player auth for websites and game JS glue, plus
two example apps. Private for now (EXC-294), on GitHub Packages:
[`packages/auth/README.md`](packages/auth/README.md) says how to install it.

| Path | What |
| --- | --- |
| `packages/auth` | The library: framework-free core (`.`), `./server`, `./next`, `./react` |
| `examples/vite-spa` | React + Vite, browser only, port 5173 |
| `examples/next-server` | Next.js App Router, server-side sessions, port 3000 |
| `scripts/mock-auth.ts` | In-memory player API for local work, port 4010 |
| `docs/findings.md` | SPA vs server, DX scorecard, bundle size, contract questions |

## Run the examples

```bash
bun install
bun run mock        # http://localhost:4010, prints email links
bun run dev:spa     # http://localhost:5173
bun run dev:next    # http://localhost:3000
```

Both examples already point at the mock through their `.env.development`.
Sign in as `player1` / `Password123!`, or sign up and open the link the mock
prints. `MOCK_PAT_TTL=75 bun run mock` makes PATs last 75 s, to watch
refreshes. `curl -X POST localhost:4010/__mock/players/player1/lock` locks the
player, and the sign-in page then says so. The mock uses Zitadel's default
password policy (8 characters with upper case, lower case, a number and a
symbol), like a new production platform.

For a real platform, put the publishable key from Nexus → Managed auth in
`.env.development.local` (and, for Next.js, a cookie secret from
`openssl rand -base64 32`).

## Use it

**Browser (any framework, or game JS glue):**

```ts
import { createExwaveAuth } from "@exwave-nexus/auth";

const auth = createExwaveAuth({ publishableKey: "exw_pk_…" });
await auth.signIn({ login: "player1", password });
const pat = await auth.getPlayerAccessToken(); // ≥ 60 s left, refreshed for you
auth.onAuthStateChange((event, session, { reason }) => {
  // every tab, kept in sync; reason says why on SIGNED_OUT (and on load):
  // player_locked, invalid_refresh_token, signed_out_everywhere, signed_out
});

// Password rules from the platform's policy, checked as Auth checks them
const { passwordPolicy } = await auth.getConfig();
checkPassword("Password123", passwordPolicy); // ["symbol"]
// A 422 weak_password names them too: error.failedRules
```

**Email links (sign-up verification, password reset):** the email links to
your site with `?exwave_verify=…&uid=…` or `?exwave_reset=…&uid=…`, and
nothing happens until that page spends the code. The link lands on
`redirectTo`, which must share an origin with the Site URL or a redirect URL
in Nexus → Managed auth → Settings; without it, on the Site URL itself.

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

**React:** `<ExwaveProvider publishableKey="exw_pk_…">` and `useExwave()`
(`signOutReason` included).

**Next.js:**

```ts
// lib/exwave.ts — reads NEXT_PUBLIC_EXWAVE_PUBLISHABLE_KEY and EXWAVE_COOKIE_SECRET
export const exwave = createExwaveNext();
// app/api/exwave/[...action]/route.ts
export const { GET, POST } = exwave.routeHandlers();
// proxy.ts
export function proxy(request: NextRequest) { return exwave.proxy(request); }
```

Then `await exwave.signIn(…)` in a Server Function, `await exwave.getPlayer()`
in a Server Component, and `GET /api/exwave/token` for a game on the page.
On the sign-in page, `await exwave.getSignOutReason()` says why the last
session ended; `(await exwave.getConfig()).passwordPolicy` feeds sign-up forms.

Email links land on `/verify` and `/reset-password` of the app's origin
(`createExwaveNext({ paths })` changes them), so those pages must exist. Read
`exwave_verify` or `exwave_reset`, and `uid`, from `searchParams`, then call
`exwave.verifyEmail({ userId, code })` or
`exwave.confirmPasswordReset({ userId, code, password })` from a Server
Function: it sets the session cookie, which a Server Component cannot
(`examples/next-server/app/verify`).

**Any server:** `verifyPlayerAccessToken(token, { publishableKey })` from
`@exwave-nexus/auth/server` checks a PAT against `/orbit/v1/jwks`.

## Develop

```bash
bun run lint        # Biome
bun run typecheck   # every workspace
bun test            # library, mock contract, cookie size, bundle budget
bun run build       # library dist/, both examples
bun run size        # core min+gz
```

## Publish

Releases go to GitHub Packages as `@exwave-nexus/auth`: private, readable with
this repository's permissions, and scoped to its owner as that registry
requires. To release:

1. Bump `version` in `packages/auth/package.json` and merge to `main`.
2. Tag that commit and push the tag:

   ```bash
   git tag v0.2.0 && git push origin v0.2.0
   ```

The Release workflow checks the tag matches the version, runs the checks, and
publishes with the workflow's own token, so no secret is needed. Published
versions cannot be overwritten, only deleted from the package's settings.

`bun run --cwd packages/auth stage` builds what gets published into
`packages/auth/publish/`: `dist/`, the README, `LICENSE` and a `package.json`
whose exports point at `dist/` (the workspace's own one points at `src/`).
`npm pack --dry-run ./packages/auth/publish` lists the files.
