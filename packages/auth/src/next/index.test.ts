import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { createMockAuth } from "../../../../scripts/mock-auth";
import { createExwaveNext } from "./index";

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
