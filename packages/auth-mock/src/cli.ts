// exwave-auth-mock: the mock Auth API on http://localhost:4010.
//
//   npx exwave-auth-mock                 # or `bun run mock` in this repo
//   npx exwave-auth-mock --pat-ttl 120   # shorter PATs, to watch refreshes
import { parseArgs } from "node:util";
import { MOCK_PORT, SEED_USERS } from "./mock";
import { startMockServer } from "./server";

const { values } = parseArgs({
  options: {
    port: { type: "string" },
    "pat-ttl": { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log(`Usage: exwave-auth-mock [--port 4010] [--pat-ttl 900]

An in-memory Exwave Auth API for local development. Not for production.
Also reads MOCK_AUTH_PORT and MOCK_PAT_TTL.`);
  process.exit(0);
}

const port = Number(values.port ?? process.env.MOCK_AUTH_PORT ?? MOCK_PORT);
const patTtlSeconds = Number(
  values["pat-ttl"] ?? process.env.MOCK_PAT_TTL ?? 900,
);
const { mock } = await startMockServer({ port, patTtlSeconds });
const seed = SEED_USERS[0];

console.log(`
  Exwave mock auth  ${mock.origin}   (PATs last ${mock.settings.patTtlSeconds} s)

  Publishable key   ${mock.publishableKey}
    Next.js   NEXT_PUBLIC_EXWAVE_PUBLISHABLE_KEY=…
    Vite      VITE_EXWAVE_PUBLISHABLE_KEY=…

  Password policy   ${JSON.stringify(mock.settings.passwordPolicy)}
    (Zitadel's default; createMockAuth({ passwordPolicy }) changes it)

  Test users (password ${seed?.password})
    ${SEED_USERS.map((u) => `${u.email} / ${u.username}${u.emailVerified ? "" : "  (email not verified)"}`).join("\n    ")}

  Email links are printed here instead of being sent.

  Mock controls
    curl ${mock.origin}/__mock/players
    curl -X POST ${mock.origin}/__mock/players/${seed?.username}/lock     (and /unlock)
    curl ${mock.origin}/__mock/emails
`);
