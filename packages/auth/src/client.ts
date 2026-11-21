import { type ApiTokens, createPlayerApi, toUser } from "./api";
import { parseEmailLink } from "./email-link";
import { ExwaveAuthError, isExwaveAuthError } from "./errors";
import { resolveStorage, type StorageOption } from "./storage";
import type {
  CodeInput,
  EmailInput,
  EmailLink,
  PasswordResetConfirmInput,
  PlatformConfig,
  Session,
  SignInInput,
  SignUpInput,
  SignUpResult,
  User,
} from "./types";

/** Refresh the PAT this long before it expires. */
export const REFRESH_MARGIN_MS = 60_000;
const RETRY_MS = 10_000;
/** Auth serves config with `max-age=60`. */
export const CONFIG_TTL_MS = 60_000;

export type AuthChangeEvent =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED";

/**
 * Why the user is signed out:
 * - `signed_out`: they signed out on this device;
 * - `signed_out_everywhere`: they signed out on every device, from this one;
 * - `invalid_refresh_token`: the session ended elsewhere (sign out everywhere
 *   or a password reset on another device) or expired;
 * - `account_locked`: the platform locked the account (Nexus → Auth → Users).
 */
export type SignOutReason =
  | "signed_out"
  | "signed_out_everywhere"
  | "invalid_refresh_token"
  | "account_locked";

/** The reason an API error ends the session for, or `undefined` when it doesn't. */
export function toSignOutReason(
  code: string,
): "invalid_refresh_token" | "account_locked" | undefined {
  if (code === "invalid_refresh_token") return code;
  // The API's code for a locked account.
  if (code === "player_locked") return "account_locked";
  return undefined;
}

/** How long a reload or a new tab still reports why the last session ended. */
export const SIGN_OUT_REASON_TTL_MS = 5 * 60_000;

/**
 * `info.reason` says why the user is signed out: on `SIGNED_OUT`, and on
 * `INITIAL_SESSION` when the stored session ended while loading or in the
 * last 5 minutes (in any tab). `info.source` is `"server"` when the change
 * came from the server's view of the session (`hydrate()`), not from this
 * page or another tab.
 */
export type AuthChangeListener = (
  event: AuthChangeEvent,
  session: Session | null,
  info: AuthChangeInfo,
) => void;

export interface AuthChangeInfo {
  reason?: SignOutReason;
  source?: "server";
}

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

/**
 * What the browser client and the route client share, so hooks and
 * components work with either: `"browser"` talks to Exwave Auth from the
 * page, `"route"` to your server's `/api/exwave/*` routes.
 */
export interface ExwaveAuthClient {
  readonly mode: "browser" | "route";
  signUp(input: SignUpInput): Promise<SignUpResult>;
  verifyEmail(input: CodeInput): Promise<Session>;
  /** Reads `?exwave_verify=…&uid=…` or `?exwave_reset=…&uid=…` from the URL (default: the current page). */
  handleEmailLink(url?: string | URL): Promise<EmailLink | null>;
  resendVerification(input: EmailInput): Promise<void>;
  signIn(input: SignInInput): Promise<Session>;
  /** Signs out here, or on every device (`SIGNED_OUT` with `signed_out_everywhere`). */
  signOut(options?: { everywhere?: boolean }): Promise<void>;
  resetPassword(input: EmailInput): Promise<void>;
  confirmPasswordReset(input: PasswordResetConfirmInput): Promise<Session>;
  /**
   * A player access token (PAT) valid for at least 60 s, refreshing if
   * needed; `null` when signed out. PATs authenticate to games.
   */
  getPlayerAccessToken(): Promise<string | null>;
  getSession(): Promise<Session | null>;
  /** Calls the listener with `INITIAL_SESSION` once loaded, then on every change. */
  onAuthStateChange(listener: AuthChangeListener): () => void;
  getConfig(): Promise<PlatformConfig>;
  /** Stops timers and cross-tab listeners. */
  close(): void;
}

/** The browser client: talks to Exwave Auth from the page. */
export interface ExwaveAuth extends ExwaveAuthClient {
  readonly mode: "browser";
  readonly platformId: string;
  readonly authOrigin: string;
  /** Fetches the user from `players/me` with the current PAT. */
  getUser(): Promise<User>;
}

interface Stored {
  refreshToken: string;
  user: User;
}

/** Left in storage when a session ends, so other tabs and reloads learn why. */
interface Ended {
  ended: SignOutReason;
  at: number;
}

type Entry = Partial<Stored & Ended>;

const parse = (raw: string | null): Entry => {
  try {
    return (raw && JSON.parse(raw)) || {};
  } catch {
    return {};
  }
};

