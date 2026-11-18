# exwave-auth-js

`@exwave/auth`: managed player auth for websites and game JS glue, plus two
example apps. Private for now (EXC-294).

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
player.

For a real platform, put the publishable key from Nexus → Managed auth in
`.env.development.local` (and, for Next.js, a cookie secret from
`openssl rand -base64 32`).

## Use it

**Browser (any framework, or game JS glue):**

```ts
import { createExwaveAuth } from "@exwave/auth";

const auth = createExwaveAuth({ publishableKey: "exw_pk_…" });
await auth.signIn({ login: "player1", password });
const pat = await auth.getPlayerAccessToken(); // ≥ 60 s left, refreshed for you
auth.onAuthStateChange((event, session) => { /* every tab, kept in sync */ });
```

**React:** `<ExwaveProvider publishableKey="exw_pk_…">` and `useExwave()`.

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

**Any server:** `verifyPlayerAccessToken(token, { publishableKey })` from
`@exwave/auth/server` checks a PAT against `/orbit/v1/jwks`.

## Develop

```bash
bun run lint        # Biome
bun run typecheck   # every workspace
bun test            # library, mock contract, cookie size, bundle budget
bun run build       # library dist/, both examples
bun run size        # core min+gz
```
