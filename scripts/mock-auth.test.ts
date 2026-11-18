// The library against the mock's in-memory player API: the contract end to
// end, for the browser client and the server route handler.
import { describe, expect, test } from "bun:test";
import { createLocalJWKSet } from "jose";
import { createExwaveAuth, memoryStorage } from "../packages/auth/src/index";
import {
  createExwaveServerAuth,
  handleAuthRequest,
  verifyPlayerAccessToken,
} from "../packages/auth/src/server/index";
import { createMockAuth, type MockAuth } from "./mock-auth";

const APP = "http://localhost:3000";
const SECRET = "mock-test-cookie-secret-32-chars!!";
const PLAYER = { login: "player1", password: "Password123!" };

async function setup() {
  const clock = { now: Date.now() };
  const now = () => clock.now;
  const mock = await createMockAuth({ now, log: () => {} });
  const fetch = mock.fetcher();
  const jwks = createLocalJWKSet(
    (await (await fetch(`${mock.origin}/orbit/v1/jwks`)).json()) as {
      keys: [];
    },
  );
  return { clock, now, mock, fetch, jwks };
}

const client = (
  mock: MockAuth,
  fetch: typeof globalThis.fetch,
  now: () => number = Date.now,
) =>
  createExwaveAuth({
    publishableKey: mock.publishableKey,
    storage: memoryStorage(),
    autoRefresh: false,
    fetch,
    runtime: { now },
  });

describe("browser client against the mock", () => {
  test("sign up, verify by email link, refresh, sign out", async () => {
    const { mock, fetch, jwks } = await setup();
    const auth = client(mock, fetch);
    const signUp = await auth.signUp({
      email: "new@example.com",
      password: "Password123!",
      displayName: "New Player",
      redirectTo: "http://localhost:5173/verify",
    });
    expect(signUp.verification).toBe("email_sent");
    expect(
      await auth
        .signIn({ login: "new@example.com", password: "Password123!" })
        .catch((e) => e.code),
    ).toBe("email_not_verified");

    const email = mock.emails.at(-1);
    expect(email?.link).toStartWith(
      "http://localhost:5173/verify?exwave_verify=",
    );
    const link = await auth.handleEmailLink(email?.link);
    if (link?.type !== "email_verified")
      throw new Error("expected a verified link");
    expect(link.session.player.emailVerified).toBe(true);

    const token = await auth.getPlayerAccessToken();
    const verified = await verifyPlayerAccessToken(token ?? "", {
      publishableKey: mock.publishableKey,
      jwks,
    });
    expect(verified.userId).toBe(signUp.userId);
    expect((await auth.getPlayer()).email).toBe("new@example.com");

    await auth.signOut();
    expect(await auth.getSession()).toBeNull();
  });

  test("error codes for wrong passwords, rate limits and taken emails", async () => {
    const { mock, fetch } = await setup();
    const auth = client(mock, fetch);
    const wrong = { login: "player1", password: "nope" };
    expect(await auth.signIn(wrong).catch((e) => e.code)).toBe(
      "invalid_credentials",
    );
    for (let i = 0; i < 9; i++) await auth.signIn(wrong).catch(() => {});
    const limited = await auth.signIn(PLAYER).catch((e) => e);
    expect(limited).toMatchObject({ code: "rate_limited", status: 429 });
    expect(limited.retryAfter).toBeGreaterThan(0);
    expect(
      await auth
        .signUp({
          email: "player@example.com",
          password: "Password123!",
          displayName: "X",
        })
        .catch((e) => e.code),
    ).toBe("email_taken");
    expect(
      await auth
        .signUp({
          email: "weak@example.com",
          password: "short",
          displayName: "X",
        })
        .catch((e) => e.code),
    ).toBe("weak_password");
  });

  test("locking the player fails the next refresh with player_locked", async () => {
    const { mock, fetch, clock, now } = await setup();
    const auth = client(mock, fetch, now);
    await auth.signIn(PLAYER);
    await mock.lock("player1");
    clock.now += 850_000;
    expect(await auth.getPlayerAccessToken().catch((e) => e.code)).toBe(
      "player_locked",
    );
    expect(await auth.getSession()).toBeNull();
  });

  test("password reset signs in and revokes the other sessions", async () => {
    const { mock, fetch, clock, now } = await setup();
    const other = client(mock, fetch, now);
    await other.signIn(PLAYER);
    const auth = client(mock, fetch, now);
    await auth.resetPassword({ email: "player@example.com" });
    const link = await auth.handleEmailLink(mock.emails.at(-1)?.link);
    if (link?.type !== "password_reset")
      throw new Error("expected a reset link");
    await auth.confirmPasswordReset({ ...link, password: "NewPassword456" });
    expect(await auth.getSession()).not.toBeNull();
    clock.now += 850_000;
    expect(await other.getPlayerAccessToken().catch((e) => e.code)).toBe(
      "invalid_refresh_token",
    );
  });
});