const isStored = (entry: Entry): entry is Stored =>
  !!(entry.refreshToken && entry.user);

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
  let lastReason: SignOutReason | undefined;
  let closed = false;

  const isFresh = (
    s: Session | null,
  ): s is Session & { accessToken: string; expiresAt: number } =>
    !!s?.accessToken &&
    !!s.expiresAt &&
    s.expiresAt - rt.now() > REFRESH_MARGIN_MS;

  function emit(event: AuthChangeEvent, info: AuthChangeInfo = {}) {
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

  async function readEntry(): Promise<Entry> {
    try {
      return parse(await adapter.getItem(key));
    } catch {
      return {};
    }
  }

  async function write(value: Stored | Ended) {
    try {
      await adapter.setItem(key, JSON.stringify(value));
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

  // Sessions end with a reason and start without one.
  function setSession(
    next: Session | null,
    event?: AuthChangeEvent,
    info: { reason?: SignOutReason } = {},
  ) {
    session = next;
    lastReason = info.reason;
    schedule();
    if (event) emit(event, info);
  }

  async function establish(
    tokens: ApiTokens,
    event: "SIGNED_IN" | "TOKEN_REFRESHED",
  ): Promise<Session> {
    const user = toUser(tokens.player);
    // A null refresh token means another tab or request already rotated it:
    // keep what is stored.
    if (tokens.refresh_token)
      await write({ refreshToken: tokens.refresh_token, user });
    const next: Session = {
      user,
      accessToken: tokens.access_token,
      expiresAt: rt.now() + tokens.expires_in * 1000,
    };
    setSession(next, event);
    channel?.postMessage({ type: event, session: next } satisfies TabMessage);
    return next;
  }

  async function end(reason: SignOutReason) {
    await write({ ended: reason, at: rt.now() });
    channel?.postMessage({ type: "SIGNED_OUT", reason } satisfies TabMessage);
    if (session) setSession(null, "SIGNED_OUT", { reason });
  }

  function refresh(): Promise<string | null> {
    inflight ??= withLock(async () => {
      // Another tab may have refreshed while this one waited for the lock.
      if (isFresh(session)) return session.accessToken;
      // Ended here or in another tab, maybe while this one waited.
      const stored = await readEntry();
      if (!isStored(stored)) {
        if (session)
          setSession(null, "SIGNED_OUT", {
            reason: stored.ended ?? "signed_out",
          });
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
        const reason = isExwaveAuthError(error)
          ? toSignOutReason(error.code)
          : undefined;
        if (reason) await end(reason);
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
      const previous = (await readEntry()).refreshToken;
      if (previous && previous !== tokens.refresh_token)
        api.signOut(previous).catch(() => undefined);
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
      const sameUser = session?.user.id === incoming.user.id;
      if (
        sameUser &&
        session?.expiresAt &&
        (incoming.expiresAt ?? 0) <= session.expiresAt
      )
        return;
      setSession(incoming, sameUser ? "TOKEN_REFRESHED" : "SIGNED_IN");
    };

  const offStorage = multiTab
    ? rt.onStorageChange((changed, value) => {
        if (changed !== null && changed !== key) return;
        const entry = parse(value);
        if (!isStored(entry)) {
          // Often ahead of the channel's message: take the reason from storage.
          if (session)
            setSession(null, "SIGNED_OUT", {
              reason: entry.ended ?? "signed_out",
            });
        } else if (!session && !channel)
          // Without a channel, sign-ins arrive here, with no PAT yet.
          setSession(
            { user: entry.user, accessToken: null, expiresAt: null },
            "SIGNED_IN",
          );
      })
    : undefined;

  const offVisible = autoRefresh
    ? rt.onVisible(() => {
        if (session && !isFresh(session)) refresh().catch(() => undefined);
      })
    : undefined;

  const ready = (async () => {
    const stored = await readEntry();
    if (!session && isStored(stored))
      session = { user: stored.user, accessToken: null, expiresAt: null };
    else if (
      !session &&
      stored.ended &&
      rt.now() - (stored.at ?? 0) < SIGN_OUT_REASON_TTL_MS
    )
      lastReason = stored.ended;
    if (session && autoRefresh && !isFresh(session))
      await refresh().catch(() => undefined);
  })();

  const auth: ExwaveAuth = {
    mode: "browser",
    platformId: api.platformId,
    authOrigin: api.authOrigin,
    signUp: (input) => api.signUp(input),
    async verifyEmail(input) {
      return signedIn(await api.verifyEmail(input));
    },
    async handleEmailLink(url) {
      const href = url ?? globalThis.location?.href;
      const link = href ? parseEmailLink(href) : null;
      if (!link) return null;
      const { userId, code } = link;
      if (link.type === "reset")
        return { type: "password_reset", userId, code };
      // Codes work once: share one call between repeated handlers (React Strict Mode).
      let flight = linkFlights.get(code);
      if (!flight) {
        flight = auth.verifyEmail({ userId, code });
        linkFlights.set(code, flight);
        flight.catch(() => linkFlights.delete(code));
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
        const { refreshToken } = await readEntry();
        let reason: SignOutReason = "signed_out";
        try {
          if (refreshToken) {
            await api.signOut(refreshToken, everywhere);
            if (everywhere) reason = "signed_out_everywhere";
          }
        } catch (error) {
          // Signing out here works offline; everywhere needs the API.
          if (everywhere) throw error;
        } finally {
          await end(reason);
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
    async getUser() {
      const token = await auth.getPlayerAccessToken();
      if (!token) throw new ExwaveAuthError("not_signed_in");
      return api.me(token);
    },
    onAuthStateChange(listener) {
      let active = true;
      ready.then(() => {
        if (!active) return;
        listeners.add(listener);
        listener("INITIAL_SESSION", session, { reason: lastReason });
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
