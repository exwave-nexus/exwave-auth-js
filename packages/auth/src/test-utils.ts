// Test doubles: a fake clock, Web Locks, BroadcastChannel and shared storage,
// so one process can play several browser tabs.
import type { ExwaveRuntime } from "./client";
import { encodePublishableKey } from "./publishable-key";
import type { ApiPlayer, ApiTokens } from "./types";

export const PLATFORM_ID = "6f1c2a10-5a3e-4c2b-9d4e-0a1b2c3d4e5f";
export const AUTH_ORIGIN = "https://auth.example.test";
export const PUBLISHABLE_KEY = encodePublishableKey({
  authOrigin: AUTH_ORIGIN,
  platformId: PLATFORM_ID,
});
export const PLAYER: ApiPlayer = {
  id: "8b7f6d0e-1111-4222-8333-944455556666",
  user_id: "312345678901234567",
  email: "player@example.com",
  email_verified: true,
  display_name: "Test Player",
  username: "player1",
};

/** Lets queued microtasks and immediates run. */
export async function flush(rounds = 20) {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setImmediate(r));
}

export class FakeClock {
  current = Date.UTC(2026, 10, 18, 12, 0, 0);
  private timers: { id: number; at: number; fn: () => void }[] = [];
  private nextId = 1;

  now = () => this.current;
  setTimeout = (fn: () => void, ms: number) => {
    const id = this.nextId++;
    this.timers.push({ id, at: this.current + ms, fn });
    return id;
  };
  clearTimeout = (id: unknown) => {
    this.timers = this.timers.filter((t) => t.id !== id);
  };
  /** Milliseconds until the next timer, or `null`. */
  nextTimerIn(): number | null {
    const at = Math.min(...this.timers.map((t) => t.at));
    return Number.isFinite(at) ? at - this.current : null;
  }
  /** Moves time forward, firing due timers in order and letting their work finish. */
  async advance(ms: number) {
    const end = this.current + ms;
    for (;;) {
      await flush();
      const due = this.timers
        .filter((t) => t.at <= end)
        .sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.timers = this.timers.filter((t) => t !== due);
      this.current = due.at;
      due.fn();
    }
    this.current = end;
    await flush();
  }
}

/** One Web Locks manager shared by every "tab". */
export class FakeLocks {
  requests = 0;
  private tails = new Map<string, Promise<unknown>>();
  request<T>(name: string, callback: () => Promise<T>): Promise<T> {
    this.requests++;
    const previous = this.tails.get(name) ?? Promise.resolve();
    const run = previous.then(() => callback());
    this.tails.set(
      name,
      run.catch(() => undefined),
    );
    return run;
  }
}

/** BroadcastChannel semantics: a message reaches every other channel of that name. */
export class ChannelHub {
  private channels = new Set<FakeChannel>();
  open(name: string): FakeChannel {
    const channel = new FakeChannel(name, this.channels);
    this.channels.add(channel);
    return channel;
  }
}

class FakeChannel {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(
    readonly name: string,
    private peers: Set<FakeChannel>,
  ) {}
  postMessage(message: unknown) {
    const data = structuredClone(message);
    for (const peer of this.peers)
      if (peer !== this && peer.name === this.name)
        queueMicrotask(() => peer.onmessage?.({ data }));
  }
  close() {
    this.peers.delete(this);
  }
}

/** localStorage shared by tabs, firing `storage` events in the other tabs only. */
export class SharedStorage {
  items = new Map<string, string>();
  private listeners = new Map<
    number,
    (key: string | null, value: string | null) => void
  >();
  private tabs = 0;

  tab() {
    const id = this.tabs++;
    const notify = (key: string, value: string | null) => {
      for (const [tab, listener] of this.listeners)
        if (tab !== id) queueMicrotask(() => listener(key, value));
    };
    return {
      adapter: {
        getItem: (key: string) => this.items.get(key) ?? null,
        setItem: (key: string, value: string) => {
          this.items.set(key, value);
          notify(key, value);
        },
        removeItem: (key: string) => {
          this.items.delete(key);
          notify(key, null);
        },
      },
      onStorageChange: (
        listener: (key: string | null, value: string | null) => void,
      ) => {
        this.listeners.set(id, listener);
        return () => this.listeners.delete(id);
      },
    };
  }
}

export function fakeJwt(claims: Record<string, unknown>): string {
  const part = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "EdDSA", typ: "JWT" })}.${part(claims)}.c2lnbmF0dXJl`;
}

type Handler = (body: Record<string, unknown>) => Response | Promise<Response>;

/** A scripted player API behind a fetch function. */
export function fakeApi(clock: FakeClock) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const handlers = new Map<string, Handler>();
  let issued = 0;
  let gate: Promise<void> | null = null;

  function tokens(
    refreshToken: string | null = `exw_rt_${issued + 1}`,
  ): ApiTokens {
    issued++;
    const iat = Math.floor(clock.now() / 1000);
    return {
      access_token: fakeJwt({
        iss: "exwave-auth",
        aud: "exwave-player-services",
        sub: `managed:${PLATFORM_ID}:${PLAYER.user_id}`,
        project_id: PLATFORM_ID,
        iat,
        exp: iat + 900,
        n: issued,
      }),
      token_type: "Bearer",
      expires_in: 900,
      refresh_token: refreshToken,
      player: PLAYER,
    };
  }

  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path =
      url.pathname.split(`/platforms/${PLATFORM_ID}/`)[1] ?? url.pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ path, body });
    if (gate) await gate;
    const handler = handlers.get(path);
    if (handler) return handler(body);
    switch (path) {
      case "players/sign-in":
      case "players/verify-email":
      case "players/password-reset/confirm":
      case "players/token/refresh":
        return Response.json(tokens());
      case "players/sign-out":
        return new Response(null, { status: 204 });
      case "players/me":
        return Response.json({ player: PLAYER });
      default:
        return Response.json({ error: "not_found" }, { status: 404 });
    }
  }) as typeof globalThis.fetch;

  return {
    fetch,
    calls,
    handlers,
    tokens,
    count: (path: string) => calls.filter((c) => c.path === path).length,
    /** Holds every response until the returned function is called. */
    hold() {
      let release = () => {};
      gate = new Promise<void>((resolve) => {
        release = () => {
          gate = null;
          resolve();
        };
      });
      return release;
    },
  };
}

export function runtime(
  clock: FakeClock,
  extra: Partial<ExwaveRuntime> = {},
): Partial<ExwaveRuntime> {
  return {
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    locks: undefined,
    channel: () => undefined,
    onStorageChange: () => undefined,
    onVisible: () => undefined,
    ...extra,
  };
}
