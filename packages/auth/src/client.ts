import { createPlayerApi, toPlayer } from "./api";
import { ExwaveAuthError, isExwaveAuthError } from "./errors";
import { resolveStorage, type StorageOption } from "./storage";
import type {
  ApiTokens,
  CodeInput,
  EmailInput,
  EmailLink,
  PasswordResetConfirmInput,
  PlatformConfig,
  Player,
  Session,
  SignInInput,
  SignUpInput,
  SignUpResult,
} from "./types";

/** Refresh the PAT this long before it expires. */
export const REFRESH_MARGIN_MS = 60_000;
const RETRY_MS = 10_000;
const CONFIG_TTL_MS = 60_000;
const ENDS_SESSION = new Set(["invalid_refresh_token", "player_locked"]);

export type AuthChangeEvent =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED";

/** Why the player was signed out. */
export type SignOutReason =
  | "signed_out"
  | "invalid_refresh_token"
  | "player_locked";

export type AuthChangeListener = (
  event: AuthChangeEvent,
  session: Session | null,
  info: { reason?: SignOutReason },
) => void;

interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

interface ChannelLike {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  close(): void;
}

/** Platform hooks. Tests replace them; apps never need to. */
export interface ExwaveRuntime {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  locks: LockManagerLike | undefined;
  channel(name: string): ChannelLike | undefined;
  onStorageChange(
    callback: (key: string | null, value: string | null) => void,
  ): (() => void) | undefined;
  onVisible(callback: () => void): (() => void) | undefined;
}

export interface ExwaveAuthOptions {
  /** `exw_pk_…`, from Nexus → Managed auth. */
  publishableKey: string;
  /** Where the refresh token lives. Default `"local"`, or memory outside browsers. */
  storage?: StorageOption;
  /** Refresh the PAT in the background before it expires. Default `true`. */
  autoRefresh?: boolean;
  /** Share sign-in, sign-out and fresh PATs with other tabs. Default: on with `"local"` storage. */
  multiTab?: boolean;
  fetch?: typeof fetch;
  /** @internal */
  runtime?: Partial<ExwaveRuntime>;
}

export interface ExwaveAuth {
  readonly platformId: string;
  readonly authOrigin: string;
  signUp(input: SignUpInput): Promise<SignUpResult>;
  verifyEmail(input: CodeInput): Promise<Session>;
  /** Reads `?exwave_verify=…&uid=…` or `?exwave_reset=…&uid=…` from the URL (default: the current page). */
  handleEmailLink(url?: string | URL): Promise<EmailLink | null>;
  resendVerification(input: EmailInput): Promise<void>;
  signIn(input: SignInInput): Promise<Session>;
  signOut(options?: { everywhere?: boolean }): Promise<void>;
  resetPassword(input: EmailInput): Promise<void>;
  confirmPasswordReset(input: PasswordResetConfirmInput): Promise<Session>;
  /** A PAT valid for at least 60 s, refreshing if needed; `null` when signed out. */
  getPlayerAccessToken(): Promise<string | null>;
  getSession(): Promise<Session | null>;
  /** Fetches the player from `players/me` with the current PAT. */
  getPlayer(): Promise<Player>;
  /** Calls the listener with `INITIAL_SESSION` once loaded, then on every change. */
  onAuthStateChange(listener: AuthChangeListener): () => void;
  getConfig(): Promise<PlatformConfig>;
  /** Stops timers and cross-tab listeners. */
  close(): void;
}

interface Stored {
  refreshToken: string;
  player: Player;
}

type TabMessage =
  | { type: "SIGNED_IN" | "TOKEN_REFRESHED"; session: Session }
  | { type: "SIGNED_OUT"; reason: SignOutReason };

function defaultRuntime(web: Storage | undefined): ExwaveRuntime {
  const g = globalThis as typeof globalThis & {
    navigator?: { locks?: LockManagerLike };
  };
  return {
    now: () => Date.now(),
    setTimeout(callback, ms) {
      const handle = setTimeout(callback, ms) as { unref?(): void };
      handle.unref?.();
      return handle;
    },
    clearTimeout: (handle) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>),
    locks: g.navigator?.locks,
    channel: (name) =>
      typeof BroadcastChannel === "function"
        ? (new BroadcastChannel(name) as unknown as ChannelLike)
        : undefined,
    onStorageChange(callback) {
      if (!web) return undefined;
      const onStorage = (event: StorageEvent) => {
        if (event.storageArea === web) callback(event.key, event.newValue);
      };
      addEventListener("storage", onStorage);
      return () => removeEventListener("storage", onStorage);
    },
    onVisible(callback) {
      if (typeof document === "undefined") return undefined;
      const onChange = () => {
        if (document.visibilityState === "visible") callback();
      };
      document.addEventListener("visibilitychange", onChange);
      return () => document.removeEventListener("visibilitychange", onChange);
    },
  };
}

