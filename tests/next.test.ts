import { describe, expect, test } from "bun:test";
import { createExwaveNext } from "@exwave-nexus/auth/next";
import { createMockAuth } from "@exwave-nexus/auth-mock";
import { NextRequest } from "next/server";

const APP = "http://localhost:3000";
const SECRET = "mock-test-cookie-secret-32-chars!!";
const PLAYER = { login: "player1", password: "Password123!" };

async function setup() {
  const clock = { now: Date.now() };
  const now = () => clock.now;
  const mock = await createMockAuth({ now, log: () => {} });
  return { clock, now, mock, fetch: mock.fetcher() };
}

describe("Next.js proxy helper", () => {
  test("refreshes a near-expiry session and forwards it to the render", async () => {
    const { mock, fetch, clock, now } = await setup();
    const exwave = createExwaveNext({
      publishableKey: mock.publishableKey,
      cookieSecret: SECRET,
      fetch,
      now,
    });
    const session = await exwave.server.signIn(PLAYER);
    const sealed = await exwave.server.seal(session);
    const page = () =>
      new NextRequest(`${APP}/account`, {
        headers: { cookie: `exwave_session=${sealed}` },
      });

    const fresh = await exwave.proxy(page());
    expect(fresh.headers.get("set-cookie")).toBeNull();

    clock.now += 850_000;
    const refreshed = await exwave.proxy(page());
    const written = refreshed.cookies.get("exwave_session");
    expect(written?.value).toBeString();
    expect(written?.httpOnly).toBe(true);
    const next = await exwave.server.unseal(written?.value);
    expect(next?.refreshToken).not.toBe(session.refreshToken);
    // The render sees the new cookie through the overridden request headers.
    expect(refreshed.headers.get("x-middleware-request-cookie")).toContain(
      written?.value ?? "missing",
    );
  });

  test("a locked player loses the cookie and the render learns why", async () => {
    const { mock, fetch, clock, now } = await setup();
    const exwave = createExwaveNext({
      publishableKey: mock.publishableKey,
      cookieSecret: SECRET,
      fetch,
      now,
    });
    const sealed = await exwave.server.seal(await exwave.server.signIn(PLAYER));
    await mock.lock("player1");
    clock.now += 850_000;
    const response = await exwave.proxy(
      new NextRequest(`${APP}/account`, {
        headers: { cookie: `exwave_session=${sealed}` },
      }),
    );
    expect(response.headers.getSetCookie()).toEqual([
      expect.stringMatching(/^exwave_session=; Path=\/; Expires=/),
      expect.stringMatching(
        /^exwave_session_signed_out=account_locked; Path=\/; Expires=[^;]+; Max-Age=300; HttpOnly; SameSite=lax$/,
      ),
    ]);
    // This render sees the reason (for a sign-in page) and no session.
    const forwarded = response.headers.get("x-middleware-request-cookie") ?? "";
    expect(forwarded).toContain("exwave_session_signed_out=account_locked");
    expect(forwarded).not.toContain(sealed);
  });

  test("drops a cookie it cannot open", async () => {
    const { mock, fetch } = await setup();
    const exwave = createExwaveNext({
      publishableKey: mock.publishableKey,
      cookieSecret: SECRET,
      fetch,
    });
    const response = await exwave.proxy(
      new NextRequest(`${APP}/`, {
        headers: { cookie: "exwave_session=garbage" },
      }),
    );
    expect(response.headers.get("set-cookie")).toContain("exwave_session=;");
  });
});
