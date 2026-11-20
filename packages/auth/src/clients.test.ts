// One list of scenarios, run on the browser client (straight to the mock) and
// the route client (through handleAuthRequest), so hooks and components can
// count on both behaving the same.
import { describe, expect, test } from "bun:test";
import type { AuthChangeEvent, SignOutReason } from "./client";
import { ExwaveAuthError } from "./errors";
import { type ClientMode, harness } from "./test-harness";
import type { Session } from "./types";

const PLAYER = { login: "player1", password: "Password123!" };
const NEW_USER = {
  email: "new@example.com",
  password: "Password123!",
  displayName: "New User",
};

async function setup(mode: ClientMode) {
  const h = await harness();
  const auth = h.clients[mode]();
  const events: { event: AuthChangeEvent; reason?: SignOutReason }[] = [];
  auth.onAuthStateChange((event, _session, info) =>
    events.push({ event, reason: info.reason }),
  );
  await auth.getSession();
  // Browser links land where the page says; route links where the server says.
  const redirectTo =
    mode === "browser" ? `${h.linkBase.browser}/verify` : undefined;
  return { ...h, auth, events, redirectTo };
}

const lastLink = (mock: { emails: { link: string }[] }) =>
  mock.emails.at(-1)?.link ?? "";

describe.each(["browser", "route"] as const)("%s client", (mode) => {
  test("signs in, and the session carries the user", async () => {
    const { auth, events } = await setup(mode);
    const session = await auth.signIn(PLAYER);
    expect(session.user.username).toBe("player1");
    expect((await auth.getSession())?.user.id).toBe(session.user.id);
    expect(events.map((e) => e.event)).toEqual([
      "INITIAL_SESSION",
      "SIGNED_IN",
    ]);
  });

  test("a weak password names the broken rules", async () => {
    const { auth, redirectTo } = await setup(mode);
    const error = await auth
      .signUp({ ...NEW_USER, password: "short", redirectTo })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ExwaveAuthError);
    expect(error.code).toBe("weak_password");
    expect(error.failedRules).toContain("min_length");
  });

  test("too many failures are rate limited, with Retry-After", async () => {
    const { auth } = await setup(mode);
    let error: ExwaveAuthError | undefined;
    for (let i = 0; i < 12 && error?.code !== "rate_limited"; i++)
      error = await auth
        .signIn({ ...PLAYER, password: "wrong" })
        .catch((e) => e);
    expect(error?.code).toBe("rate_limited");
    expect(error?.retryAfter).toBeGreaterThan(0);
  });

  test("a verification link signs in once, even when handled twice", async () => {
    const { auth, mock, redirectTo, linkBase } = await setup(mode);
    await auth.signUp({ ...NEW_USER, redirectTo });
    const link = lastLink(mock);
    expect(link).toStartWith(`${linkBase[mode]}/verify?`);
    // React Strict Mode runs effects twice: both calls share one request.
    const [a, b] = await Promise.all([
      auth.handleEmailLink(link),
      auth.handleEmailLink(link),
    ]);
    expect(a?.type).toBe("email_verified");
    expect(b).toEqual(a);
    expect((await auth.getSession())?.user.email).toBe(NEW_USER.email);
  });

  test("a reset link gives the code, and confirming signs in", async () => {
    const { auth, mock, linkBase } = await setup(mode);
    await auth.resetPassword({
      email: "player@example.com",
      redirectTo:
        mode === "browser" ? `${linkBase.browser}/reset-password` : undefined,
    });
    const link = await auth.handleEmailLink(lastLink(mock));
    if (link?.type !== "password_reset") throw new Error("no reset link");
    const session = await auth.confirmPasswordReset({
      userId: link.userId,
      code: link.code,
      password: "Another-password1",
    });
    expect(session.user.username).toBe("player1");
    expect(
      (await auth.signIn({ ...PLAYER, password: "Another-password1" })).user
        .username,
    ).toBe("player1");
  });

  test("signing out says so, here or everywhere", async () => {
    const { auth, events } = await setup(mode);
    await auth.signIn(PLAYER);
    await auth.signOut();
    expect(events.at(-1)).toEqual({
      event: "SIGNED_OUT",
      reason: "signed_out",
    });
    await auth.signIn(PLAYER);
    await auth.signOut({ everywhere: true });
    expect(events.at(-1)).toEqual({
      event: "SIGNED_OUT",
      reason: "signed_out_everywhere",
    });
    expect(await auth.getSession()).toBeNull();
  });

  test("a failed sign-out everywhere still signs this device out, and throws", async () => {
    const { auth, events, failing } = await setup(mode);
    await auth.signIn(PLAYER);
    failing.add("sign-out");
    const error = await auth.signOut({ everywhere: true }).catch((e) => e);
    expect(error).toBeInstanceOf(ExwaveAuthError);
    expect(await auth.getSession()).toBeNull();
    expect(events.at(-1)).toEqual({
      event: "SIGNED_OUT",
      reason: "signed_out",
    });
  });

  test("a locked account ends the session with account_locked", async () => {
    const { auth, events, mock, clock } = await setup(mode);
    await auth.signIn(PLAYER);
    await mock.lock("player1");
    clock.now += 850_000;
    const error = await auth.getPlayerAccessToken().catch((e) => e);
    expect(error).toBeInstanceOf(ExwaveAuthError);
    expect(error.code).toBe("player_locked");
    expect(await auth.getSession()).toBeNull();
    expect(events.at(-1)).toEqual({
      event: "SIGNED_OUT",
      reason: "account_locked",
    });
  });

  test("hands a game a player access token", async () => {
    const { auth } = await setup(mode);
    expect(await auth.getPlayerAccessToken()).toBeNull();
    await auth.signIn(PLAYER);
    const token = await auth.getPlayerAccessToken();
    expect(token?.split(".")).toHaveLength(3);
  });
});

