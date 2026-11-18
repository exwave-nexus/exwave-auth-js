import { describe, expect, test } from "bun:test";
import {
  type AuthChangeEvent,
  createExwaveAuth,
  type ExwaveAuthOptions,
  type SignOutReason,
} from "./client";
import { ExwaveAuthError } from "./errors";
import { memoryStorage, type StorageAdapter } from "./storage";
import {
  ChannelHub,
  FakeClock,
  FakeLocks,
  fakeApi,
  flush,
  PLATFORM_ID,
  PUBLISHABLE_KEY,
  runtime,
  SharedStorage,
} from "./test-utils";
import type { Session } from "./types";

const KEY = `exwave.auth.${PLATFORM_ID}`;
const SIGN_IN = { login: "player1", password: "Password123!" };

function setup(options: Partial<ExwaveAuthOptions> = {}) {
  const clock = new FakeClock();
  const api = fakeApi(clock);
  const storage = memoryStorage();
  const auth = createExwaveAuth({
    publishableKey: PUBLISHABLE_KEY,
    storage,
    fetch: api.fetch,
    runtime: runtime(clock),
    ...options,
  });
  return { clock, api, storage, auth };
}

function record(auth: ReturnType<typeof createExwaveAuth>) {
  const events: {
    event: AuthChangeEvent;
    session: Session | null;
    reason?: SignOutReason;
  }[] = [];
  auth.onAuthStateChange((event, session, info) =>
    events.push({ event, session, reason: info.reason }),
  );
  return events;
}

const stored = async (storage: StorageAdapter) =>
  JSON.parse((await storage.getItem(KEY)) ?? "null") as {
    refreshToken: string;
  } | null;