export function createExwaveAuth(options: ExwaveAuthOptions): ExwaveAuth {
  const api = createPlayerApi(options.publishableKey, options.fetch);
  const { adapter, web } = resolveStorage(options.storage);
  const rt: ExwaveRuntime = { ...defaultRuntime(web), ...options.runtime };
  const autoRefresh = options.autoRefresh ?? true;
  const multiTab =
    options.multiTab ?? ((options.storage ?? "local") === "local" && !!web);
  const key = `exwave.auth.${api.platformId}`;
  const channel = multiTab
    ? rt.channel(`exwave-auth:${api.platformId}`)
    : undefined;
  const listeners = new Set<AuthChangeListener>();
  const linkFlights = new Map<string, Promise<Session>>();
  let session: Session | null = null;
  let timer: unknown;
  let inflight: Promise<string | null> | undefined;
  let mutex: Promise<unknown> = Promise.resolve();
  let config: { at: number; value: Promise<PlatformConfig> } | undefined;
  let closed = false;

  const isFresh = (
    s: Session | null,
  ): s is Session & { accessToken: string; expiresAt: number } =>
    !!s?.accessToken &&
    !!s.expiresAt &&
    s.expiresAt - rt.now() > REFRESH_MARGIN_MS;

  function emit(event: AuthChangeEvent, info: { reason?: SignOutReason } = {}) {
    for (const listener of [...listeners]) {
      try {
        listener(event, session, info);
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  // One refresh at a time across tabs (Web Locks), or inside this tab without them.
  function withLock<T>(fn: () => Promise<T>): Promise<T> {
    if (rt.locks) return rt.locks.request(key, () => fn());
    const run = mutex.then(fn, fn);
    mutex = run.catch(() => undefined);
    return run;
  }

  async function readStored(): Promise<Stored | null> {
    try {
      const raw = await adapter.getItem(key);
      return raw ? (JSON.parse(raw) as Stored) : null;
    } catch {
      return null;
    }
  }

  async function writeStored(value: Stored | null) {
    try {
      if (value) await adapter.setItem(key, JSON.stringify(value));
      else await adapter.removeItem(key);
    } catch {
      // Full or blocked storage: the session still works in memory.
    }
  }

  function schedule(delay?: number) {
    if (timer !== undefined) rt.clearTimeout(timer);
    timer = undefined;
    if (closed || !autoRefresh || !session) return;
    const wait =
      delay ?? (session.expiresAt ?? 0) - REFRESH_MARGIN_MS - rt.now();
    timer = rt.setTimeout(
      () => {
        timer = undefined;
        refresh().catch(() => undefined);
      },
      Math.max(0, wait),
    );
  }

  function setSession(
    next: Session | null,
    event?: AuthChangeEvent,
    info?: { reason?: SignOutReason },
  ) {
    session = next;
    schedule();
    if (event) emit(event, info);
  }

  async function establish(
    tokens: ApiTokens,
    event: "SIGNED_IN" | "TOKEN_REFRESHED",
  ): Promise<Session> {
    const player = toPlayer(tokens.player);
    // A null refresh token means another tab or request already rotated it:
    // keep what is stored.
    if (tokens.refresh_token)
      await writeStored({ refreshToken: tokens.refresh_token, player });
    const next: Session = {
      player,
      accessToken: tokens.access_token,
      expiresAt: rt.now() + tokens.expires_in * 1000,
    };
    setSession(next, event);
    channel?.postMessage({ type: event, session: next } satisfies TabMessage);
    return next;
  }

  async function end(reason: SignOutReason) {
    await writeStored(null);
    channel?.postMessage({ type: "SIGNED_OUT", reason } satisfies TabMessage);
    if (session) setSession(null, "SIGNED_OUT", { reason });
  }

  function refresh(): Promise<string | null> {
    inflight ??= withLock(async () => {
      // Another tab may have refreshed while this one waited for the lock.
      if (isFresh(session)) return session.accessToken;
      const stored = await readStored();
      if (!stored) {
        if (session) setSession(null, "SIGNED_OUT", { reason: "signed_out" });
        return null;
      }
      try {
        const tokens = await api.refresh(stored.refreshToken);
        const next = await establish(
          tokens,
          session ? "TOKEN_REFRESHED" : "SIGNED_IN",
        );
        return next.accessToken;
      } catch (error) {
        if (isExwaveAuthError(error) && ENDS_SESSION.has(error.code))
          await end(error.code as SignOutReason);
        else
          schedule(
            isExwaveAuthError(error) && error.retryAfter
              ? error.retryAfter * 1000
              : RETRY_MS,
          );
        throw error;
      }
    }).finally(() => {
      inflight = undefined;
    });
    return inflight;
  }

  async function signedIn(tokens: ApiTokens): Promise<Session> {
    await ready;
    return withLock(async () => {
      const previous = await readStored();
      if (previous && previous.refreshToken !== tokens.refresh_token)
        api.signOut(previous.refreshToken).catch(() => undefined);
      return establish(tokens, "SIGNED_IN");
    });
  }

  if (channel)
    channel.onmessage = ({ data }) => {
      const message = data as TabMessage;
      if (message.type === "SIGNED_OUT") {
        if (session) setSession(null, "SIGNED_OUT", { reason: message.reason });
        return;
      }
      const incoming = message.session;
      const samePlayer = session?.player.id === incoming.player.id;
      if (
        samePlayer &&
        session?.expiresAt &&
        (incoming.expiresAt ?? 0) <= session.expiresAt
      )
        return;
      setSession(incoming, samePlayer ? "TOKEN_REFRESHED" : "SIGNED_IN");
    };

  const offStorage = multiTab
    ? rt.onStorageChange((changed, value) => {
        if (changed !== null && changed !== key) return;
        if (value === null) {
          if (session) setSession(null, "SIGNED_OUT", { reason: "signed_out" });
        } else if (!session && !channel) {
          // Without a channel, sign-ins arrive here, with no PAT yet.
          try {
            const { player } = JSON.parse(value) as Stored;
            setSession(
              { player, accessToken: null, expiresAt: null },
              "SIGNED_IN",
            );
          } catch {
            // Not ours.
          }
        }
      })
    : undefined;

  const offVisible = autoRefresh
    ? rt.onVisible(() => {
        if (session && !isFresh(session)) refresh().catch(() => undefined);
      })
    : undefined;

  const ready = (async () => {
    const stored = await readStored();
    if (stored && !session)
      session = { player: stored.player, accessToken: null, expiresAt: null };
    if (session && autoRefresh && !isFresh(session))
      await refresh().catch(() => undefined);
  })();

  const auth: ExwaveAuth = {
    platformId: api.platformId,
    authOrigin: api.authOrigin,
    signUp: (input) => api.signUp(input),
    async verifyEmail(input) {
      return signedIn(await api.verifyEmail(input));
    },
    async handleEmailLink(url) {
      const href = url ?? globalThis.location?.href;
      if (!href) return null;
      const params = new URL(href).searchParams;
      const userId = params.get("uid");
      const reset = params.get("exwave_reset");
      const verify = params.get("exwave_verify");
      if (!userId) return null;
      if (reset) return { type: "password_reset", userId, code: reset };
      if (!verify) return null;
      // Codes work once: share one call between repeated handlers (React Strict Mode).
      let flight = linkFlights.get(verify);
      if (!flight) {
        flight = auth.verifyEmail({ userId, code: verify });
        linkFlights.set(verify, flight);
        flight.catch(() => linkFlights.delete(verify));
      }
      return { type: "email_verified", session: await flight };
    },
    resendVerification: (input) => api.resendVerification(input),
    async signIn(input) {
      return signedIn(await api.signIn(input));
    },
    async signOut({ everywhere = false } = {}) {
      await ready;
      await withLock(async () => {
        const stored = await readStored();
        try {
          if (stored) await api.signOut(stored.refreshToken, everywhere);
        } catch (error) {
          // Signing out here works offline; everywhere needs the API.
          if (everywhere) throw error;
        } finally {
          await end("signed_out");
        }
      });
    },
    resetPassword: (input) => api.resetPassword(input),
    async confirmPasswordReset(input) {
      return signedIn(await api.confirmPasswordReset(input));
    },
    async getPlayerAccessToken() {
      await ready;
      if (isFresh(session)) return session.accessToken;
      try {
        return await refresh();
      } catch (error) {
        // A failed refresh for a passing reason keeps a PAT that still works.
        const current = session as Session | null;
        if (current?.accessToken && (current.expiresAt ?? 0) > rt.now())
          return current.accessToken;
        throw error;
      }
    },
    async getSession() {
      await ready;
      return session;
    },
    async getPlayer() {
      const token = await auth.getPlayerAccessToken();
      if (!token) throw new ExwaveAuthError("not_signed_in");
      return api.me(token);
    },
    onAuthStateChange(listener) {
      let active = true;
      ready.then(() => {
        if (!active) return;
        listeners.add(listener);
        listener("INITIAL_SESSION", session, {});
      });
      return () => {
        active = false;
        listeners.delete(listener);
      };
    },
    getConfig() {
      if (!config || rt.now() - config.at > CONFIG_TTL_MS) {
        const value = api.config();
        config = { at: rt.now(), value };
        value.catch(() => {
          config = undefined;
        });
      }
      return config.value;
    },
    close() {
      closed = true;
      schedule();
      listeners.clear();
      channel?.close();
      offStorage?.();
      offVisible?.();
    },
  };
  return auth;
}
