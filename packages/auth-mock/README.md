# @exwave-nexus/auth-mock

An in-memory stand-in for the Exwave Auth API, so an app using
`@exwave-nexus/auth` runs before it has a real platform, and so tests can run
without the network. Email links are printed to the console instead of being
sent. It keeps everything in memory and accepts any origin: never use it in
production.

## Run it

```sh
npx exwave-auth-mock                # http://localhost:4010
npx exwave-auth-mock --pat-ttl 120  # shorter player access tokens
```

It prints a publishable key for `http://localhost:4010`. Put it in
`.env.local` as `NEXT_PUBLIC_EXWAVE_PUBLISHABLE_KEY` (Next.js) or
`VITE_EXWAVE_PUBLISHABLE_KEY` (Vite). Sign in as `player1` with
`Password123!`, or sign up and open the link printed in the console.

## Use it in tests

```ts
import { createExwaveAuth, memoryStorage } from "@exwave-nexus/auth";
import { createMockAuth } from "@exwave-nexus/auth-mock";

const mock = await createMockAuth({ log: () => {} });
const auth = createExwaveAuth({
  publishableKey: mock.publishableKey,
  storage: memoryStorage(),
  fetch: mock.fetcher(), // in-process, no network
});
await auth.signIn({ login: "player1", password: "Password123!" });
```

`createMockAuth()` takes options for the password policy, sign-up, allowed
redirect origins, PAT lifetime and a fake clock. `mock.emails` holds the sent
links, and `mock.lock("player1")` locks an account. `startMockServer()` serves
it over HTTP with `node:http`.