describe("refresh scheduling", () => {
  test("refreshes 60 s before the PAT expires, then again for the next one", async () => {
    const { clock, api, auth } = setup();
    const events = record(auth);
    const first = await auth.signIn(SIGN_IN);
    expect(clock.nextTimerIn()).toBe(840_000);

    await clock.advance(839_999);
    expect(api.count("players/token/refresh")).toBe(0);
    await clock.advance(1);
    expect(api.count("players/token/refresh")).toBe(1);
    expect(api.calls.at(-1)?.body).toEqual({ refresh_token: "exw_rt_1" });

    const second = await auth.getSession();
    expect(second?.accessToken).not.toBe(first.accessToken);
    expect(second?.expiresAt).toBe(clock.now() + 900_000);
    expect(clock.nextTimerIn()).toBe(840_000);
    expect(events.map((e) => e.event)).toEqual([
      "INITIAL_SESSION",
      "SIGNED_IN",
      "TOKEN_REFRESHED",
    ]);

    await clock.advance(840_000);
    expect(api.count("players/token/refresh")).toBe(2);
    expect(api.calls.at(-1)?.body).toEqual({ refresh_token: "exw_rt_2" });
  });

  test("getPlayerAccessToken reuses a fresh PAT and refreshes inside the last minute", async () => {
    const { clock, api, auth } = setup({ autoRefresh: false });
    const session = await auth.signIn(SIGN_IN);
    clock.current += 839_000;
    expect(await auth.getPlayerAccessToken()).toBe(session.accessToken);
    expect(api.count("players/token/refresh")).toBe(0);

    clock.current += 1_000;
    const next = await auth.getPlayerAccessToken();
    expect(next).not.toBe(session.accessToken);
    expect(api.count("players/token/refresh")).toBe(1);
  });

  test("returns null when signed out, without calling the API", async () => {
    const { api, auth } = setup();
    expect(await auth.getPlayerAccessToken()).toBeNull();
    expect(api.calls).toHaveLength(0);
  });

  test("restores a stored session on load with one refresh", async () => {
    const { clock, api, storage } = setup();
    await storage.setItem(
      KEY,
      JSON.stringify({ refreshToken: "exw_rt_saved", player: { id: "p" } }),
    );
    const auth = createExwaveAuth({
      publishableKey: PUBLISHABLE_KEY,
      storage,
      fetch: api.fetch,
      runtime: runtime(clock),
    });
    const events = record(auth);
    await flush();
    expect(api.calls).toEqual([
      {
        path: "players/token/refresh",
        body: { refresh_token: "exw_rt_saved" },
      },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toBe("INITIAL_SESSION");
    expect(events[0]?.session?.accessToken).toBeString();
    expect((await stored(storage))?.refreshToken).toBe("exw_rt_1");
  });

  test("a failed refresh for a passing reason keeps a PAT that still works, then retries", async () => {
    const { clock, api, auth } = setup();
    const session = await auth.signIn(SIGN_IN);
    api.handlers.set("players/token/refresh", () => {
      throw new TypeError("offline");
    });
    await clock.advance(840_000);
    expect(api.count("players/token/refresh")).toBe(1);
    expect(await auth.getPlayerAccessToken()).toBe(session.accessToken);
    expect(api.count("players/token/refresh")).toBe(2);

    api.handlers.delete("players/token/refresh");
    await clock.advance(10_000);
    expect(api.count("players/token/refresh")).toBe(3);
    expect(await auth.getPlayerAccessToken()).not.toBe(session.accessToken);
  });
});

describe("single-flight refresh", () => {
  test("concurrent callers in one tab share one refresh", async () => {
    const { clock, api, auth } = setup({ autoRefresh: false });
    await auth.signIn(SIGN_IN);
    clock.current += 850_000;
    const release = api.hold();
    const pending = Promise.all([
      auth.getPlayerAccessToken(),
      auth.getPlayerAccessToken(),
      auth.getPlayerAccessToken(),
    ]);
    await flush();
    release();
    const tokens = await pending;
    expect(api.count("players/token/refresh")).toBe(1);
    expect(new Set(tokens).size).toBe(1);
  });

  test("two tabs share one refresh through Web Locks and BroadcastChannel", async () => {
    const clock = new FakeClock();
    const api = fakeApi(clock);
    const locks = new FakeLocks();
    const hub = new ChannelHub();
    const shared = new SharedStorage();
    const tab = () => {
      const { adapter, onStorageChange } = shared.tab();
      return createExwaveAuth({
        publishableKey: PUBLISHABLE_KEY,
        storage: adapter,
        multiTab: true,
        autoRefresh: false,
        fetch: api.fetch,
        runtime: runtime(clock, {
          locks,
          channel: (name) => hub.open(name),
          onStorageChange,
        }),
      });
    };
    const a = tab();
    const b = tab();
    await a.signIn(SIGN_IN);
    await flush();
    expect((await b.getSession())?.player.email).toBe("player@example.com");

    clock.current += 850_000;
    const release = api.hold();
    const pending = Promise.all([
      a.getPlayerAccessToken(),
      b.getPlayerAccessToken(),
    ]);
    await flush();
    release();
    const [fromA, fromB] = await pending;
    expect(api.count("players/token/refresh")).toBe(1);
    expect(fromB).toBe(fromA);
    expect(locks.requests).toBeGreaterThanOrEqual(2);
  });

  test("a grace-window answer (refresh_token null) keeps the stored token", async () => {
    const { clock, api, auth, storage } = setup({ autoRefresh: false });
    await auth.signIn(SIGN_IN);
    api.handlers.set("players/token/refresh", () =>
      Response.json(api.tokens(null)),
    );
    clock.current += 850_000;
    const token = await auth.getPlayerAccessToken();
    expect(token).toBeString();
    expect((await stored(storage))?.refreshToken).toBe("exw_rt_1");
  });
});

describe("ended sessions", () => {
  for (const [code, status] of [
    ["invalid_refresh_token", 401],
    ["player_locked", 403],
  ] as const)
    test(`${code} signs the player out with that reason`, async () => {
      const { clock, api, auth, storage } = setup({ autoRefresh: false });
      const events = record(auth);
      await auth.signIn(SIGN_IN);
      api.handlers.set("players/token/refresh", () =>
        Response.json({ error: code }, { status }),
      );
      clock.current += 900_000;
      const failure = await auth.getPlayerAccessToken().catch((e) => e);
      expect(failure).toBeInstanceOf(ExwaveAuthError);
      expect(failure.code).toBe(code);
      expect(failure.status).toBe(status);
      expect(await auth.getSession()).toBeNull();
      expect(await storage.getItem(KEY)).toBeNull();
      expect(events.at(-1)).toEqual({
        event: "SIGNED_OUT",
        session: null,
        reason: code,
      });
    });
});

describe("cross-tab events", () => {
  function tabs(withChannel: boolean) {
    const clock = new FakeClock();
    const api = fakeApi(clock);
    const hub = new ChannelHub();
    const shared = new SharedStorage();
    const tab = () => {
      const { adapter, onStorageChange } = shared.tab();
      return createExwaveAuth({
        publishableKey: PUBLISHABLE_KEY,
        storage: adapter,
        multiTab: true,
        fetch: api.fetch,
        runtime: runtime(clock, {
          locks: new FakeLocks(),
          channel: (name) => (withChannel ? hub.open(name) : undefined),
          onStorageChange,
        }),
      });
    };
    return { clock, api, a: tab(), b: tab() };
  }

  test("signing out in one tab signs out the other (BroadcastChannel)", async () => {
    const { api, a, b } = tabs(true);
    const events = record(b);
    await a.signIn(SIGN_IN);
    await flush();
    expect(events.map((e) => e.event)).toEqual([
      "INITIAL_SESSION",
      "SIGNED_IN",
    ]);
    expect(events[1]?.session?.accessToken).toBeString();

    await a.signOut();
    await flush();
    expect(events.at(-1)).toEqual({
      event: "SIGNED_OUT",
      session: null,
      reason: "signed_out",
    });
    expect(await b.getSession()).toBeNull();
    expect(api.calls.at(-1)).toEqual({
      path: "players/sign-out",
      body: { refresh_token: "exw_rt_1", everywhere: false },
    });
  });

  test("storage events alone keep tabs in sync", async () => {
    const { a, b } = tabs(false);
    const events = record(b);
    await a.signIn(SIGN_IN);
    await flush();
    expect(events.map((e) => e.event)).toContain("SIGNED_IN");
    // B learned of the session from storage and fetched its own PAT.
    expect(await b.getPlayerAccessToken()).toBeString();

    await a.signOut();
    await flush();
    expect(events.at(-1)?.event).toBe("SIGNED_OUT");
    expect(await b.getSession()).toBeNull();
  });

  test("a refresh in one tab hands the new PAT to the other", async () => {
    const { clock, api, a, b } = tabs(true);
    await a.signIn(SIGN_IN);
    await flush();
    await clock.advance(840_000);
    // Both tabs' timers fired; one refreshed and the other adopted its PAT.
    expect(api.count("players/token/refresh")).toBe(1);
    expect(await b.getPlayerAccessToken()).toBe(await a.getPlayerAccessToken());
  });
});

describe("calls and errors", () => {
  test("errors carry the API code, the status and Retry-After", async () => {
    const { api, auth } = setup();
    api.handlers.set("players/sign-in", () =>
      Response.json(
        { error: "rate_limited" },
        { status: 429, headers: { "retry-after": "42" } },
      ),
    );
    const failure = await auth.signIn(SIGN_IN).catch((e) => e);
    expect(failure).toBeInstanceOf(ExwaveAuthError);
    expect(failure).toMatchObject({
      code: "rate_limited",
      status: 429,
      retryAfter: 42,
    });
  });

  test("an unreachable API is network_error", async () => {
    const { api, auth } = setup();
    api.handlers.set("players/sign-in", () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await auth.signIn(SIGN_IN).catch((e) => e.code)).toBe(
      "network_error",
    );
  });

  test("sign-up sends the API's snake_case body", async () => {
    const { api, auth } = setup();
    api.handlers.set("players/sign-up", () =>
      Response.json(
        { user_id: "42", verification: "email_sent" },
        { status: 201 },
      ),
    );
    const result = await auth.signUp({
      email: "new@example.com",
      password: "Password123!",
      displayName: "New",
      redirectTo: "http://localhost:5173/verify",
    });
    expect(result).toEqual({ userId: "42", verification: "email_sent" });
    expect(api.calls[0]?.body).toEqual({
      email: "new@example.com",
      password: "Password123!",
      display_name: "New",
      redirect_to: "http://localhost:5173/verify",
    });
  });

  test("handleEmailLink verifies a code once, even when called twice", async () => {
    const { api, auth } = setup();
    const url = "http://localhost:5173/verify?exwave_verify=ABC123&uid=42";
    const [first, second] = await Promise.all([
      auth.handleEmailLink(url),
      auth.handleEmailLink(url),
    ]);
    expect(api.count("players/verify-email")).toBe(1);
    expect(api.calls[0]?.body).toEqual({ user_id: "42", code: "ABC123" });
    expect(first?.type).toBe("email_verified");
    expect(second).toEqual(first);
  });

  test("handleEmailLink returns a reset code without calling the API", async () => {
    const { api, auth } = setup();
    const link = await auth.handleEmailLink(
      "http://localhost:5173/reset-password?exwave_reset=XYZ&uid=42",
    );
    expect(link).toEqual({ type: "password_reset", userId: "42", code: "XYZ" });
    expect(await auth.handleEmailLink("http://localhost:5173/")).toBeNull();
    expect(api.calls).toHaveLength(0);
  });

  test("signing in again revokes the previous refresh token", async () => {
    const { api, auth } = setup();
    await auth.signIn(SIGN_IN);
    await auth.signIn(SIGN_IN);
    await flush();
    expect(api.calls.find((c) => c.path === "players/sign-out")?.body).toEqual({
      refresh_token: "exw_rt_1",
      everywhere: false,
    });
  });

  test("sign out everywhere reports a failure but still signs out here", async () => {
    const { api, auth } = setup();
    await auth.signIn(SIGN_IN);
    api.handlers.set("players/sign-out", () =>
      Response.json({ error: "unavailable" }, { status: 503 }),
    );
    const failure = await auth.signOut({ everywhere: true }).catch((e) => e);
    expect(failure.code).toBe("unavailable");
    expect(api.calls.at(-1)?.body).toEqual({
      refresh_token: "exw_rt_1",
      everywhere: true,
    });
    expect(await auth.getSession()).toBeNull();
  });

  test("getPlayer calls players/me with the PAT", async () => {
    const { api, auth } = setup();
    const session = await auth.signIn(SIGN_IN);
    const player = await auth.getPlayer();
    expect(player.userId).toBe("312345678901234567");
    expect(api.calls.at(-1)?.path).toBe("players/me");
    expect(session.player).toEqual(player);
  });
});
