// The provider and hooks in a DOM (happy-dom), against both clients. The DOM
// is registered for this file only: other suites rely on there being none.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { ReactNode } from "react";
import { type ClientMode, harness } from "../test-harness";
import type { AuthState } from "../types";
import type { ExwaveClient, ExwaveProviderProps } from "./provider";

type Rtl = typeof import("@testing-library/react");
let rtl: Rtl;
let react: typeof import("./index");

beforeAll(async () => {
  // Keep the runtime's fetch: happy-dom's drops the Cookie and Sec-Fetch-Site
  // headers the harness plays the browser with.
  const { fetch, Request, Response, Headers } = globalThis;
  GlobalRegistrator.register({ url: "http://localhost:3000/" });
  Object.assign(globalThis, { fetch, Request, Response, Headers });
  process.env.RTL_SKIP_AUTO_CLEANUP = "true";
  // After the DOM exists: react-dom checks for it when it loads.
  rtl = await import("@testing-library/react");
  react = await import("./index");
});
afterEach(() => rtl.cleanup());
afterAll(async () => {
  // Let React's scheduler finish before the DOM goes away.
  await new Promise((resolve) => setTimeout(resolve, 20));
  await GlobalRegistrator.unregister();
});

const PLAYER = { login: "player1", password: "Password123!" };

function wrapper(
  client: ExwaveClient,
  props: Partial<ExwaveProviderProps> = {},
) {
  return ({ children }: { children: ReactNode }) => (
    <react.ExwaveProvider client={client} {...(props as object)}>
      {children}
    </react.ExwaveProvider>
  );
}

describe.each(["browser", "route"] as const)(
  "hooks with the %s client",
  (mode: ClientMode) => {
    test("useSignIn: a readable error, then the signed-in user", async () => {
      const h = await harness();
      const client = h.clients[mode]();
      const { result } = rtl.renderHook(
        () => ({ signIn: react.useSignIn(), exwave: react.useExwave() }),
        { wrapper: wrapper(client) },
      );
      await rtl.waitFor(() =>
        expect(result.current.exwave.isLoaded).toBe(true),
      );

      await rtl.act(() =>
        result.current.signIn.run({ ...PLAYER, password: "wrong" }),
      );
      expect(result.current.signIn.message).toBe(
        "Wrong email, username or password.",
      );

      await rtl.act(() => result.current.signIn.run(PLAYER));
      expect(result.current.signIn.error).toBeNull();
      expect(result.current.exwave.user?.username).toBe("player1");
    });

    test("useSignUp: form, then check your email, then resend", async () => {
      const h = await harness();
      const { result } = rtl.renderHook(() => react.useSignUp(), {
        wrapper: wrapper(h.clients[mode]()),
      });
      expect(result.current.step).toBe("form");
      await rtl.act(() =>
        result.current.signUp.run({
          email: "new@example.com",
          password: "Password123!",
          displayName: "New User",
        }),
      );
      expect(result.current.step).toBe("check_email");
      expect(result.current.email).toBe("new@example.com");
      await rtl.act(() => result.current.resend.run());
      expect(result.current.resend.sent).toBe(true);
      // Browser links land on this page's origin; route links where the server says.
      expect(h.mock.emails.at(-1)?.link).toStartWith(
        "http://localhost:3000/verify?",
      );
    });

    test("useEmailLink verifies once under Strict Mode", async () => {
      const h = await harness();
      const client = h.clients[mode]();
      await client.signUp({
        email: "new@example.com",
        password: "Password123!",
        displayName: "New User",
        redirectTo:
          mode === "browser" ? "http://localhost:3000/verify" : undefined,
      });
      const url = h.mock.emails.at(-1)?.link ?? "";
      const { result } = rtl.renderHook(() => react.useEmailLink({ url }), {
        wrapper: wrapper(client),
        reactStrictMode: true,
      });
      await rtl.waitFor(() => expect(result.current.status).toBe("verified"));
      expect(h.calls("verify-email")).toBe(1);
    });

    test("useSignOut ends the session", async () => {
      const h = await harness();
      const client = h.clients[mode]();
      await client.signIn(PLAYER);
      const { result } = rtl.renderHook(
        () => ({ signOut: react.useSignOut(), exwave: react.useExwave() }),
        { wrapper: wrapper(client) },
      );
      await rtl.waitFor(() =>
        expect(result.current.exwave.isSignedIn).toBe(true),
      );
      await rtl.act(() => result.current.signOut.run());
      expect(result.current.exwave.isSignedIn).toBe(false);
      expect(result.current.exwave.signOutReason).toBe("signed_out");
    });
  },
);

