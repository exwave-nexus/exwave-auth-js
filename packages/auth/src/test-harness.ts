// Both clients against the mock: the browser client talks to it directly, the
// route client through handleAuthRequest, as a Next.js app's /api/exwave/*
// routes would, with a cookie jar standing in for the browser's.
// By path, not as a dependency: auth-mock depends on this package, and a
// cycle would stop `bun run --filter` from building this one first.
import {
  createMockAuth,
  type MockAuthOptions,
} from "../../auth-mock/src/index";
import { createExwaveAuth } from "./client";
import { createExwaveRouteClient } from "./route-client";
import { createExwaveServerAuth, handleAuthRequest } from "./server";
import { memoryStorage } from "./storage";

export const APP = "http://localhost:3000";
const SECRET = "harness-cookie-secret-at-least-32-chars";

export type ClientMode = "browser" | "route";

export async function harness(options: MockAuthOptions = {}) {
  const clock = { now: Date.now() };
  const now = () => clock.now;
  const mock = await createMockAuth({ now, log: () => {}, ...options });
  /** Player API paths (after `players/`) that answer 503 for now. */
  const failing = new Set<string>();
  /** Calls to the player API, by path after `players/`. */
  const calls = new Map<string, number>();
  const mockFetch = mock.fetcher();
  const api: typeof fetch = (async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const path = url.pathname.split("/players/")[1];
    if (path) calls.set(path, (calls.get(path) ?? 0) + 1);
    if (path && failing.has(path))
      return Response.json(
        { error: "managed_auth_unavailable" },
        { status: 503 },
      );
    return mockFetch(input, init);
  }) as typeof fetch;

  const server = createExwaveServerAuth({
    publishableKey: mock.publishableKey,
    cookieSecret: SECRET,
    fetch: api,
    now,
  });
  const jar = new Map<string, string>();
  let appRequests = 0;
  const app: typeof fetch = (async (input, init) => {
    appRequests++;
    const url = new URL(String(input), APP);
    const headers = new Headers(init?.headers);
    headers.set("sec-fetch-site", "same-origin");
    if (jar.size)
      headers.set(
        "cookie",
        [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
      );
    const response = await handleAuthRequest(
      server,
      new Request(url, { ...init, headers }),
      url.pathname.replace(/^\/api\/exwave\//, ""),
      { links: { verifyEmail: "/verify", resetPassword: "/reset-password" } },
    );
    for (const cookie of response.headers.getSetCookie()) {
      const [pair = ""] = cookie.split(";");
      const at = pair.indexOf("=");
      const name = pair.slice(0, at);
      const value = pair.slice(at + 1);
      if (!value || /Max-Age=0/i.test(cookie)) jar.delete(name);
      else jar.set(name, value);
    }
    return response;
  }) as typeof fetch;

  const quiet = { channel: () => undefined, onVisible: () => undefined };
  const clients = {
    browser: () =>
      createExwaveAuth({
        publishableKey: mock.publishableKey,
        storage: memoryStorage(),
        autoRefresh: false,
        fetch: api,
        runtime: { now },
      }),
    route: (initialState?: Parameters<typeof createExwaveRouteClient>[0]) =>
      createExwaveRouteClient({
        fetch: app,
        ...initialState,
        runtime: { now, ...quiet },
      }),
  };
  return {
    clock,
    mock,
    failing,
    calls: (path: string) => calls.get(path) ?? 0,
    jar,
    clients,
    server,
    appRequests: () => appRequests,
    /** Where each client's email links land. */
    linkBase: { browser: "http://localhost:5173", route: APP },
  };
}