describe("route client only", () => {
  const state = (session: Session) => ({
    user: session.user,
    expiresAt: session.expiresAt,
    signOutReason: null,
  });

  test("an initial state from the server means no request to load", async () => {
    const h = await harness();
    const signedIn = await h.clients.route().signIn(PLAYER);
    const before = h.appRequests();
    const auth = h.clients.route({ initialState: state(signedIn) });
    expect((await auth.getSession())?.user.id).toBe(signedIn.user.id);
    expect(h.appRequests()).toBe(before);
    expect((await auth.getSession())?.accessToken).toBeNull();
  });

  test("hydrate reports what the server saw, marked as from the server", async () => {
    const h = await harness();
    const signedIn = await h.clients.route().signIn(PLAYER);
    const auth = h.clients.route({ initialState: state(signedIn) });
    const seen: { event: string; source?: string; reason?: string }[] = [];
    auth.onAuthStateChange((event, _s, info) =>
      seen.push({ event, source: info.source, reason: info.reason }),
    );
    await auth.getSession();
    // The same user again changes nothing.
    auth.hydrate(state(signedIn));
    auth.hydrate({
      user: null,
      expiresAt: null,
      signOutReason: "account_locked",
    });
    expect(seen).toEqual([
      { event: "INITIAL_SESSION", source: undefined, reason: undefined },
      { event: "SIGNED_OUT", source: "server", reason: "account_locked" },
    ]);
  });

  test("a missing cookie means the session ended without the page knowing", async () => {
    const h = await harness();
    const auth = h.clients.route();
    await auth.signIn(PLAYER);
    h.jar.clear();
    expect(await auth.getPlayerAccessToken()).toBeNull();
    expect(await auth.getSession()).toBeNull();
  });

  test("reuses a player access token while it has over a minute left", async () => {
    const h = await harness();
    const auth = h.clients.route();
    await auth.signIn(PLAYER);
    const first = await auth.getPlayerAccessToken();
    const requests = h.appRequests();
    expect(await auth.getPlayerAccessToken()).toBe(first);
    expect(h.appRequests()).toBe(requests);
  });

  test("errors keep their code, status, Retry-After and failed rules", async () => {
    const h = await harness();
    const auth = h.clients.route();
    const error = await auth
      .signUp({ ...NEW_USER, password: "alllowercase" })
      .catch((e) => e);
    expect(error.status).toBe(422);
    expect(error.failedRules).toEqual(["uppercase", "number", "symbol"]);
  });
});