describe("provider", () => {
  const signedOut: AuthState = {
    user: null,
    expiresAt: null,
    signOutReason: null,
  };

  test("an initial state renders signed in at once, and server changes don't call onAuthChange", async () => {
    const h = await harness();
    const session = await h.clients.route().signIn(PLAYER);
    const initialState = {
      user: session.user,
      expiresAt: session.expiresAt,
      signOutReason: null,
    };
    const onAuthChange = mock();
    const client = h.clients.route({ initialState });
    const seen: boolean[] = [];
    const Probe = () => {
      const { isLoaded, isSignedIn } = react.useExwave();
      seen.push(isLoaded && isSignedIn);
      return null;
    };
    const view = rtl.render(
      <react.ExwaveProvider
        client={client}
        initialState={initialState}
        onAuthChange={onAuthChange}
      >
        <Probe />
      </react.ExwaveProvider>,
    );
    expect(seen[0]).toBe(true);

    // A server render says the session ended: take it, quietly.
    view.rerender(
      <react.ExwaveProvider
        client={client}
        initialState={{ ...signedOut, signOutReason: "account_locked" }}
        onAuthChange={onAuthChange}
      >
        <Probe />
      </react.ExwaveProvider>,
    );
    await rtl.waitFor(() => expect(seen.at(-1)).toBe(false));
    expect(onAuthChange).not.toHaveBeenCalled();

    // Signing in on the page does call it.
    await rtl.act(async () => {
      await client.signIn(PLAYER);
    });
    expect(onAuthChange).toHaveBeenCalledTimes(1);
    expect(onAuthChange.mock.calls[0]?.[0]).toBe("SIGNED_IN");
  });

  test("SignedIn and SignedOut render once the session is known", async () => {
    const h = await harness();
    const client = h.clients.route();
    const view = rtl.render(
      <react.ExwaveProvider client={client}>
        <react.SignedIn>in</react.SignedIn>
        <react.SignedOut>out</react.SignedOut>
      </react.ExwaveProvider>,
    );
    expect(view.container.textContent).toBe("");
    await rtl.waitFor(() => expect(view.container.textContent).toBe("out"));
    await rtl.act(async () => {
      await client.signIn(PLAYER);
    });
    expect(view.container.textContent).toBe("in");
  });

  test("useEmailLink takes the code out of the address bar", async () => {
    const h = await harness();
    const client = h.clients.route();
    await client.resetPassword({ email: "player@example.com" });
    const link = new URL(h.mock.emails.at(-1)?.link ?? "");
    history.replaceState(null, "", `${link.pathname}${link.search}`);
    const { result } = rtl.renderHook(() => react.useEmailLink(), {
      wrapper: wrapper(client),
      reactStrictMode: true,
    });
    await rtl.waitFor(() => expect(result.current.status).toBe("reset"));
    expect(location.search).toBe("");
    expect(location.pathname).toBe("/reset-password");
  });

  test("usePasswordCheck ticks off each rule of the policy", async () => {
    const h = await harness();
    const policy = {
      minLength: 10,
      requiresUppercase: true,
      requiresNumber: true,
    };
    const { result, rerender } = rtl.renderHook(
      ({ password }) => react.usePasswordCheck(password, policy),
      {
        wrapper: wrapper(h.clients.route()),
        initialProps: { password: "abc" },
      },
    );
    expect(result.current.valid).toBe(false);
    expect(result.current.rules).toEqual([
      { rule: "min_length", ok: false, label: "at least 10 characters" },
      { rule: "uppercase", ok: false, label: "an uppercase letter (A–Z)" },
      { rule: "number", ok: false, label: "a number (0–9)" },
    ]);
    rerender({ password: "Abcdefghij1" });
    expect(result.current.valid).toBe(true);
  });
});