describe("refresh rotation in the mock", () => {
  test("replay inside 30 s gets a PAT and no token; after that it revokes the session", async () => {
    const { mock, fetch, clock } = await setup();
    const call = async (refresh_token: string) => {
      const response = await fetch(
        `${mock.origin}/orbit/v1/platforms/${mock.platformId}/players/token/refresh`,
        { method: "POST", body: JSON.stringify({ refresh_token }) },
      );
      return {
        status: response.status,
        body: (await response.json()) as Record<string, unknown>,
      };
    };
    const signIn = await fetch(
      `${mock.origin}/orbit/v1/platforms/${mock.platformId}/players/sign-in`,
      { method: "POST", body: JSON.stringify(PLAYER) },
    );
    const first = ((await signIn.json()) as { refresh_token: string })
      .refresh_token;
    const rotated = await call(first);
    expect(rotated.body.refresh_token).toStartWith("exw_rt_");

    clock.now += 29_000;
    const replay = await call(first);
    expect(replay.status).toBe(200);
    expect(replay.body.refresh_token).toBeNull();

    clock.now += 2_000;
    expect((await call(first)).body.error).toBe("invalid_refresh_token");
    // Reuse revoked the whole session, newest token included.
    expect((await call(String(rotated.body.refresh_token))).body.error).toBe(
      "invalid_refresh_token",
    );
  });
});

describe("server route handler against the mock", () => {
  async function server() {
    const ctx = await setup();
    const auth = createExwaveServerAuth({
      publishableKey: ctx.mock.publishableKey,
      cookieSecret: SECRET,
      fetch: ctx.fetch,
      now: ctx.now,
    });
    const request = (
      method: string,
      action: string,
      init: { body?: unknown; cookie?: string; site?: string | null } = {},
    ) => {
      const headers: Record<string, string> = {};
      if (init.site !== null)
        headers["sec-fetch-site"] = init.site ?? "same-origin";
      if (init.cookie) headers.cookie = init.cookie;
      return handleAuthRequest(
        auth,
        new Request(`${APP}/api/exwave/${action}`, {
          method,
          headers,
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
        }),
        action,
        { links: { verifyEmail: "/verify", resetPassword: "/reset-password" } },
      );
    };
    const signIn = async () => {
      const response = await request("POST", "sign-in", { body: PLAYER });
      return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    };
    return { ...ctx, auth, request, signIn };
  }

  test("sign-in sets an httpOnly cookie and never returns the refresh token", async () => {
    const { request } = await server();
    const response = await request("POST", "sign-in", { body: PLAYER });
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure"); // plain-HTTP localhost
    const text = await response.text();
    expect(text).not.toContain("exw_rt_");
    expect(JSON.parse(text).player.username).toBe("player1");
  });

  test("POSTs from another site are refused", async () => {
    const { request } = await server();
    expect(
      (await request("POST", "sign-in", { body: PLAYER, site: "cross-site" }))
        .status,
    ).toBe(403);
  });

  test("GET token needs Sec-Fetch-Site: same-origin and returns a PAT that verifies", async () => {
    const { request, signIn, mock, jwks } = await server();
    const cookie = await signIn();
    expect((await request("GET", "token", { cookie, site: null })).status).toBe(
      403,
    );
    expect(
      (await request("GET", "token", { cookie, site: "same-site" })).status,
    ).toBe(403);
    const response = await request("GET", "token", { cookie });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    expect(body.expires_in).toBeGreaterThan(800);
    const verified = await verifyPlayerAccessToken(body.access_token, {
      publishableKey: mock.publishableKey,
      jwks,
    });
    expect(verified.claims.sub).toStartWith(`managed:${mock.platformId}:`);
  });

  test("two requests refreshing at once: one rotates the cookie, the other only uses its PAT", async () => {
    const { request, signIn, clock } = await server();
    const cookie = await signIn();
    clock.now += 850_000;
    const [a, b] = await Promise.all([
      request("GET", "token", { cookie }),
      request("GET", "token", { cookie }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const written = [a, b].filter((r) => r.headers.get("set-cookie"));
    expect(written).toHaveLength(1);
  });

  test("a locked player's session cookie is cleared at the next refresh", async () => {
    const { request, signIn, clock, mock } = await server();
    const cookie = await signIn();
    await mock.lock("player1");
    clock.now += 850_000;
    const response = await request("GET", "token", { cookie });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "player_locked" });
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  test("sign out everywhere ends the player's other sessions", async () => {
    const { request, signIn, clock } = await server();
    const here = await signIn();
    const elsewhere = await signIn();
    const out = await request("POST", "sign-out", {
      cookie: here,
      body: { everywhere: true },
    });
    expect(out.status).toBe(204);
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0");
    clock.now += 850_000;
    const session = await request("GET", "session", { cookie: elsewhere });
    expect(await session.json()).toEqual({ player: null, expiresAt: null });
  });

  test("sign-up uses the app's verify page for the email link", async () => {
    const { request, mock } = await server();
    const response = await request("POST", "sign-up", {
      body: {
        email: "next@example.com",
        password: "Password123!",
        displayName: "Next",
      },
    });
    expect(response.status).toBe(201);
    expect(mock.emails.at(-1)?.link).toStartWith(
      `${APP}/verify?exwave_verify=`,
    );
  });
});
